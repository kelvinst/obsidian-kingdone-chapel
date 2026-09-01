import {
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  getLinkpath,
} from 'obsidian';
import type { PaneType } from 'obsidian';

import { DEFAULT_SETTINGS, VIEW_TYPE } from './types';
import type {
  ChapterRef,
  ChapterTarget,
  KingdoneChapelSettings,
  Location,
  Verse,
  VersionItem,
} from './types';
import {
  chapterFileName,
  chapterKey,
  parseBookName,
  parseChapterName,
  parseVerseLine,
  parseVerses,
} from './utils';
import { bookName, bookNameAt, nameLang, translationsName } from './books';
import { VersionSuggestModal } from './modal';
import { CreateVersionModal } from './create-modal';
import { ReferenceSuggest } from './suggest';
import { KingdoneChapelSettingTab } from './settings';
import { KingdoneChapelView } from './view';
import { Breadcrumbs } from './breadcrumbs';
import {
  collectSources,
  declaresSource,
  sortSources,
  sourceOf,
} from './sources';
import type { Source } from './sources';

/** Rendered elements a verse can be: a list item now, a paragraph in older chapters. */
const VERSE_SELECTOR = '.markdown-preview-sizer li, .markdown-preview-sizer p';

/** How far below the top of a reading pane a verse still counts as the one being read. */
const PREVIEW_TOP_OFFSET = 48;
/** Scroll movement (px) that releases a verse clicked in reading mode. */
const SCROLL_SLACK = 4;

/**
 * File `key` in `into`, unless another file already claims it.
 *
 * Two files for one chapter — or for one book — is a mistake in the vault, and
 * only the user knows which of them to keep. Take neither, and record the pair
 * under `conflictKey` so it can be reported.
 */
function claim<K>(
  into: Map<K, TFile>,
  key: K,
  conflicts: Map<string, TFile[]>,
  conflictKey: string,
  file: TFile,
) {
  const clash = conflicts.get(conflictKey);
  if (clash) {
    clash.push(file);
    return;
  }
  const current = into.get(key);
  if (current) {
    into.delete(key);
    conflicts.set(conflictKey, [current, file]);
    return;
  }
  into.set(key, file);
}

export default class KingdoneChapelPlugin extends Plugin {
  settings: KingdoneChapelSettings;
  /** path -> { mtime, verses } */
  chapterCache: Map<string, { mtime: number; verses: Verse[] }>;
  /** version -> "book:chapter" -> file. Built lazily, dropped on vault changes. */
  bibleIndex: Map<string, Map<string, TFile>> | null = null;
  /** Every version folder, by its path. Built with `sourceCodes`. */
  sourceFolders: Map<string, Source> | null = null;
  /** The same folders, by the name their files are prefixed with. */
  sourceCodes: Map<string, Source> = new Map();
  /** The notes that declared a folder a version, by path. Built with them. */
  declaringNotes: Set<string> = new Set();
  /** version -> book number -> the note listing that book's chapters. */
  bookNotes: Map<string, Map<number, TFile>> = new Map();
  /** version -> every chapter it holds, in reading order. Built on demand. */
  chapterOrders: Map<string, ChapterRef[]> = new Map();
  /** The `Version > Book > Chapter` bar of every pane reading a chapter. */
  breadcrumbs: Breadcrumbs;
  /** A breadcrumb refresh waiting out a run of vault changes, if one is. */
  queuedRefresh: number | null = null;
  /** "version/book:chapter" -> the files fighting over it. Filled by index(). */
  chapterConflicts: Map<string, TFile[]> = new Map();
  /** The conflicts the user was last warned about, so each is only said once. */
  warnedConflicts = '';
  /** Last location read from a real editor, kept for when focus leaves it. */
  lastLocation: Location | null = null;
  /** Verse clicked in reading mode, held until that pane scrolls again. */
  previewLock: { path: string; verse: number; scrollTop: number } | null = null;

