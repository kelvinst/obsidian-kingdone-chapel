/**
 * A vault, a workspace and a plugin instance, built out of a list of files.
 *
 * Everything the plugin reaches for outside itself is here, as the smallest
 * thing that answers the question it is asked: the vault holds files and their
 * text, the workspace holds panes and remembers what was opened, and the
 * metadata cache answers for block ids. Nothing simulates Obsidian beyond
 * that — where a test needs a pane in a particular state, it says so.
 *
 * The fakes are the stub's classes wearing Obsidian's types. Every cast that
 * takes them from one to the other is here rather than in the tests, so a test
 * reads as the plugin does: against the API the source is written to.
 */
import type {
  App,
  EditorPosition,
  MarkdownView as ChapterPane,
  TFile,
  TFolder,
} from 'obsidian';

import * as stub from './obsidian';
import KingdoneChapelPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/types';
import type { KingdoneChapelSettings } from '../src/types';

export interface EventRef {
  off: () => void;
}

/** Handlers by event name, for the vault and the workspace alike. */
class Emitter {
  handlers = new Map<string, ((...args: never[]) => void)[]>();

  on(name: string, cb: (...args: never[]) => void): EventRef {
    const list = this.handlers.get(name) || [];
    list.push(cb);
    this.handlers.set(name, list);
    return {
      off: () => {
        const at = list.indexOf(cb);
        if (at >= 0) list.splice(at, 1);
      },
    };
  }

  trigger(name: string, ...args: unknown[]) {
    for (const cb of (this.handlers.get(name) || []).slice()) {
      (cb as (...a: unknown[]) => void)(...args);
    }
  }

  /** How many handlers an event has, so a test can see one was registered. */
  count(name: string): number {
    return (this.handlers.get(name) || []).length;
  }
}

export class FakeVault extends Emitter {
  root = new stub.TFolder();
  byPath = new Map<string, stub.TAbstractFile>();
  contents = new Map<string, string>();
  private all: stub.TFile[] = [];
  private clock = 1;

  constructor(files: Record<string, string> = {}) {
    super();
    this.root.path = '/';
    for (const [path, content] of Object.entries(files)) {
      this.write(path, content);
    }
  }

  /** Add the file, or replace its text and move its modification time on. */
  write(path: string, content = ''): TFile {
    this.contents.set(path, content);
    const known = this.byPath.get(path);
    if (known instanceof stub.TFile) {
      known.stat.mtime = ++this.clock;
      return known as unknown as TFile;
    }
    const file = new stub.TFile();
    file.path = path;
    file.name = path.slice(path.lastIndexOf('/') + 1);
    file.basename = file.name.replace(/\.[^.]+$/, '');
    file.extension = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1)
      : '';
    file.stat.mtime = ++this.clock;
    const parent = this.rawFolder(path.slice(0, path.lastIndexOf('/')));
    file.parent = parent;
    parent.children.push(file);
    this.all.push(file);
    this.byPath.set(path, file);
    return file as unknown as TFile;
  }

  remove(path: string) {
    const file = this.byPath.get(path);
    if (!file) return;
    this.byPath.delete(path);
    this.contents.delete(path);
    this.all = this.all.filter((f) => f !== file);
    if (file.parent) {
      file.parent.children = file.parent.children.filter((c) => c !== file);
    }
  }

  /** The folder at `path`, and every folder above it, made as needed. */
  folder(path: string): TFolder {
    return this.rawFolder(path) as unknown as TFolder;
  }

  private rawFolder(path: string): stub.TFolder {
    if (!path) return this.root;
    const known = this.byPath.get(path);
    if (known instanceof stub.TFolder) return known;
    const folder = new stub.TFolder();
    folder.path = path;
    folder.name = path.slice(path.lastIndexOf('/') + 1);
    const parent = this.rawFolder(path.slice(0, path.lastIndexOf('/')));
    folder.parent = parent;
    parent.children.push(folder);
    this.byPath.set(path, folder);
    return folder;
  }

  getMarkdownFiles(): TFile[] {
    return this.all.filter((f) => f.extension === 'md') as unknown as TFile[];
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return (this.byPath.get(path) || null) as TFile | TFolder | null;
  }

  /** Write a file that is not there yet, refusing one that is. */
  async create(path: string, content: string): Promise<TFile> {
    if (this.byPath.has(path)) throw new Error(`already exists: ${path}`);
    return this.write(path, content);
  }

  /** Make a folder that is not there yet, refusing one that is. */
  async createFolder(path: string): Promise<TFolder> {
    if (this.byPath.has(path)) throw new Error(`already exists: ${path}`);
    return this.folder(path);
  }

  async cachedRead(file: TFile): Promise<string> {
    const content = this.contents.get(file.path);
    // A file the index named can have gone away since; the plugin is written
    // to expect the read to fail rather than to come back empty.
    if (content === undefined) throw new Error(`no such file: ${file.path}`);
    return content;
  }
}

