import { Modal, Notice, Setting, TFolder, normalizePath } from 'obsidian';
import type { App, TFile } from 'obsidian';

import { bookName, nameLang } from './books';
import { chapterNote, declaringNote, renameSegments } from './create';
import type { Quoted } from './create';
import { parseChapterName } from './utils';
import type { Source } from './sources';
import type KingdoneChapelPlugin from './main';

/** How many chapters go by between rewrites of the notice counting them. */
const REPORT_EVERY = 25;

/**
 * Asking what to write, and then writing it.
 *
 * The four things a new version cannot be worked out without: which
 * translation it answers, where it goes, what its files are called, and what
 * a reader is to call it. Everything else is copied from the translation.
 */
export class CreateVersionModal extends Modal {
  plugin: KingdoneChapelPlugin;
  sources: Source[];
  from: string;
  folder: string;
  code = '';
  name = '';
  /** Whether the name has been written by hand, and so stopped following the code. */
  named = false;
  nameField: HTMLInputElement | null = null;

  constructor(app: App, plugin: KingdoneChapelPlugin, sources: Source[]) {
    super(app);
    this.plugin = plugin;
    this.sources = sources;
    this.from = sources[0].code;
    this.folder = parentOf(sources[0].path);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'New Bible version' });

    new Setting(contentEl)
      .setName('Based on')
      .setDesc(
        'The translation it answers. Its folders, its file names and its verses ' +
          'are what the new version is written from.',
      )
      .addDropdown((drop) => {
        for (const source of this.sources) {
          drop.addOption(source.code, this.plugin.label(source.code));
        }
        drop.setValue(this.from).onChange((value) => {
          this.from = value;
          const source = this.sources.find((s) => s.code === value);
          if (source) this.folder = parentOf(source.path);
        });
      });

    new Setting(contentEl)
      .setName('Folder')
      .setDesc(
        'Where the version folder is made. It is made if it is not there.',
      )
      .addText((text) =>
        text
          .setPlaceholder('Bibles')
          .setValue(this.folder)
          .onChange((value) => {
            this.folder = value;
          }),
      );

    new Setting(contentEl)
      .setName('Code')
      .setDesc(
        'Names the folder, starts every file name, and opens every block id. ' +
          'This is what `@Shedd Joao 1.1` calls it.',
      )
      .addText((text) =>
        text.setPlaceholder('Shedd').onChange((value) => {
          this.code = value.trim();
          // The name follows the code until it is written over, so the common
          // case is one field rather than two saying the same thing twice.
          if (!this.named && this.nameField) {
            this.name = this.code;
            this.nameField.value = this.code;
          }
        }),
      );

    new Setting(contentEl)
      .setName('Name')
      .setDesc('What a reader sees. The code, until you say otherwise.')
      .addText((text) => {
        this.nameField = text.inputEl;
        text.setPlaceholder('Bíblia Shedd').onChange((value) => {
          this.name = value.trim();
          this.named = value.trim() !== '';
        });
      });

    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText('Create')
        .setCta()
        .onClick(() => this.create()),
    );
  }

  onClose() {
    this.contentEl.empty();
  }

  /** What the fields say, or the first reason they do not say enough. */
  refuse(): string | null {
    if (!this.code) return 'Give the version a code.';
    if (/[\\/:]/.test(this.code)) return 'A code cannot carry / \\ or :.';
    if (this.plugin.source(this.code)) {
      return `${this.code} is already a version in this vault.`;
    }
    const at = this.target();
    if (this.app.vault.getAbstractFileByPath(at)) {
      return `${at} is already there. Move it or pick another folder.`;
    }
    return null;
  }

  /** The new version's own folder. */
  target(): string {
    const folder = normalizePath(this.folder.replace(/\/+$/, ''));
    return folder === '/' || folder === ''
      ? this.code
      : `${folder}/${this.code}`;
  }

  async create() {
    const refused = this.refuse();
    if (refused) {
      new Notice(refused);
      return;
    }

    const source = this.plugin.source(this.from);
    const chapters = this.plugin.index().get(this.from);
    if (!source || !chapters || !chapters.size) {
      new Notice(`${this.from} has no chapters to answer.`);
      return;
    }

    this.close();
    const counting = new Notice(`Writing ${this.code}...`, 0);
    try {
      const written = await this.write(
        source,
        Array.from(chapters.values()),
        counting,
      );
      counting.hide();
      new Notice(`${this.code}: ${written} chapters written.`);
    } catch (e) {
      counting.hide();
      new Notice(`${this.code} was not written: ${(e as Error).message}`);
      return;
    }

    // The vault has grown a version; nothing has asked it for one yet.
    this.plugin.invalidateIndex();
    this.plugin.registerVersionCommands();
    this.plugin.refreshViews();
  }

  /** Write the declaring note and one file per chapter the translation holds. */
  async write(
    source: Source,
    files: TFile[],
    counting: Notice,
  ): Promise<number> {
    const root = this.target();
    const lang = nameLang(this.plugin.settings.language);
    await this.folderOf(root);
    await this.app.vault.create(
      `${root}/${this.code}.md`,
      declaringNote(this.code, this.name || this.code),
    );

    // In reading order, so a run that is stopped part way leaves the version
    // whole from Genesis up to wherever it got to.
    const ordered = files.slice().sort((a, b) => a.path.localeCompare(b.path));
    let written = 0;
    for (const file of ordered) {
      const parsed = parseChapterName(file.basename, source.code);
      if (!parsed) continue;

      const rel = file.path.slice(source.path.length + 1);
      const at = `${root}/${renameSegments(rel, source.code, this.code)}`;
      await this.folderFor(at);
      await this.app.vault.create(
        at,
        chapterNote(
          `${bookName(parsed.book, lang)} ${parsed.chapter}`,
          file.basename,
          source.code,
          await this.quoted(file, parsed.chapter),
          this.code,
          parsed.book,
          parsed.chapter,
        ),
      );

      written += 1;
      if (written % REPORT_EVERY === 0) {
        counting.setMessage(
          `Writing ${this.code}... ${written}/${ordered.length}`,
        );
      }
    }
    return written;
  }

  /** Every verse of a chapter that the translation gave a block id to. */
  async quoted(file: TFile, chapter: number): Promise<Quoted[]> {
    const verses = (await this.plugin.chapterVerses(file)).map((v) => v.verse);
    const anchors = await this.plugin.findAnchors(file, chapter, verses);
    const out: Quoted[] = [];
    verses.forEach((verse, at) => {
      const anchor = anchors[at];
      // A verse the translation never anchored cannot be embedded on its own,
      // and an embed of the whole chapter under one verse's heading would say
      // something the version does not mean. Leave it out.
      if (anchor) out.push({ verse, anchor });
    });
    return out;
  }

  /** Make the folders `path`'s file will sit in, outermost first. */
  async folderFor(path: string) {
    const parts = path.split('/');
    parts.pop();
    await this.folderOf(parts.join('/'));
  }

  /** Make `path` and everything above it, outermost first. */
  async folderOf(path: string) {
    let at = '';
    for (const part of path.split('/').filter(Boolean)) {
      at = at ? `${at}/${part}` : part;
      const there = this.app.vault.getAbstractFileByPath(at);
      if (there instanceof TFolder) continue;
      if (there) throw new Error(`${at} is a note, not a folder.`);
      await this.app.vault.createFolder(at);
    }
  }
}

/** The folder holding `path`, empty at the top of the vault. */
function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}
