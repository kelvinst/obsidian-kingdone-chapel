import {
  ButtonComponent,
  PluginSettingTab,
  Setting,
  TextComponent,
} from 'obsidian';
import type { App } from 'obsidian';

import type { Lang } from './books';
import { DEFAULT_NOTE_KINDS } from './notes';
import type { NoteKind } from './notes';
import type { Source } from './sources';
import type KingdoneChapelPlugin from './main';

export class KingdoneChapelSettingTab extends PluginSettingTab {
  plugin: KingdoneChapelPlugin;

  constructor(app: App, plugin: KingdoneChapelPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Language')
      .setDesc(
        'Language book names are read and written in, in `@` references and ' +
          'everywhere a book is named. No preference reads every language at once, ' +
          'which is how `@Jn` offers both Jonas and John — the same abbreviation ' +
          'stands for one book in Portuguese and another in English — and writes ' +
          'the names in Portuguese. Naming a language leaves the rest out.',
      )
      .addDropdown((drop) => {
        drop.addOption('', 'No preference');
        drop.addOption('pt', 'Portuguese');
        drop.addOption('en', 'English');
        drop.setValue(this.plugin.settings.language).onChange(async (value) => {
          this.plugin.settings.language = value as Lang | '';
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Translations folder')
      .setDesc(
        'Folder holding one folder per translation (ARA, NVI, ...), which are listed ' +
          'under a heading of their own. Inside each of them, folders are ignored — only ' +
          'file names matter. A version kept anywhere else — a study Bible filed with the ' +
          'commentaries, say — says so in its own note instead, with `bible: true` and a ' +
          '`code` in the frontmatter, and heads itself. The code is what its file names ' +
          'start with, which is what says which notes under that folder are its own.',
      )
      .addText((text) =>
        text
          .setPlaceholder('Bibles')
          .setValue(this.plugin.settings.translationsFolder)
          .onChange(async (value) => {
            this.plugin.settings.translationsFolder = value.replace(/\/+$/, '');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Open in new tab')
      .setDesc('Off: replace the current tab.')
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.openInNewTab)
          .onChange(async (value) => {
            this.plugin.settings.openInNewTab = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Chapter breadcrumbs')
      .setDesc(
        'A `Version > Book > Chapter` bar above every chapter you open. Each part ' +
          'opens a list to move by — searchable once it is longer than a handful — ' +
          'and the arrows walk the version chapter by chapter, on into the next book. ' +
          'Ctrl/Cmd-click any of them to open in a new tab.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showBreadcrumbs)
          .onChange(async (value) => {
            this.plugin.settings.showBreadcrumbs = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Group books by category')
      .setDesc(
        "Break the testaments down in the book list the way a Bible's contents page " +
          'does — Lei, Históricos, Sabedoria, Profetas, Evangelhos, Cartas — in ' +
          'the language chosen above. Off: only the two testaments.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.bookCategories)
          .onChange(async (value) => {
            this.plugin.settings.bookCategories = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: 'References' });

    new Setting(containerEl)
      .setName('Default version for @ references')
      .setDesc(
        'Version `@Joao 1.1` links to. Name one in the reference itself (`@ARA Joao 1.1`) ' +
          'to override it. Automatic uses the version of the note you are writing in, ' +
          'falling back to the first one in the vault. Only versions answering for the ' +
          'whole Bible are offered: a partial one can be read and walked through, but ' +
          'never linked to, since a link to a chapter nobody has written yet is a link ' +
          'to nothing. Versions in the translations folder are whole Bibles; ones ' +
          'declared elsewhere are partial until they say `complete: true`.',
      )
      .addDropdown((drop) => {
        drop.addOption('', 'Automatic');
        for (const version of this.plugin.completeVersions()) {
          drop.addOption(version, this.plugin.label(version));
        }
        drop
          .setValue(this.plugin.settings.defaultVersion)
          .onChange(async (value) => {
            this.plugin.settings.defaultVersion = value;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl('h3', { text: 'Notes' });

    new Setting(containerEl)
      .setName('Kinds of note')
      .setDesc(kindsDesc())
      .addButton((b) =>
        b.setButtonText('Add').onClick(async () => {
          const kinds = this.plugin.noteKinds();
          this.plugin.settings.noteKinds = [
            ...kinds,
            { callout: 'note', letter: freeLetter(kinds), title: '' },
          ];
          await this.plugin.saveSettings();
          this.display();
        }),
      )
      .addButton((b) =>
        b.setButtonText('Reset').onClick(async () => {
          this.plugin.settings.noteKinds = DEFAULT_NOTE_KINDS.map((kind) => ({
            ...kind,
          }));
          await this.plugin.saveSettings();
          this.display();
        }),
      );

    // A table, because the rows are one: the settings list lays every row out
    // for itself — an info column as wide as whatever it holds — so columns
    // written as settings line up with nothing. A table's own columns are the
    // one width down the whole of it.
    const table = containerEl.createEl('table', { cls: 'kcp-note-kinds' });
    const head = table.createEl('thead').createEl('tr');
    for (const column of COLUMNS) {
      const cell = head.createEl('th', { text: column.name });
      // A column too narrow to say what it holds says it on hover instead,
      // which is where a reader asks.
      if (!column.hint) continue;
      const hint = cell.createSpan({ text: '?', cls: 'kcp-note-hint' });
      hint.title = column.hint;
      hint.setAttribute('aria-label', column.hint);
    }
    // The column the Remove buttons stand in, which names nothing.
    head.createEl('th');

    const body = table.createEl('tbody');
    this.plugin.noteKinds().forEach((kind, at) => {
      const row = body.createEl('tr', { cls: 'kcp-note-kind' });

      field(new TextComponent(row.createEl('td')), 'Callout', 'note')
        .setValue(kind.callout)
        .onChange((value) => this.setKind(at, { callout: value.trim() }));

      field(
        new TextComponent(row.createEl('td')),
        ANCHOR.name,
        'n',
        ANCHOR.hint,
      )
        .setValue(kind.letter)
        .onChange((value) => {
          // Letters, and nothing else. A kind anchoring its notes on a digit
          // — or on nothing at all — anchors them `^shedd-psa-1-11`, which is
          // what a verse is anchored, so the chapter would carry a note its
          // own verses cannot be told apart from. A field being typed into
          // keeps the letter it had until it holds one.
          const letter = value.trim();
          if (LETTERS.test(letter)) this.setKind(at, { letter });
        });

      field(new TextComponent(row.createEl('td')), 'Name', 'Nota')
        .setValue(kind.title)
        .onChange((value) => this.setKind(at, { title: value.trim() }));

      new ButtonComponent(row.createEl('td'))
        .setButtonText('Remove')
        .onClick(async () => {
          const kinds = this.plugin.noteKinds();
          // The last one stays. A list left empty is a list the command has
          // nothing to offer from, so it is read as no answer and the three
          // written here answer instead — which would put back the very rows
          // that were just taken away, and add to them the next time.
          if (kinds.length === 1) return;
          this.plugin.settings.noteKinds = kinds.filter((_, i) => i !== at);
          await this.plugin.saveSettings();
          this.display();
        });
    });

    containerEl.createEl('h3', { text: 'Sidebar' });

    new Setting(containerEl)
      .setName('Follow cursor')
      .setDesc(
        'Follows the cursor while editing and the scroll position (or a clicked verse) ' +
          'while reading. Off: the sidebar only updates when you switch notes.',
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.followCursor)
          .onChange(async (value) => {
            this.plugin.settings.followCursor = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Show the version you are reading')
      .setDesc('Include the current version in the list.')
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.showCurrentVersion)
          .onChange(async (value) => {
            this.plugin.settings.showCurrentVersion = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Open sidebar on startup').addToggle((t) =>
      t
        .setValue(this.plugin.settings.openSidebarOnStart)
        .onChange(async (value) => {
          this.plugin.settings.openSidebarOnStart = value;
          await this.plugin.saveSettings();
        }),
    );

    new Setting(containerEl)
      .setName('Detected versions')
      .setDesc(detected(this.plugin.listSources()) || 'none')
      .addButton((b) =>
        b.setButtonText('Reload').onClick(() => {
          this.plugin.invalidateIndex();
          this.plugin.registerVersionCommands();
          this.plugin.chapterCache.clear();
          this.display();
        }),
      );

    // listSources() above builds the index, so the conflicts are known by now.
    const conflicts = this.plugin.chapterConflicts;
    if (conflicts.size) {
      const setting = new Setting(containerEl)
        .setName('Duplicate files')
        .setDesc(
          'Same chapter, or same book, claimed by more than one file, so it is skipped. ' +
            'Keep one of each.',
        );
      const list = setting.descEl.createEl('ul', { cls: 'kcp-conflicts' });
      for (const files of conflicts.values()) {
        list.createEl('li', { text: files.map((f) => f.path).join('  |  ') });
      }
    }
  }

  /**
   * One kind rewritten, with the rest left as they are.
   *
   * The rows are read back from the settings on every keystroke rather than
   * held in the tab, so a row edited while another was added lands on what is
   * saved rather than on what the tab was drawn from.
   */
  async setKind(at: number, over: Partial<NoteKind>) {
    const kinds = this.plugin
      .noteKinds()
      .map((kind, i) => (i === at ? { ...kind, ...over } : kind));
    this.plugin.settings.noteKinds = kinds;
    await this.plugin.saveSettings();
  }
}

/** Obsidian's own page on the callouts it ships, and on writing one. */
const CALLOUT_DOCS = 'https://help.obsidian.md/callouts#Supported+types';
const CUSTOM_CALLOUT_DOCS =
  'https://help.obsidian.md/callouts#Customize+callouts';

/**
 * What the kinds are, and what a kind of the reader's own has to name.
 *
 * A callout is drawn by whoever defined it: `note` is Obsidian's, the two
 * beside it are this plugin's, and one this vault has never heard of is
 * written in the plain grey of a callout nothing draws — which is a hard thing
 * to work out from the note it leaves behind. So the two places a callout can
 * come from are said here, and linked.
 */
function kindsDesc(): DocumentFragment {
  const desc = document.createDocumentFragment();
  desc.append(
    'What "Write a note on this verse" offers, one row each, in the order ' +
      'they are offered in. A row says three things: the callout the note is ' +
      'written as, the letter its anchors carry — n2, h2, r2, which is what ' +
      'keeps one kind numbered apart from another — and the name it is given ' +
      'in the title of every note written as it. ',
    '`note` is one of ',
    docs(CALLOUT_DOCS, "Obsidian's own callouts"),
    '; `homiletic` and `reviewers` are drawn by this plugin. A kind of your ' +
      'own has to name a callout something draws: one of Obsidian’s, or ',
    docs(CUSTOM_CALLOUT_DOCS, 'a callout of your own'),
    ', written into your theme or a CSS snippet.',
  );
  return desc;
}

/** A link out to the app's own documentation, opened where links open. */
function docs(href: string, text: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  return link;
}

/** What a letter a kind anchors its notes with may be made of. */
const LETTERS = /^[a-z]+$/i;

/** The column a kind's letter is typed into, which is the one that needs saying. */
const ANCHOR = {
  name: 'Anchor',
  hint: "A letter, written into the block id of every note of this kind: `n` anchors them `^shedd-psa-1-n2`. It is what keeps one kind's numbering apart from another's.",
};

/** What a row of the kinds table says, left to right. */
const COLUMNS: { name: string; hint?: string }[] = [
  { name: 'Callout' },
  ANCHOR,
  { name: 'Name' },
];

/**
 * A letter no kind is anchoring its notes with, for the kind being added.
 *
 * Each letter is a numbering of its own — `n1` counts apart from `h1` — so a
 * new kind sharing a letter shares the count, and the anchors stop saying
 * which kind they belong to. A vault that has somehow used every letter is
 * given a pair of them, since a kind on no letter at all anchors its notes
 * where the verses are.
 */
function freeLetter(kinds: NoteKind[]): string {
  const taken = new Set(kinds.map((kind) => kind.letter));
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const free = letters.find((letter) => !taken.has(letter));
  if (free) return free;

  // Every single letter is spoken for, so the pairs are asked next: a kind
  // added on no letter at all would anchor its notes the way a verse is
  // anchored, which is the one answer this must not give.
  for (const first of letters) {
    for (const second of letters) {
      if (!taken.has(first + second)) return first + second;
    }
  }
  return '';
}

/**
 * A field of a kind, named twice over: the placeholder says what belongs in it
 * while it is empty, and the tooltip says it again once it is full, since a
 * row of four boxes reads as four boxes otherwise.
 */
function field(
  text: TextComponent,
  name: string,
  example: string,
  hint = name,
) {
  text.inputEl.setAttribute('aria-label', hint);
  text.inputEl.title = hint;
  return text.setPlaceholder(example);
}

/**
 * The versions the vault holds, saying which of them a link cannot point at.
 *
 * A partial version is listed with the rest — it is a version, and the point
 * of the list is what was found — with the one thing that is different about
 * it said beside it, rather than left to be discovered by a reference that
 * refuses to offer it.
 */
function detected(sources: Source[]): string {
  return sources
    .map((s) => (s.complete ? s.code : `${s.code} (partial)`))
    .join(', ');
}