export class FakeMetadataCache extends Emitter {
  /** path -> block ids the cache knows, for the files where it knows any. */
  blocks = new Map<string, string[]>();
  /** path -> the links the file writes, in the order it writes them. */
  links = new Map<string, string[]>();

  /** Reads the vault as it stands, so a file written later still resolves. */
  constructor(private vault: FakeVault) {
    super();
  }

  /** Drop a handler, the way Obsidian's own events are unregistered. */
  offref(ref: EventRef) {
    ref.off();
  }

  getFileCache(file: TFile): {
    blocks?: Record<string, unknown>;
    links?: { link: string }[];
  } | null {
    const ids = this.blocks.get(file.path);
    const links = this.links.get(file.path);
    if (!ids && !links) return null;
    return {
      ...(ids ? { blocks: Object.fromEntries(ids.map((id) => [id, {}])) } : {}),
      ...(links ? { links: links.map((link) => ({ link })) } : {}),
    };
  }

  fileToLinktext(file: TFile, _from: string, omitExtension = false): string {
    return omitExtension ? file.basename : file.path;
  }

  /**
   * The file a `[[link]]` lands on. Obsidian resolves a link by name against
   * the whole vault, falling back to the path; both are answered here, since
   * either is how a link in a note may be written.
   */
  getFirstLinkpathDest(linkpath: string, _from: string): TFile | null {
    const wanted = linkpath.replace(/\.md$/, '');
    const files = this.vault.getMarkdownFiles();
    return (
      files.find((f) => f.path.replace(/\.md$/, '') === wanted) ||
      files.find((f) => f.basename === wanted) ||
      null
    );
  }
}

export interface FakeLeaf {
  type: string;
  view: unknown;
  app: unknown;
  setViewState: (state: { type: string; active?: boolean }) => Promise<void>;
}

export class FakeWorkspace extends Emitter {
  leaves: FakeLeaf[] = [];
  /** The pane a command reads from, when it is a markdown one. */
  activeView: ChapterPane | null = null;
  /** The file in front, for when focus is not on an editor at all. */
  activeFile: TFile | null = null;
  /** Every `openLinkText`, in order — what a jump actually did. */
  opened: { link: string; from: string; newLeaf: unknown }[] = [];
  revealed: FakeLeaf[] = [];
  /** The leaf `getRightLeaf` hands back, or null for a workspace with none. */
  rightLeaf: FakeLeaf | null = null;
  /** Whether `onLayoutReady` runs its callback, or holds it back. */
  layoutReady = true;
  held: (() => void)[] = [];

  constructor(public app: unknown) {
    super();
  }

  /** A pane of `type`, in the workspace, holding `view`. */
  addLeaf(type: string, view: unknown = null): FakeLeaf {
    const leaf: FakeLeaf = {
      type,
      view,
      app: this.app,
      setViewState: async (state) => {
        leaf.type = state.type;
      },
    };
    this.leaves.push(leaf);
    return leaf;
  }

  getLeavesOfType(type: string): FakeLeaf[] {
    return this.leaves.filter((leaf) => leaf.type === type);
  }

  getActiveViewOfType<T>(ctor: new (...args: never[]) => T): T | null {
    return this.activeView instanceof ctor
      ? (this.activeView as unknown as T)
      : null;
  }

  getActiveFile(): TFile | null {
    if (this.activeFile) return this.activeFile;
    return this.activeView ? this.activeView.file : null;
  }

  async openLinkText(link: string, from: string, newLeaf: unknown) {
    this.opened.push({ link, from, newLeaf });
  }

  getRightLeaf(_split: boolean): FakeLeaf | null {
    return this.rightLeaf;
  }

  revealLeaf(leaf: FakeLeaf) {
    this.revealed.push(leaf);
  }

  onLayoutReady(cb: () => void) {
    if (this.layoutReady) cb();
    else this.held.push(cb);
  }
}

export class FakeApp {
  vault: FakeVault;
  workspace: FakeWorkspace;
  metadataCache: FakeMetadataCache;

  constructor(files: Record<string, string> = {}) {
    this.vault = new FakeVault(files);
    this.workspace = new FakeWorkspace(this);
    this.metadataCache = new FakeMetadataCache(this.vault);
  }
}

/** A cursor, a selection and a run of lines — as much editor as is ever read. */
export class FakeEditor {
  lines: string[];
  cursor: EditorPosition = { line: 0, ch: 0 };
  anchor: EditorPosition = { line: 0, ch: 0 };
  selected = false;
  /** Set to make the cursor unreadable, the way a torn-down pane does. */
  broken = false;

