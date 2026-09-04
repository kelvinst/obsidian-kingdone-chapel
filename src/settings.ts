import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';

import type { Lang } from './books';
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