  async onload() {
    const stored = ((await this.loadData()) || {}) as Record<string, unknown>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    // The folder was named `bibleFolder` while it was what made a folder a
    // version. It now says only where the translations sit, and is named for
    // that. A vault saved before the rename still carries the old name, so
    // take it once; the next save writes the new one.
    if (!stored.translationsFolder && typeof stored.bibleFolder === 'string') {
      this.settings.translationsFolder = stored.bibleFolder;
    }
    this.chapterCache = new Map();

    this.addSettingTab(new KingdoneChapelSettingTab(this.app, this));

    this.registerView(VIEW_TYPE, (leaf) => new KingdoneChapelView(leaf, this));

    this.breadcrumbs = new Breadcrumbs(this);
    this.register(() => this.breadcrumbs.clear());

    this.addCommand({
      id: 'open-verse-in-another-version',
      name: 'Open this verse in another version',
      callback: () => this.promptVersion(),
    });

    this.addCommand({
      id: 'create-version',
      name: 'Create a Bible version from a translation',
      callback: () => {
        const sources = this.listSources();
        if (!sources.length) {
          new Notice('No version to write one from yet.');
          return;
        }
        new CreateVersionModal(this.app, this, sources).open();
      },
    });

    this.addCommand({
      id: 'open-sidebar',
      name: 'Open versions sidebar',
      callback: () => this.activateView(),
    });

    this.addRibbonIcon('church', 'Kingdone Chapel sidebar', () =>
      this.activateView(),
    );

    this.registerEditorSuggest(new ReferenceSuggest(this));

    // One command per version, so each can get its own hotkey.
    this.registerVersionCommands();

    this.addCommand({
      id: 'reload-versions',
      name: 'Reload version list',
      callback: () => {
        this.invalidateIndex();
        this.registerVersionCommands();
        this.chapterCache.clear();
        new Notice(
          `Versions found: ${this.listVersions().join(', ') || 'none'}`,
        );
      },
    });

    this.registerEvent(
      this.app.vault.on('modify', (file) =>
        this.chapterCache.delete(file.path),
      ),
    );
    // Any of the three can be the chapter on screen, or the one an arrow points
    // at, and nothing else says the bar above a note now names another passage —
    // another chapter either side of it, or none at all.
    const moved = () => {
      this.invalidateIndex();
      this.queueBreadcrumbs();
    };
    this.registerEvent(this.app.vault.on('create', moved));
    this.registerEvent(this.app.vault.on('delete', moved));
    this.registerEvent(this.app.vault.on('rename', moved));
    // A note declaring its folder a version changes what the index holds, and
    // so does one that stops declaring it. `changed` fires on every edit to
    // every note, so only the two that could say either count: one carrying
    // the key now, and one the last answer was read from.
    //
    // The note, not its folder: a version laid out flat keeps its chapters
    // beside the note that declares it, and every one of those saves would
    // otherwise throw away the index and read the vault back in.
    this.registerEvent(
      this.app.metadataCache.on('changed', (file, _data, cache) => {
        const front = cache.frontmatter;
        const declares = front ? declaresSource(front) : false;
        if (declares || this.declaringNotes.has(file.path)) moved();
      }),
    );
    // Which folders are versions is read from the metadata cache, and on a
    // cold start that cache is still being filled while the first index is
    // built. The first `resolved` — the parse queue running dry — is the point
    // the answer can be trusted, so drop whatever was decided before it and
    // stop listening: `resolved` fires again after every later edit, and by
    // then the handlers above have already said what changed.
    // The commands go with it. Everything else reads the versions again on its
    // next refresh, but a command is registered once and then stands, so one
    // registered over half an answer keeps it: a version the cache had not got
    // to yet would have no command until the list was reloaded by hand.
    const settled = this.app.metadataCache.on('resolved', () => {
      this.app.metadataCache.offref(settled);
      moved();
      this.registerVersionCommands();
    });
    this.registerEvent(settled);
    this.register(() => this.cancelQueuedRefresh());

    // A pane picks up the bar when it opens a chapter, and loses it when it
    // moves on. Reading and editing look the same to it, but switching between
    // them replaces the pane's contents, so `layout-change` has to put it back.
    this.registerEvent(
      this.app.workspace.on('file-open', () => this.breadcrumbs.refresh()),
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.breadcrumbs.refresh()),
    );
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () =>
        this.breadcrumbs.refresh(),
      ),
    );
    this.app.workspace.onLayoutReady(() => this.breadcrumbs.refresh());

    this.registerDomEvent(document, 'click', (evt) =>
      this.lockPreviewVerse(evt),
    );

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
    this.sourceFolders = null;
    this.chapterOrders.clear();
  }

  /**
   * Every version folder in the vault, by path, with `sourceCodes` alongside.
   *
   * Cached with the index and dropped with it: which folders are versions is
   * decided by notes that can be written, renamed and deleted like any other.
   */
  sources(files?: TFile[]): Map<string, Source> {
    if (this.sourceFolders) return this.sourceFolders;

    const folders = collectSources(
      this.app,
      this.settings.translationsFolder,
      translationsName(nameLang(this.settings.language)),
      files,
    );
    // Two folders may name themselves the same thing, and then they are one
    // version kept in two places: the index merges their files under the one
    // code, and the list names it once.
    const codes = new Map<string, Source>();
    const declaring = new Set<string>();
    for (const source of folders.values()) {
      if (!codes.has(source.code)) codes.set(source.code, source);
      if (source.declaredBy) declaring.add(source.declaredBy);
    }

    this.sourceFolders = folders;
    this.sourceCodes = codes;
    this.declaringNotes = declaring;
    return folders;
  }

  /** The version a file belongs to, or null when it is in none of them. */
  sourceFor(file: TFile): Source | null {
    return sourceOf(this.sources(), file);
  }

  /** The version known by `code`, however its folder is named. */
  source(code: string): Source | null {
    this.sources();
    return this.sourceCodes.get(code) || null;
  }

  /**
   * Redraw the bars once the vault has stopped moving.
   *
   * Dropping the index is cheap and redrawing is not: a bar names its
   * neighbouring chapters, which asks for the index, which walks every file in
   * the vault. One rename never arrives alone — a folder moved, a sync
   * reconciling, a version renamed file by file — and rebuilding on each of
   * them is the whole vault read once per file. Waiting out the run reads it
   * once for all of them.
   */
  queueBreadcrumbs() {
    this.cancelQueuedRefresh();
    this.queuedRefresh = window.setTimeout(() => {
      this.queuedRefresh = null;
      this.breadcrumbs.refresh();
    }, 200);
  }

  cancelQueuedRefresh() {
    if (this.queuedRefresh !== null) window.clearTimeout(this.queuedRefresh);
    this.queuedRefresh = null;
  }

  /**
   * Every chapter file the vault's versions hold, grouped by version.
   *
   * Only two things are structural: a version is a folder — one that says so
   * itself, or a direct subfolder of the translations folder — and file names follow
   * `<VERSION>-<NN>-<Book>-<CCC>`. Whatever folders a version uses in between
   * are ignored, so each version can be laid out flat, split by testament, or
   * grouped any other way.
   */
  index(): Map<string, Map<string, TFile>> {
    if (this.bibleIndex) return this.bibleIndex;

    const index = new Map<string, Map<string, TFile>>();
    const books = new Map<string, Map<number, TFile>>();
    const conflicts = new Map<string, TFile[]>();
    // One walk of the vault for both: which folders are versions is read from
    // the same files the chapters are found in.
    const files = this.app.vault.getMarkdownFiles();
    const sources = this.sources(files);
    for (const file of files) {
      const source = sourceOf(sources, file);
      if (!source) continue; // an ordinary note, in no version at all

      const version = source.code;
      const parsed = parseChapterName(file.basename, version);
      if (!parsed) {
        // Not a chapter, but it may be the note listing the book's chapters.
        // Nothing in the name separates one from an ordinary note that opens
        // the same way, so two of them are as much a mistake in the vault as
        // two chapter files, and are treated the same.
        const bookNumber = parseBookName(file.basename, version);
        if (bookNumber === null) continue;
        let known = books.get(version);
        if (!known) books.set(version, (known = new Map()));
        claim(
          known,
          bookNumber,
          conflicts,
          `${version}/book:${bookNumber}`,
          file,
        );
        continue;
      }

      let chapters = index.get(version);
      if (!chapters) index.set(version, (chapters = new Map()));
      const key = chapterKey(parsed.bookIndex, parsed.chapter);
      claim(chapters, key, conflicts, `${version}/${key}`, file);
    }

    this.bibleIndex = index;
    this.bookNotes = books;
    this.chapterConflicts = conflicts;
    this.warnAboutConflicts();
    return index;
  }

  /** The files claiming `loc` in `version`, when more than one does. */
  conflictFor(version: string, loc: Location): TFile[] | null {
    this.index(); // conflicts are a by-product of building it
    for (const chapter of [loc.chapter, 0]) {
      const clash = this.chapterConflicts.get(
        `${version}/${chapterKey(loc.bookIndex, chapter)}`,
      );
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
      files.map((f) => f.basename).join(' / '),
    );
    const shown = names.slice(0, 3).join('\n');
    const rest = names.length > 3 ? `\n...and ${names.length - 3} more` : '';
    new Notice(
      `Kingdone Chapel: more than one file for the same chapter or book. ` +
        `Rename or remove one of each:\n${shown}${rest}`,
      10000,
    );
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof KingdoneChapelView) leaf.view.refresh(true);
    }
    if (this.breadcrumbs) this.breadcrumbs.refresh();
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
    const source = this.source(version);
    return this.settings.labels[version] || (source && source.label) || version;
  }

  /**
   * Every version holding chapter files, in the order they are listed in.
   *
   * A version folder with nothing in it yet is left out rather than named: an
   * empty heading in a dropdown is a version that cannot be opened, and the
   * settings tab already reports what the vault holds.
   */
  listSources(): Source[] {
    const index = this.index(); // fills sourceCodes on the way
    const found = Array.from(this.sourceCodes.values()).filter((s) =>
      index.has(s.code),
    );
    return sortSources(found);
  }

  listVersions(): string[] {
    return this.listSources().map((source) => source.code);
  }

  /**
   * Parse the active file into { version, bookIndex, book, chapter, verse }.
   * Expects <VERSION>/<any folders>/<VERSION>-<NN>-<CODE>-<CCC>.md
   */
  currentLocation(): Location | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const loc = this.locationOf(view.file, view);
      // Only reading mode needs the guard below; a cursor above verse 1 really has no verse.
      return this.remember(
        view.getMode() === 'preview' ? this.keepVerse(loc) : loc,
      );
    }

    // Focus is on something that is not an editor (the sidebar itself, a modal,
    // the file explorer...). There is no editor to read the cursor from, so the
    // verse would come back null and the sidebar would snap to verse 1. Reuse
    // the last location instead, as long as it is still the active file.
    const file = this.app.workspace.getActiveFile();
    if (
      this.lastLocation &&
      file &&
      this.lastLocation.file.path === file.path
    ) {
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
    if (
      loc &&
      loc.verse === null &&
      last &&
      last.verse &&
      last.file.path === loc.file.path
    ) {
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

    const source = this.sourceFor(file);
    if (!source) return null;

    const parsed = parseChapterName(file.basename, source.code);
    if (!parsed) return null;

    return {
      version: parsed.version,
      bookIndex: parsed.bookIndex,
      book: bookName(parsed.book, nameLang(this.settings.language)),
      chapter: parsed.chapter,
      verse: this.currentVerse(view),
      file,
    };
  }

  /**
   * The passage a note is already about, read from the first link in it that
   * lands in the Bible. A note names its passage once and then goes on writing
   * about it, so that first link is what a reference written as a bare number
   * is written against. Links are always to a chapter, so it is one.
   */
  linkContext(from: TFile | null): Location | null {
    if (!from) return null;
    const cache = this.app.metadataCache.getFileCache(from);
    for (const link of (cache && cache.links) || []) {
      const dest = this.app.metadataCache.getFirstLinkpathDest(
        getLinkpath(link.link),
        from.path,
      );
      // Only a chapter file answers; everything else the note links is skipped.
      const loc = dest ? this.locationOf(dest, null) : null;
      if (loc) return loc;
    }
    return null;
  }

  /** Verse being read: the cursor while editing, the rendered page while reading. */
  currentVerse(view: MarkdownView | null): number | null {
    if (!view) return null;
    if (view.getMode() === 'preview') return this.previewVerse(view);
    this.previewLock = null; // leaving reading mode drops the clicked verse
    return this.cursorVerse(view);
  }

  /** Verse number at the cursor: the nearest verse line at or above the cursor. */
  cursorVerse(view: MarkdownView): number | null {
    const editor = view.editor;
    if (!editor) return null;
    let line: number;
    try {
      // A selection spanning verses belongs to the one it starts on, not the one
      // the drag ended on (`getCursor()` alone returns the head of the selection).
      line = editor.getCursor(
        editor.somethingSelected() ? 'from' : 'head',
      ).line;
    } catch (e) {
      return null;
    }
    for (let i = line; i >= 0; i--) {
      const parsed = parseVerseLine(editor.getLine(i));
      if (parsed) return parsed.verse;
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
      const verse = this.verseAt(view, scroller, selected);
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

    const items = this.verseParagraphs(view, scroller);
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

    const para = target.closest<HTMLElement>(VERSE_SELECTOR);
    const verse = para ? this.verseAt(view, scroller, para) : null;
    this.previewLock =
      verse === null
        ? null
        : { path: view.file.path, verse, scrollTop: scroller.scrollTop };
  }

  /** Verse paragraph the selection starts in, when text is selected in this pane. */
  selectionParagraph(scroller: HTMLElement): HTMLElement | null {
    const win = scroller.ownerDocument.defaultView;
    const sel = win && win.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

    const node = sel.getRangeAt(0).startContainer; // always the earlier end of the range
    if (!scroller.contains(node)) return null;

    const el = node instanceof Element ? node : node.parentElement;
    return el ? el.closest<HTMLElement>(VERSE_SELECTOR) : null;
  }

  /** The scrolling element of a reading pane, verse positions are measured against it. */
  previewScroller(view: MarkdownView): HTMLElement | null {
    const container = view.previewMode && view.previewMode.containerEl;
    if (!container) return null;
    return (
      container.querySelector<HTMLElement>('.markdown-preview-view') ||
      container
    );
  }

  /**
   * Verse elements of a reading pane, in document order.
   *
   * Nothing on the page says which verse an element holds: a list item carries
   * no number of its own, and the number an older chapter bolds into the
   * paragraph is the one the file wrote, which a version that merges verses
   * only writes once. Take the numbers from the file and pair them up in order
   * instead. Nothing separates the verses, so reading mode renders them as a
   * single block — either every one is on the page or none is, and a count that
   * disagrees means something on the page is not a verse, which leaves nothing
   * to pair against: fall back to the numbers the page writes for itself.
   */
  verseParagraphs(
    view: MarkdownView,
    scroller: HTMLElement,
  ): { verse: number; el: HTMLElement }[] {
    const els = Array.from(
      scroller.querySelectorAll<HTMLElement>(VERSE_SELECTOR),
    ).filter((el) => el.tagName === 'LI' || this.isVerseParagraph(el));

    const verses = this.cachedVerses(view.file);
    if (!verses) return []; // the file has not been read yet; the next poll has it
    if (verses.length === els.length)
      return els.map((el, i) => ({ verse: verses[i].verse, el }));

    const out: { verse: number; el: HTMLElement }[] = [];
    for (const el of els) {
      const verse = this.writtenVerse(el);
      if (verse !== null) out.push({ verse, el });
    }
    return out;
  }

  /**
   * The verse an element writes for itself, for when the file's verses cannot
   * be paired with the page. This is the number the reader sees, which is the
   * right one everywhere except a version that merges verses — Markdown numbers
   * a list from its opening item and ignores the rest, so MENS reads one verse
   * low from its first merge onwards. Close beats nothing.
   */
  writtenVerse(el: HTMLElement): number | null {
    if (el.tagName !== 'LI') {
      const strong = el.firstElementChild;
      const m = strong && (strong.textContent || '').trim().match(/^(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    }
    const list = el.parentElement;
    if (!list || list.tagName !== 'OL') return null;
    const index = Array.prototype.indexOf.call(list.children, el);
    return index < 0 ? null : (list as HTMLOListElement).start + index;
  }

  /**
   * Verse a reading-pane element belongs to. A verse with a blank line after it
   * renders its text inside a paragraph of its own, and a click or a selection
   * lands on that rather than on the item holding it, so take whichever verse
   * the element sits in — `contains` counts the element itself.
   */
  verseAt(
    view: MarkdownView,
    scroller: HTMLElement,
    el: HTMLElement,
  ): number | null {
    const found = this.verseParagraphs(view, scroller).find((item) =>
      item.el.contains(el),
    );
    return found ? found.verse : null;
  }

  /**
   * Whether `el` is a verse of an older chapter, which opens its paragraph with
   * the number in bold. Only tells the verses apart from the rest of the page —
   * the chapter's navigation is a paragraph too — never which verse it is.
   */
  isVerseParagraph(el: Element): boolean {
    const strong = el.firstElementChild;
    if (!strong || strong.tagName !== 'STRONG') return false;
    return /^\d+$/.test((strong.textContent || '').trim());
  }

  /** Resolve the chapter file of `version` matching the current location. */
  targetFile(version: string, loc: Location): TFile | null {
    return this.referenceFile(version, loc.bookIndex, loc.chapter);
  }

  /**
   * A version by the name a reader typed, case and all, or null if there is no
   * such version. This is what tells `@ARA Joao` from a two-word book name.
   */
  findVersion(word: string): string | null {
    const wanted = word.toLowerCase();
    return this.listVersions().find((v) => v.toLowerCase() === wanted) || null;
  }

  /**
   * Version a reference with none of its own points at: the one set in the
   * settings, else the version of the note being written in when that note is
   * itself a chapter, else the first version in the vault.
   */
  defaultVersion(from: TFile | null): string | null {
    const versions = this.listVersions();
    const preferred = this.settings.defaultVersion;
    if (preferred && versions.includes(preferred)) return preferred;

    const here = from ? this.locationOf(from, null) : null;
    if (here && versions.includes(here.version)) return here.version;

    return versions.length ? versions[0] : null;
  }

  /**
   * File a reference points at: the chapter, or the note listing the book's
   * chapters when no chapter was given. A version that keeps no such note
   * (or a single `-000` file for the whole book) still resolves, to the
   * nearest thing it has.
   *
   * That last fallback is for reading — a passage to show in the sidebar, a
   * file to open — where the nearest thing the version has beats nothing at
   * all. A link being written wants `chapterTargets` instead, which does not
   * take it: a link is read later, by someone who was not there to see it
   * settle for the book.
   */
  referenceFile(
    version: string,
    bookIndex: number,
    chapter: number | null,
  ): TFile | null {
    const chapters = this.index().get(version);
    if (chapter === null) {
      const note = this.bookNotes.get(version);
      return (
        (note && note.get(bookIndex)) ||
        (chapters &&
          (chapters.get(chapterKey(bookIndex, 0)) ||
            chapters.get(chapterKey(bookIndex, 1)))) ||
        null
      );
    }
    if (!chapters) return null;
    // Commentaries keep a single -000 file per book.
    return (
      chapters.get(chapterKey(bookIndex, chapter)) ||
      chapters.get(chapterKey(bookIndex, 0)) ||
      null
    );
  }

  /**
   * Every chapter a version holds, in the order they are read: by book number
   * first, then by chapter. This is the line the breadcrumb arrows walk, which
   * is why it is one list and not one per book — the chapter after the last of
   * Genesis is the first of Exodus, and a flat list says so without anyone
   * having to know how many chapters a book has.
   *
   * The index keys chapters by number alone, so the book's code — the only
   * thing that can name it — is read back out of the file names here. Kept
   * until the index is dropped, which is whenever the vault moves under it.
   */
  chapterOrder(version: string): ChapterRef[] {
    const cached = this.chapterOrders.get(version);
    if (cached) return cached;

    const out: ChapterRef[] = [];
    const chapters = this.index().get(version);
    if (chapters) {
      for (const file of chapters.values()) {
        const parsed = parseChapterName(file.basename, version);
        if (parsed) {
          out.push({
            bookIndex: parsed.bookIndex,
            chapter: parsed.chapter,
            code: parsed.book,
          });
        }
      }
      out.sort((a, b) => a.bookIndex - b.bookIndex || a.chapter - b.chapter);
    }
    this.chapterOrders.set(version, out);
    return out;
  }

  /**
   * Books a version has chapters for, in canonical order, named to read, each
   * with the first chapter it actually holds.
   *
   * Which is not always chapter 1: a version part way through being imported
   * may start at any chapter, and one whose chapter 1 is claimed by two files
   * has it left out of the index. Opening a book on the first chapter the
   * order names is the same answer as chapter 1 wherever chapter 1 is there,
   * and an answer at all where it is not.
   */
  booksIn(version: string): { index: number; name: string; chapter: number }[] {
    const lang = nameLang(this.settings.language);
    const out: { index: number; name: string; chapter: number }[] = [];
    for (const ref of this.chapterOrder(version)) {
      if (out.length && out[out.length - 1].index === ref.bookIndex) continue;
      out.push({
        index: ref.bookIndex,
        name: bookName(ref.code, lang),
        chapter: ref.chapter,
      });
    }
    return out;
  }

  /** Chapter numbers a version has for one book, in order. */
  chaptersIn(version: string, bookIndex: number): number[] {
    return this.chapterOrder(version)
      .filter((ref) => ref.bookIndex === bookIndex)
      .map((ref) => ref.chapter);
  }

  /**
   * The chapter `step` places away, crossing into the next or previous book at
   * the ends. Null once the version runs out — before its first chapter, after
   * its last — and for a chapter the index never took, which is what a pair of
   * files claiming it leaves behind.
   */
  stepChapter(
    version: string,
    bookIndex: number,
    chapter: number,
    step: number,
  ): ChapterRef | null {
    const order = this.chapterOrder(version);
    const at = order.findIndex(
      (ref) => ref.bookIndex === bookIndex && ref.chapter === chapter,
    );
    if (at < 0) return null;
    return order[at + step] || null;
  }

  /**
   * Open a chapter of a version, by book number rather than from a location:
   * the breadcrumbs move between books and chapters, which no location on
   * screen names. A verse would mean nothing across that move, so this lands
   * on the chapter itself.
   */
  async openChapter(
    version: string,
    bookIndex: number,
    chapter: number | null,
    from: TFile | null,
    newLeaf: PaneType | boolean = false,
  ) {
    const file = this.referenceFile(version, bookIndex, chapter);
    if (!file) {
      const book = bookNameAt(bookIndex, nameLang(this.settings.language));
      new Notice(
        `${this.label(version)} has no ${book}${chapter === null ? '' : ' ' + chapter}.`,
      );
      return;
    }
    await this.app.workspace.openLinkText(
      file.path,
      from ? from.path : '',
      newLeaf,
    );
  }

  /**
   * Where a link to each of `chapters` points. A chapter the version wrote is
   * its file; one it never wrote is only the name that file would carry, and
   * the link lands unresolved, which is what the version honestly holds. The
   * whole-book fallback `referenceFile` keeps is no good here: a link to the
   * book under a chapter's label says the version has a chapter it does not,
   * and a run of them says it several times over, to the one file.
   *
   * The name is the version's to decide, and only a file it already wrote can
   * say how it decides — so any chapter of the same book stands as the example
   * to copy, the lone `-000` of a commentary included. A book the version does
   * not carry has no example, and no answer.
   */
  chapterTargets(
    version: string,
    bookIndex: number,
    chapters: number[],
  ): ChapterTarget[] {
    const known = this.index().get(version);
    if (!known) return [];

    let example: string | null = null;
    for (const [key, file] of known) {
      if (key.startsWith(`${bookIndex}:`)) {
        example = file.basename;
        break;
      }
    }
    if (!example) return [];

    const out: ChapterTarget[] = [];
    for (const chapter of chapters) {
      const file = known.get(chapterKey(bookIndex, chapter)) || null;
      if (file) {
        out.push({ chapter, file, path: file.path });
        continue;
      }
      const name = chapterFileName(example, chapter);
      if (name) out.push({ chapter, file: null, path: name });
    }
    return out;
  }

  /** Block ids of a file (from metadata cache, falling back to reading it). */
  async blockIds(file: TFile): Promise<string[]> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (cache && cache.blocks) {
      const ids = Object.keys(cache.blocks);
      if (ids.length) return ids;
    }
    const content = await this.app.vault.cachedRead(file);
    return (content.match(/\^[A-Za-z0-9-]+\s*$/gm) || []).map((s) =>
      s.trim().slice(1),
    );
  }

  /**
   * Block id in `file` for chapter/verse. Versions like MENS merge verses
   * (1-2 under verse 1), so fall back to the closest anchor before the verse.
   */
  async findAnchor(
    file: TFile,
    chapter: number,
    verse: number | null,
  ): Promise<string | null> {
    const found = await this.findAnchors(file, chapter, verse ? [verse] : []);
    return found.length ? found[0] : null;
  }

  /**
   * The same, for a run of verses, reading the file's block ids once. A
   * reference like `1.1-20` would otherwise ask for them twenty times over.
   */
  async findAnchors(
    file: TFile,
    chapter: number | null,
    verses: number[],
  ): Promise<(string | null)[]> {
    if (chapter === null || !verses.length) return verses.map(() => null);

    const re = new RegExp(`-${chapter}-(\\d+)$`);
    const numbered: { verse: number; id: string }[] = [];
    for (const id of await this.blockIds(file)) {
      const m = id.match(re);
      if (m) numbered.push({ verse: parseInt(m[1], 10), id });
    }

    return verses.map((verse) => {
      let best: string | null = null;
      let bestVerse = -1;
      for (const item of numbered) {
        if (item.verse === verse) return item.id;
        if (item.verse < verse && item.verse > bestVerse) {
          bestVerse = item.verse;
          best = item.id;
        }
      }
      return best;
    });
  }

  /**
   * Verses of a chapter already parsed, for callers that cannot wait for a read.
   * Reading mode is polled, so a miss just warms the cache for the next round.
   */
  cachedVerses(file: TFile | null): Verse[] | null {
    if (!file) return null;
    const hit = this.chapterCache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.verses;
    // Nothing waits on the read, and it can fail on a file that has just gone
    // away. Returning no verses is the answer either way.
    this.chapterVerses(file).catch(() => {});
    return null;
  }

  /** Parsed verses of a chapter file, cached until the file changes. */
  async chapterVerses(file: TFile): Promise<Verse[]> {
    const hit = this.chapterCache.get(file.path);
    if (hit && hit.mtime === file.stat.mtime) return hit.verses;

    const content = await this.app.vault.cachedRead(file);
    const verses = parseVerses(content);
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
  async versionsFor(
    loc: Location,
    includeCurrent: boolean,
  ): Promise<VersionItem[]> {
    const out: VersionItem[] = [];
    for (const source of this.listSources()) {
      const version = source.code;
      if (!includeCurrent && version === loc.version) continue;
      const file = this.targetFile(version, loc);
      if (!file) continue;
      const match = await this.verseIn(file, loc.verse);
      out.push({
        version,
        label: this.label(version),
        group: source.group,
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
          : `${this.label(version)} has no ${loc.book} ${loc.chapter}.`,
      );
      return;
    }
    const anchor = await this.findAnchor(file, loc.chapter, loc.verse);
    const link = anchor ? `${file.path}#^${anchor}` : file.path;
    const leaf = newLeaf === undefined ? this.settings.openInNewTab : newLeaf;
    await this.app.workspace.openLinkText(
      link,
      loc.file ? loc.file.path : '',
      leaf,
    );
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