  constructor(text = '') {
    this.lines = text.split('\n');
  }

  get text(): string {
    return this.lines.join('\n');
  }

  getValue(): string {
    return this.text;
  }

  getLine(line: number): string {
    return this.lines[line] ?? '';
  }

  getCursor(which?: string): EditorPosition {
    if (this.broken) throw new Error('this editor has gone away');
    return which === 'from' ? this.anchor : this.cursor;
  }

  somethingSelected(): boolean {
    return this.selected;
  }

  setCursor(pos: EditorPosition) {
    this.cursor = pos;
  }

  /** `to` is the editor's own optional: left off, the text is inserted. */
  replaceRange(text: string, from: EditorPosition, to: EditorPosition = from) {
    const head = this.getLine(from.line).slice(0, from.ch);
    const tail = this.getLine(to.line).slice(to.ch);
    const written = (head + text + tail).split('\n');
    this.lines.splice(from.line, to.line - from.line + 1, ...written);
  }

  /** Put the cursor at the end of `line`, which is where typing leaves it. */
  at(line: number, ch = this.getLine(line).length): EditorPosition {
    this.cursor = { line, ch };
    this.anchor = { line, ch };
    return this.cursor;
  }
}

export interface PaneOptions {
  file?: TFile | null;
  mode?: 'source' | 'preview';
  editor?: FakeEditor;
  /** The rendered page, for a pane in reading mode. */
  preview?: HTMLElement;
}

/** A markdown pane in the state a test needs it in. */
export function pane(app: App, options: PaneOptions = {}): ChapterPane {
  const view = new stub.MarkdownView({ app });
  view.file = (options.file || null) as unknown as stub.TFile | null;
  view.mode = options.mode || 'source';
  view.editor = options.editor || null;
  view.previewMode = options.preview ? { containerEl: options.preview } : null;
  return view as unknown as ChapterPane;
}

/** The editor of a pane made by `pane`, back in the type it was handed in. */
export function editorOf(view: ChapterPane): FakeEditor {
  return view.editor as unknown as FakeEditor;
}

export interface Harness {
  plugin: KingdoneChapelPlugin;
  app: App;
  vault: FakeVault;
  workspace: FakeWorkspace;
  metadataCache: FakeMetadataCache;
}

/**
 * A plugin over `files`, with its settings already in place but `onload` not
 * yet run — most of the plugin answers without it, and the tests that need
 * what it wires up call it themselves.
 */
export function harness(
  files: Record<string, string> = {},
  settings: Partial<KingdoneChapelSettings> = {},
): Harness {
  const app = new FakeApp(files);
  const plugin = new KingdoneChapelPlugin(app as unknown as App, {
    id: 'kingdone-chapel',
    name: 'Kingdone Chapel',
    version: '0.0.0',
    minAppVersion: '0.0.0',
    author: '',
    description: '',
  });
  plugin.settings = { ...DEFAULT_SETTINGS, ...settings };
  // The same settings as what is saved, so a plugin that is loaded for real
  // reads them back rather than starting over from the defaults.
  plugin.data = { ...settings };
  plugin.chapterCache = new Map();
  return {
    plugin,
    app: app as unknown as App,
    vault: app.vault,
    workspace: app.workspace,
    metadataCache: app.metadataCache,
  };
}

/**
 * A chapter file's text: one verse per line, each closed by the block id that
 * names it, the way the vault the plugin was written for writes them.
 */
export function chapterText(
  version: string,
  code: string,
  chapter: number,
  verses: string[],
  from = 1,
): string {
  return verses
    .map((text, i) => {
      const verse = from + i;
      const id = `${version}-${code}-${chapter}-${verse}`.toLowerCase();
      return `${verse}. ${text} ^${id}`;
    })
    .join('\n');
}

/** The name a chapter file goes under: `Bibles/NVI/NVI-43-JHN-001.md`. */
export function chapterPath(
  version: string,
  bookIndex: number,
  code: string,
  chapter: number,
  folder = 'Bibles',
): string {
  const book = String(bookIndex).padStart(2, '0');
  const number = String(chapter).padStart(3, '0');
  return `${folder}/${version}/${version}-${book}-${code}-${number}.md`;
}

/** One chapter — its path and its verses — ready to spread into a vault. */
export function chapter(
  version: string,
  bookIndex: number,
  code: string,
  number: number,
  verses: string[],
  folder = 'Bibles',
): Record<string, string> {
  return {
    [chapterPath(version, bookIndex, code, number, folder)]: chapterText(
      version,
      code,
      number,
      verses,
    ),
  };
}

export type { App, ChapterPane, TFile };
