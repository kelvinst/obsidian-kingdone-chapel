import { MarkdownView, Notice, Plugin, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { PaneType } from 'obsidian';

import { DEFAULT_SETTINGS, VIEW_TYPE } from './types';
import type { KingdoneChapelSettings, Location, Verse, VersionItem } from './types';
import { escapeRegex, pad3 } from './utils';
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
        this.registerVersionCommands();
        this.chapterCache.clear();
        new Notice(`Versions found: ${this.listVersions().join(', ') || 'none'}`);
      },
    });

    this.registerEvent(this.app.vault.on('modify', (file) => this.chapterCache.delete(file.path)));

    this.registerDomEvent(document, 'click', (evt) => this.lockPreviewVerse(evt));

    if (this.settings.openSidebarOnStart) {
      this.app.workspace.onLayoutReady(() => this.activateView(false));
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshViews();
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

  /** Version folders = direct subfolders of the bible folder that contain book subfolders. */
  listVersions(): string[] {
    const root = this.app.vault.getAbstractFileByPath(this.settings.bibleFolder);
    if (!(root instanceof TFolder)) return [];
    return root.children
      .filter((c): c is TFolder => c instanceof TFolder)
      .filter((c) => c.children.some((sub) => sub instanceof TFolder))
      .map((c) => c.name)
      .filter((name) => !this.settings.hiddenVersions.includes(name))
      .sort();
  }

  /**
   * Parse the active file into { version, bookFolder, chapter, verse }.
   * Expects <bibleFolder>/<VERSION>/<NN-Book>/<VERSION>-<NN-Book>-<CCC>.md
   */
  currentLocation(): Location | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) return this.remember(this.keepVerse(this.locationOf(view.file, view)));

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
    if (parts.length !== 3) return null;

    const [version, bookFolder, filename] = parts;
    const name = filename.replace(/\.md$/, '');
    const re = new RegExp(`^${escapeRegex(version)}-${escapeRegex(bookFolder)}-(\\d+)$`);
    const m = name.match(re);
    if (!m) return null;

    return {
      version,
      bookFolder,
      book: bookFolder.replace(/^\d+-/, ''),
      chapter: parseInt(m[1], 10),
      verse: this.currentVerse(view),
      file,
    };
  }

  /** Verse being read: the cursor while editing, the rendered page while reading. */
  currentVerse(view: MarkdownView | null): number | null {
    if (!view) return null;
    return view.getMode() === 'preview' ? this.previewVerse(view) : this.cursorVerse(view);
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
    if (lock && view.file && lock.path === view.file.path) {
      if (Math.abs(scroller.scrollTop - lock.scrollTop) <= SCROLL_SLACK) return lock.verse;
      this.previewLock = null;
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
    const dir = `${this.settings.bibleFolder}/${version}/${loc.bookFolder}`;
    const candidates = [
      `${dir}/${version}-${loc.bookFolder}-${pad3(loc.chapter)}.md`,
      `${dir}/${version}-${loc.bookFolder}-${loc.chapter}.md`,
      `${dir}/${version}-${loc.bookFolder}-000.md`, // commentaries: one file per book
    ];
    for (const path of candidates) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) return f;
    }
    // Last resort: any file in the book folder ending with the chapter number.
    const folder = this.app.vault.getAbstractFileByPath(dir);
    if (folder instanceof TFolder) {
      const re = new RegExp(`-0*${loc.chapter}$`);
      const hit = folder.children.find((c): c is TFile => c instanceof TFile && re.test(c.basename));
      if (hit) return hit;
    }
    return null;
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
      new Notice(`${this.label(version)} has no ${loc.book || loc.bookFolder} ${loc.chapter}.`);
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
