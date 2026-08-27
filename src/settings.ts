import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';

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
        .setName('Duplicate chapter files')
        .setDesc('Same chapter claimed by more than one file, so it is skipped. Keep one of each.');
      const list = setting.descEl.createEl('ul', { cls: 'kcp-conflicts' });
      for (const files of conflicts.values()) {
        list.createEl('li', { text: files.map((f) => f.path).join('  |  ') });
      }
    }
  }
}
