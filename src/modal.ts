import { SuggestModal } from 'obsidian';
import type { App } from 'obsidian';

import type { Location, VersionItem } from './types';
import type KingdoneChapelPlugin from './main';

export class VersionSuggestModal extends SuggestModal<VersionItem> {
  plugin: KingdoneChapelPlugin;
  loc: Location;
  items: VersionItem[];

  constructor(
    app: App,
    plugin: KingdoneChapelPlugin,
    loc: Location,
    items: VersionItem[],
  ) {
    super(app);
    this.plugin = plugin;
    this.loc = loc;
    this.items = items;
    this.setPlaceholder(
      `${loc.book} ${loc.chapter}${loc.verse ? '.' + loc.verse : ''} — pick a version`,
    );
    this.setInstructions([
      { command: '↵', purpose: 'open' },
      { command: 'Ctrl/Cmd ↵', purpose: 'open in new tab' },
    ]);
  }

  getSuggestions(query: string): VersionItem[] {
    const q = query.toLowerCase();
    return this.items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.version.toLowerCase().includes(q),
    );
  }

  renderSuggestion(item: VersionItem, el: HTMLElement) {
    el.createEl('div', { text: item.label, cls: 'kcp-version' });
    if (item.text)
      el.createEl('small', { text: item.text, cls: 'kcp-preview' });
  }

  onChooseSuggestion(item: VersionItem, evt: MouseEvent | KeyboardEvent) {
    const newLeaf = evt && (evt.ctrlKey || evt.metaKey) ? 'tab' : undefined;
    this.plugin.jumpTo(item.version, this.loc, newLeaf);
  }
}
