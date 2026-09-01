import { ItemView, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';

import { VIEW_TYPE } from './types';
import type { Location, VersionItem } from './types';
import type KingdoneChapelPlugin from './main';

export class KingdoneChapelView extends ItemView {
  plugin: KingdoneChapelPlugin;
  pinned = false;
  loc: Location | null = null;
  key: string | null = null;
  headerEl: HTMLElement;
  listEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: KingdoneChapelPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Kingdone Chapel';
  }

  getIcon(): string {
    return 'church';
  }

  async onOpen() {
    this.contentEl.addClass('kcp-view');
    this.headerEl = this.contentEl.createDiv({ cls: 'kcp-header' });
    this.listEl = this.contentEl.createDiv({ cls: 'kcp-list' });

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.refresh()),
    );
    this.registerEvent(
      this.app.workspace.on('file-open', () => this.refresh()),
    );
    // Switching between editing and reading swaps where the verse comes from.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.refresh()),
    );
    // Obsidian emits no cursor event, so poll the active editor for verse changes.
    this.registerInterval(window.setInterval(() => this.refresh(), 400));

    await this.refresh(true);
  }

  /** Identity of what is currently rendered, so polling is a cheap no-op. */
  locKey(loc: Location | null): string {
    if (!loc) return 'none';
    return `${loc.version}/${loc.bookIndex}/${loc.chapter}/${loc.verse}`;
  }

  async refresh(force = false) {
    if (this.pinned && !force) return;

    const loc =
      this.plugin.settings.followCursor || force || !this.loc
        ? this.plugin.currentLocation()
        : this.loc;
    const key =
      this.locKey(loc) + (this.plugin.settings.followCursor ? '' : ':static');
    if (!force && key === this.key) return;
    this.key = key;
    this.loc = loc;

    this.renderHeader(loc);
    this.listEl.empty();

    if (!loc) {
      this.listEl.createDiv({
        cls: 'kcp-empty',
        text: 'Open a Bible chapter to compare versions.',
      });
      return;
    }

    const items = await this.plugin.versionsFor(
      loc,
      this.plugin.settings.showCurrentVersion,
    );
    if (!items.length) {
      this.listEl.createDiv({
        cls: 'kcp-empty',
        text: 'No other version has this passage.',
      });
      return;
    }
    // Versions sharing a heading arrive together, so a heading is due whenever
    // the one an item names is not the one before it. A version naming none
    // closes whatever was open and sits in the list itself.
    let group: string | null = null;
    for (const item of items) {
      if (item.group !== group) {
        group = item.group;
        if (group) this.listEl.createDiv({ cls: 'kcp-group', text: group });
      }
      this.renderCard(item, loc);
    }
  }

  renderHeader(loc: Location | null) {
    this.headerEl.empty();
    const ref = loc
      ? `${loc.book} ${loc.chapter}${loc.verse ? '.' + loc.verse : ''}`
      : 'No passage';
    this.headerEl.createDiv({ cls: 'kcp-ref', text: ref });

    const pin = this.headerEl.createEl('button', {
      cls: 'kcp-pin clickable-icon' + (this.pinned ? ' is-active' : ''),
      attr: {
        'aria-label': this.pinned
          ? 'Unpin (follow cursor again)'
          : 'Pin this verse',
      },
    });
    setIcon(pin, this.pinned ? 'pin' : 'pin-off');
    pin.onclick = () => {
      this.pinned = !this.pinned;
      this.refresh(true);
    };
  }

  renderCard(item: VersionItem, loc: Location) {
    const card = this.listEl.createDiv({
      cls: 'kcp-card' + (item.isCurrent ? ' kcp-card-current' : ''),
    });

    const head = card.createDiv({ cls: 'kcp-card-head' });
    head.createSpan({ cls: 'kcp-version', text: item.label });
    if (item.matchedVerse && loc.verse && item.matchedVerse !== loc.verse) {
      // e.g. MENS puts verses 1-2 under verse 1
      head.createSpan({ cls: 'kcp-merged', text: `v.${item.matchedVerse}` });
    }

    const body = card.createDiv({ cls: 'kcp-text' });
    if (item.text) {
      MarkdownRenderer.render(this.app, item.text, body, item.file.path, this);
    } else {
      body.setText('—');
    }

    card.onclick = (evt) => {
      if (evt.altKey) {
        navigator.clipboard.writeText(item.text);
        new Notice(`Copied ${item.label}`);
        return;
      }
      this.plugin.jumpTo(
        item.version,
        loc,
        evt.ctrlKey || evt.metaKey ? 'tab' : false,
      );
    };
  }

  async onClose() {
    this.contentEl.empty();
  }
}
