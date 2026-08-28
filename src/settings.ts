import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';

import type { Lang } from './books';
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
      .setName('Bible folder')
      .setDesc('Folder holding the version folders (ARA, NVI, ...). Inside each version, folders are ignored — only file names matter.')
      .addText((text) =>
        text
          .setPlaceholder('Bibles')
          .setValue(this.plugin.settings.bibleFolder)
          .onChange(async (value) => {
            this.plugin.settings.bibleFolder = value.replace(/\/+$/, '');
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Open in new tab')
      .setDesc('Off: replace the current tab.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openInNewTab).onChange(async (value) => {
          this.plugin.settings.openInNewTab = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Hidden versions')
      .setDesc('Comma separated. E.g.: Shedd, Kelvin')
      .addText((text) =>
        text.setValue(this.plugin.settings.hiddenVersions.join(', ')).onChange(async (value) => {
          this.plugin.settings.hiddenVersions = value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl('h3', { text: 'References' });

    new Setting(containerEl)
      .setName('Default version for @ references')
      .setDesc(
        'Version `@Joao 1.1` links to. Name one in the reference itself (`@ARA Joao 1.1`) ' +
          'to override it. Automatic uses the version of the note you are writing in, ' +
          'falling back to the first one in the vault.'
      )
      .addDropdown((drop) => {
        drop.addOption('', 'Automatic');
        for (const version of this.plugin.listVersions()) {
          drop.addOption(version, this.plugin.label(version));
        }
        drop.setValue(this.plugin.settings.defaultVersion).onChange(async (value) => {
          this.plugin.settings.defaultVersion = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Language for @ references')
      .setDesc(
        'Language book names and abbreviations are read and written in. ' +
          'No preference reads every language at once, which is how `@Jn` offers ' +
          'both Jonas and John — the same abbreviation stands for one book in ' +
          'Portuguese and another in English. Naming a language leaves the rest out.'
      )
      .addDropdown((drop) => {
        drop.addOption('', 'No preference');
        drop.addOption('pt', 'Portuguese');
        drop.addOption('en', 'English');
        drop.setValue(this.plugin.settings.referenceLanguage).onChange(async (value) => {
          this.plugin.settings.referenceLanguage = value as Lang | '';
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: 'Sidebar' });

    new Setting(containerEl)
      .setName('Follow cursor')
      .setDesc(
        'Follows the cursor while editing and the scroll position (or a clicked verse) ' +
          'while reading. Off: the sidebar only updates when you switch notes.'
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.followCursor).onChange(async (value) => {
          this.plugin.settings.followCursor = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Show the version you are reading')
      .setDesc('Include the current version in the list.')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showCurrentVersion).onChange(async (value) => {
          this.plugin.settings.showCurrentVersion = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Open sidebar on startup')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openSidebarOnStart).onChange(async (value) => {
          this.plugin.settings.openSidebarOnStart = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Detected versions')
      .setDesc(this.plugin.listVersions().join(', ') || 'none')
      .addButton((b) =>
        b.setButtonText('Reload').onClick(() => {
          this.plugin.invalidateIndex();
          this.plugin.registerVersionCommands();
          this.plugin.chapterCache.clear();
          this.display();
        })
      );

    // listVersions() above builds the index, so the conflicts are known by now.
    const conflicts = this.plugin.chapterConflicts;
    if (conflicts.size) {
      const setting = new Setting(containerEl)
        .setName('Duplicate files')
        .setDesc(
          'Same chapter, or same book, claimed by more than one file, so it is skipped. ' +
            'Keep one of each.'
        );
      const list = setting.descEl.createEl('ul', { cls: 'kcp-conflicts' });
      for (const files of conflicts.values()) {
        list.createEl('li', { text: files.map((f) => f.path).join('  |  ') });
      }
    }
  }
}
