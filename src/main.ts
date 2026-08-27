import { MarkdownView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { PaneType } from 'obsidian';

import { DEFAULT_SETTINGS, VIEW_TYPE } from './types';
import type { KingdoneChapelSettings, Location, Verse, VersionItem } from './types';
import { chapterKey, parseChapterName } from './utils';
import { VersionSuggestModal } from './modal';
import { KingdoneChapelSettingTab } from './settings';
import { KingdoneChapelView } from './view';

/** How far below the top of a reading pane a verse still counts as the one being read. */
const PREVIEW_TOP_OFFSET = 48;
/** Scroll movement (px) that releases a verse clicked in reading mode. */
const SCROLL_SLACK = 4;

export default class KingdoneChapelPlugin extends Plugin {
  settings: KingdoneChapelSettings;
  /** path -> { mtime, verses } */
  chapterCache: Map<string, { mtime: number; verses: Verse[] }>;
  /** version -> "book:chapter" -> file. Built lazily, dropped on vault changes. */
  bibleIndex: Map<string, Map<string, TFile>> | null = null;
  /** "version/book:chapter" -> the files fighting over it. Filled by index(). */
  chapterConflicts: Map<string, TFile[]> = new Map();
  /** The conflicts the user was last warned about, so each is only said once. */
  warnedConflicts = '';
  /** Last location read from a real editor, kept for when focus leaves it. */
  lastLocation: Location | null = null;
  /** Verse clicked in reading mode, held until that pane scrolls again. */
  previewLock: { path: string; verse: number; scrollTop: number } | null = null;

  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.chapterCache = new Map();

    this.addSettingTab(new KingdoneChapelSettingTab(this.app, this));

    this.registerView(VIEW_TYPE, (leaf) => new KingdoneChapelView(leaf, this));

    this.addCommand({
      id: 'open-verse-in-another-version',
      name: 'Open this verse in another version',
      callback: () => this.promptVersion(),
    });

    this.addCommand({
      id: 'open-sidebar',
      name: 'Open versions sidebar',
      callback: () => this.activateView(),
    });

    this.addRibbonIcon('book-open', 'Kingdone Chapel sidebar', () => this.activateView());

    // One command per version, so each can get its own hotkey.
    this.registerVersionCommands();

    this.addCommand({
      id: 'reload-versions',
      name: 'Reload version list',
      callback: () => {
        this.invalidateIndex();
        this.registerVersionCommands();
        this.chapterCache.clear();
        new Notice(`Versions found: ${this.listVersions().join(', ') || 'none'}`);
      },
    });

    this.registerEvent(this.app.vault.on('modify', (file) => this.chapterCache.delete(file.path)));
    this.registerEvent(this.app.vault.on('create', () => this.invalidateIndex()));
    this.registerEvent(this.app.vault.on('delete', () => this.invalidateIndex()));
    this.registerEvent(this.app.vault.on('rename', () => this.invalidateIndex()));

    this.registerDomEvent(document, 'click', (evt) => this.lockPreviewVerse(evt));

    if (this.settings.openSidebarOnStart) {
      this.app.workspace.onLayoutReady(() => this.activateView(false));
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.invalidateIndex();
    this.refreshViews();
  }

  invalidateIndex() {
    this.bibleIndex = null;
  }

  /**
   * Every chapter file under the Bible folder, grouped by version.
   *
   * Only two things are structural: the direct subfolders of the Bible folder
   * are the versions, and file names follow `<VERSION>-<NN>-<Book>-<CCC>`.
   * Whatever folders a version uses in between are ignored, so each version can
   * be laid out flat, split by testament, or grouped any other way.
   */
  index(): Map<string, Map<string, TFile>> {
    if (this.bibleIndex) return this.bibleIndex;

    const index = new Map<string, Map<string, TFile>>();
    const conflicts = new Map<string, TFile[]>();
    const base = this.settings.bibleFolder;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(base + '/')) continue;
      const parts = file.path.slice(base.length + 1).split('/');
      if (parts.length < 2) continue; // a loose file straight in the Bible folder

      const version = parts[0];
      const parsed = parseChapterName(file.basename, version);
      if (!parsed) continue;

      let chapters = index.get(version);
      if (!chapters) index.set(version, (chapters = new Map()));
      const key = chapterKey(parsed.bookIndex, parsed.chapter);

      // Two files for one chapter is a mistake in the vault, and only the user
      // knows which one to keep. Take neither, and say so.
      const clash = conflicts.get(`${version}/${key}`);
      if (clash) {
        clash.push(file);
        continue;
      }
      const current = chapters.get(key);
      if (current) {
        chapters.delete(key);
        conflicts.set(`${version}/${key}`, [current, file]);
        continue;
      }
      chapters.set(key, file);
    }

    this.bibleIndex = index;
    this.chapterConflicts = conflicts;
    this.warnAboutConflicts();
    return index;
  }

  /** The files claiming `loc` in `version`, when more than one does. */
  conflictFor(version: string, loc: Location): TFile[] | null {
    this.index(); // conflicts are a by-product of building it
    for (const chapter of [loc.chapter, 0]) {
      const clash = this.chapterConflicts.get(`${version}/${chapterKey(loc.bookIndex, chapter)}`);
      if (clash) return clash;
    }
    return null;
  }

  /** Notice the user once per set of duplicates, when the index is rebuilt. */
  warnAboutConflicts() {
    const signature = Array.from(this.chapterConflicts.keys()).sort().join('|');
    if (signature === this.warnedConflicts) return;
    this.warnedConflicts = signature;
    if (!this.chapterConflicts.size) return;

    const names = Array.from(this.chapterConflicts.values(), (files) =>
      files.map((f) => f.basename).join(' / ')
    );
    const shown = names.slice(0, 3).join('\n');
    const rest = names.length > 3 ? `\n...and ${names.length - 3} more` : '';
    new Notice(
      `Kingdone Chapel: more than one file for the same chapter. Rename or remove one of each:\n${shown}${rest}`,
      10000
    );
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof KingdoneChapelView) leaf.view.refresh(true);
    }
  }

  async activateView(reveal = true): Promise<WorkspaceLeaf | null> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      if (reveal) this.app.workspace.revealLeaf(existing[0]);
      return existing[0];
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return null;
    await leaf.setViewState({ type: VIEW_TYPE, active: reveal });
    if (reveal) this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  registerVersionCommands() {
    for (const version of this.listVersions()) {
      this.addCommand({
        id: `open-in-${version.toLowerCase()}`,
        name: `Open this verse in ${this.label(version)}`,
        checkCallback: (checking) => {
          const loc = this.currentLocation();
          if (!loc || loc.version === version) return false;
          if (!checking) this.jumpTo(version, loc);
          return true;
        },
      });
    }
  }

  label(version: string): string {
    return this.settings.labels[version] || version;
  }

  /** Versions = direct subfolders of the Bible folder holding chapter files. */
  listVersions(): string[] {
    const root = this.app.vault.getAbstractFileByPath(this.settings.bibleFolder);
    if (!(root instanceof TFolder)) return [];
    const index = this.index();
    return root.children
      .filter((c): c is TFolder => c instanceof TFolder)
      .map((c) => c.name)
      .filter((name) => index.has(name))
      .filter((name) => !this.settings.hiddenVersions.includes(name))
      .sort();
  }

  /**
   * Parse the active file into { version, bookIndex, book, chapter, verse }.
   * Expects <bibleFolder>/<VERSION>/<any folders>/<VERSION>-<NN>-<Book>-<CCC>.md
   */
  currentLocation(): Location | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const loc = this.locationOf(view.file, view);
      // Only reading mode needs the guard below; a cursor above verse 1 really has no verse.
      return this.remember(view.getMode() === 'preview' ? this.keepVerse(loc) : loc);
    }

    // Focus is on something that is not an editor (the sidebar itself, a modal,
    // the file explorer...). There is no editor to read the cursor from, so the
    // verse would come back null and the sidebar would snap to verse 1. Reuse
    // the last location instead, as long as it is still the active file.
    const file = this.app.workspace.getActiveFile();
    if (this.lastLocation && file && this.lastLocation.file.path === file.path) {
      return this.lastLocation;
    }
    return this.remember(this.locationOf(file, null));
  }

  /**
   * Reading mode renders lazily, so right after a mode switch the verse can come
   * back null for a frame. Keep the verse we already had instead of snapping to 1.
   */
  keepVerse(loc: Location | null): Location | null {
    const last = this.lastLocation;
    if (loc && loc.verse === null && last && last.verse && last.file.path === loc.file.path) {
      loc.verse = last.verse;
    }
    return loc;
  }

  remember(loc: Location | null): Location | null {
    this.lastLocation = loc;
    return loc;
  }

  locationOf(file: TFile | null, view: MarkdownView | null): Location | null {
    if (!file) return null;

    const base = this.settings.bibleFolder;
    if (!file.path.startsWith(base + '/')) return null;

    const parts = file.path.slice(base.length + 1).split('/');
    if (parts.length < 2) return null; // a loose file straight in the Bible folder

    const parsed = parseChapterName(file.basename, parts[0]);
    if (!parsed) return null;

    return {
      version: parsed.version,
      bookIndex: parsed.bookIndex,
      book: parsed.book,
      chapter: parsed.chapter,
      verse: this.currentVerse(view),
      file,
    };
  }

  /** Verse being read: the cursor while editing, the rendered page while reading. */
  currentVerse(view: MarkdownView | null): number | null {
    if (!view) return null;
    if (view.getMode() === 'preview') return this.previewVerse(view);
    this.previewLock = null; // leaving reading mode drops the clicked verse
    return this.cursorVerse(view);
  }

  /** Verse number at the cursor: nearest **N** at or above the cursor line. */
  cursorVerse(view: MarkdownView): number | null {
    const editor = view.editor;
    if (!editor) return null;
    let line: number;
    try {
      // A selection spanning verses belongs to the one it starts on, not the one
      // the drag ended on (`getCursor()` alone returns the head of the selection).
      line = editor.getCursor(editor.somethingSelected() ? 'from' : 'head').line;
    } catch (e) {
      return null;
    }
    for (let i = line; i >= 0; i--) {
      const m = editor.getLine(i).match(/^\s*\*\*(\d+)\*\*/);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  }

  /**
   * Reading mode has no cursor: the verse is the one clicked last, or, once the
   * pane scrolls again, the topmost one still on screen.
   */
  previewVerse(view: MarkdownView): number | null {
    const scroller = this.previewScroller(view);
    if (!scroller) return null;

    // Selected text wins: a drag across verses points at the one it starts on.
    const selected = this.selectionParagraph(scroller);
    if (selected) {
      const verse = this.verseOf(selected);
      if (verse !== null) return verse;
    }

    const lock = this.previewLock;
    if (lock) {
      const held =
        !!view.file &&
        lock.path === view.file.path &&
        Math.abs(scroller.scrollTop - lock.scrollTop) <= SCROLL_SLACK;
      if (held) return lock.verse;
      this.previewLock = null; // another file, or this pane has scrolled on
    }

    const items = this.verseParagraphs(scroller);
    if (!items.length) return null;

    // The paragraphs are in document order, so their tops are sorted: binary search
    // instead of measuring all of them (Psalm 119 has 176, and the sidebar polls).
    const limit = scroller.getBoundingClientRect().top + PREVIEW_TOP_OFFSET;
    let lo = 0;
    let hi = items.length - 1;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].el.getBoundingClientRect().top <= limit) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return items[best].verse;
  }

  /** Clicking a verse in reading mode holds the sidebar on it until the pane scrolls. */
  lockPreviewVerse(evt: MouseEvent) {
    const target = evt.target instanceof Element ? evt.target : null;
    if (!target || target.closest('a')) return; // links keep navigating untouched

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file || view.getMode() !== 'preview') return;

    const scroller = this.previewScroller(view);
    if (!scroller || !scroller.contains(target)) return;

    const para = target.closest('.markdown-preview-sizer p');
    const verse = para ? this.verseOf(para) : null;
    this.previewLock =
      verse === null ? null : { path: view.file.path, verse, scrollTop: scroller.scrollTop };
  }

  /** Verse paragraph the selection starts in, when text is selected in this pane. */
  selectionParagraph(scroller: HTMLElement): HTMLElement | null {
    const win = scroller.ownerDocument.defaultView;
    const sel = win && win.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

    const node = sel.getRangeAt(0).startContainer; // always the earlier end of the range
    if (!scroller.contains(node)) return null;

    const el = node instanceof Element ? node : node.parentElement;
    return el ? el.closest<HTMLElement>('.markdown-preview-sizer p') : null;
  }

  /** The scrolling element of a reading pane, verse positions are measured against it. */
  previewScroller(view: MarkdownView): HTMLElement | null {
    const container = view.previewMode && view.previewMode.containerEl;
    if (!container) return null;
    return container.querySelector<HTMLElement>('.markdown-preview-view') || container;
  }

  /** Verse paragraphs of a reading pane, in document order. */
  verseParagraphs(scroller: HTMLElement): { verse: number; el: HTMLElement }[] {
    const out: { verse: number; el: HTMLElement }[] = [];
    for (const el of Array.from(scroller.querySelectorAll<HTMLElement>('.markdown-preview-sizer p'))) {
      const verse = this.verseOf(el);
      if (verse !== null) out.push({ verse, el });
    }
    return out;
  }

  /** Verse number of a rendered `**N** text` paragraph, if that is what `el` is. */
  verseOf(el: Element): number | null {
    const strong = el.firstElementChild;
    if (!strong || strong.tagName !== 'STRONG') return null;
    const m = (strong.textContent || '').trim().match(/^(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }

  /** Resolve the chapter file of `version` matching the current location. */
  targetFile(version: string, loc: Location): TFile | null {
    const chapters = this.index().get(version);
    if (!chapters) return null;
    return (
      chapters.get(chapterKey(loc.bookIndex, loc.chapter)) ||
      // Commentaries keep a single -000 file per book.
      chapters.get(chapterKey(loc.bookIndex, 0)) ||
      null
    );
  }

  /** Block ids of a file (from metadata cache, falling back to reading it). */
  async blockIds(file: TFile): Promise<string[]> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache && cache.blocks) {
      const ids = Object.keys(cache.blocks);
      if (ids.length) return ids;
    }
    const content = await this.app.vault.cachedRead(file);
    return (content.match(/\^[A-Za-z0-9-]+\s*$/gm) || []).map((s) => s.trim().slice(1));
  }

  /**
   * Block id in `file` for chapter/verse. Versions like MENS merge verses
   * (1-2 under **1**), so fall back to the closest anchor before the verse.
   */
  async findAnchor(file: TFile, chapter: number, verse: number | null): Promise<string | null> {
    if (!verse) return null;
    const ids = await this.blockIds(file);
    const re = new RegExp(`-${chapter}-(\\d+)$`);
    let best: string | null = null;
    let bestVerse = -1;
    for (const id of ids) {
      const m = id.match(re);
      if (!m) continue;
      const v = parseInt(m[1], 10);
      if (v === verse) return id;
      if (v < verse && v > bestVerse) {
        bestVerse = v;
        best = id;
      }
    }
    return best;
  }

  /** Parsed verses of a chapter file, cached until the file changes. */
  async chapterVerses(file: TFile): Promise<Verse[]> {
    const hit = this.chapterCache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.verses;

    const content = await this.app.vault.cachedRead(file);
    const verses: Verse[] = [];
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*\*\*(\d+)\*\*\s*(.*)$/);
      if (!m) continue;
      verses.push({
        verse: parseInt(m[1], 10),
        text: m[2].replace(/\s*\^[A-Za-z0-9-]+\s*$/, '').trim(),
      });
    }
    this.chapterCache.set(file.path, { mtime: file.stat.mtime, verses });
    return verses;
  }

  /**
   * Verse of `file` matching `verse`, or the closest one before it
   * (versions like MENS merge verses under a single number).
   */
  async verseIn(file: TFile, verse: number | null): Promise<Verse | null> {
    const verses = await this.chapterVerses(file);
    if (!verses.length) return null;
    if (!verse) return verses[0];
    let best: Verse | null = null;
    for (const v of verses) {
      if (v.verse === verse) return v;
      if (v.verse < verse && (!best || v.verse > best.verse)) best = v;
    }
    return best || verses[0];
  }

  /** One entry per available version for `loc`, for the sidebar and the picker. */
  async versionsFor(loc: Location, includeCurrent: boolean): Promise<VersionItem[]> {
    const out: VersionItem[] = [];
    for (const version of this.listVersions()) {
      if (!includeCurrent && version === loc.version) continue;
      const file = this.targetFile(version, loc);
      if (!file) continue;
      const match = await this.verseIn(file, loc.verse);
      out.push({
        version,
        label: this.label(version),
        file,
        text: match ? match.text : '',
        matchedVerse: match ? match.verse : null,
        isCurrent: version === loc.version,
      });
    }
    return out;
  }

  async jumpTo(version: string, loc: Location, newLeaf?: PaneType | boolean) {
    const file = this.targetFile(version, loc);
    if (!file) {
      const clash = this.conflictFor(version, loc);
      new Notice(
        clash
          ? `${this.label(version)} has ${clash.length} files for ${loc.book} ${loc.chapter}: ` +
            `${clash.map((f) => f.basename).join(', ')}. Rename or remove one.`
          : `${this.label(version)} has no ${loc.book} ${loc.chapter}.`
      );
      return;
    }
    const anchor = await this.findAnchor(file, loc.chapter, loc.verse);
    const link = anchor ? `${file.path}#^${anchor}` : file.path;
    const leaf = newLeaf === undefined ? this.settings.openInNewTab : newLeaf;
    await this.app.workspace.openLinkText(link, loc.file ? loc.file.path : '', leaf);
  }

  async promptVersion() {
    const loc = this.currentLocation();
    if (!loc) {
      new Notice('Open a Bible chapter first.');
      return;
    }
    const items = await this.versionsFor(loc, false);
    if (!items.length) {
      new Notice('No other version has this passage.');
      return;
    }
    new VersionSuggestModal(this.app, this, loc, items).open();
  }
}
