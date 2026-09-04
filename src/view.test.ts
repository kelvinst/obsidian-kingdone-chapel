// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { MarkdownRenderer, clearNotices, notices } from '../test/obsidian';
import { chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { VIEW_TYPE } from './types';
import type { Location } from './types';
import { KingdoneChapelView } from './view';

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, ['No princípio', 'A terra era sem forma']),
  ...chapter('ARA', 1, 'GEN', 1, ['No princípio, criou Deus']),
};

let world: Harness;
let view: KingdoneChapelView;
let loc: Location;
let currentLocation: MockInstance;

beforeEach(() => {
  clearNotices();
  MarkdownRenderer.rendered = [];
  world = harness(vault, { labels: { ARA: 'Almeida Revista e Atualizada' } });
  loc = {
    version: 'NVI',
    bookIndex: 1,
    book: 'Gênesis',
    chapter: 1,
    verse: 1,
    file: world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as Location['file'],
  };
  currentLocation = vi
    .spyOn(world.plugin, 'currentLocation')
    .mockReturnValue(loc);
  const leaf = world.workspace.addLeaf(VIEW_TYPE);
  view = new KingdoneChapelView(leaf as never, world.plugin);
  leaf.view = view;
});

afterEach(() => {
  view.unload();
  vi.useRealTimers();
  // The clipboard is one object for the whole file, so a spy on it outlives
  // the test that put it there unless it is taken off here.
  vi.restoreAllMocks();
});

describe('what the pane says it is', () => {
  it('names itself for the workspace to find it by', () => {
    expect(view.getViewType()).toBe(VIEW_TYPE);
    expect(view.getDisplayText()).toBe('Kingdone Chapel');
    expect(view.getIcon()).toBe('church');
  });
});

describe('onOpen', () => {
  it('lays out a header over a list', async () => {
    await view.onOpen();
    expect(view.contentEl.hasClass('kcp-view')).toBe(true);
    expect(view.headerEl.hasClass('kcp-header')).toBe(true);
    expect(view.listEl.hasClass('kcp-list')).toBe(true);
  });

  it('redraws for everything that can change the passage', async () => {
    await view.onOpen();
    for (const event of ['active-leaf-change', 'file-open', 'layout-change']) {
      expect(world.workspace.count(event)).toBe(1);
    }
  });

  it('polls the editor, which emits nothing when the cursor moves', async () => {
    vi.useFakeTimers();
    await view.onOpen();
    const refresh = vi.spyOn(view, 'refresh');
    vi.advanceTimersByTime(400);
    expect(refresh).toHaveBeenCalled();
  });

  it('redraws whenever the workspace says the pane has changed', async () => {
    await view.onOpen();
    const refresh = vi.spyOn(view, 'refresh');
    for (const event of ['active-leaf-change', 'file-open', 'layout-change']) {
      world.workspace.trigger(event);
    }
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('draws the passage in front before anything has moved', async () => {
    await view.onOpen();
    expect(view.headerEl.querySelector('.kcp-ref')?.textContent).toBe(
      'Gênesis 1.1',
    );
  });
});

describe('refresh', () => {
  beforeEach(async () => {
    await view.onOpen();
  });

  it('leaves a pinned pane alone, and redraws it when forced', async () => {
    await view.refresh(true);
    view.pinned = true;
    currentLocation.mockReturnValue({ ...loc, verse: 2 });

    await view.refresh();
    expect(view.headerEl.querySelector('.kcp-ref')?.textContent).toBe(
      'Gênesis 1.1',
    );

    await view.refresh(true);
    expect(view.headerEl.querySelector('.kcp-ref')?.textContent).toBe(
      'Gênesis 1.2',
    );
  });

  it('draws nothing again for a passage it is already showing', async () => {
    const versionsFor = vi.spyOn(world.plugin, 'versionsFor');
    currentLocation.mockReturnValue({ ...loc, verse: 2 });
    await view.refresh();
    await view.refresh();
    expect(versionsFor).toHaveBeenCalledTimes(1);
  });

  it('asks for the passage in front only while it follows the cursor', async () => {
    world.plugin.settings.followCursor = false;
    await view.refresh(true);
    currentLocation.mockReturnValue({ ...loc, verse: 2 });

    await view.refresh();
    expect(view.loc?.verse).toBe(1);
    expect(view.key).toBe('NVI/1/1/1:static');
  });

  it('says what to open when nothing is', async () => {
    currentLocation.mockReturnValue(null);
    await view.refresh();
    expect(view.headerEl.querySelector('.kcp-ref')?.textContent).toBe(
      'No passage',
    );
    expect(view.listEl.querySelector('.kcp-empty')?.textContent).toBe(
      'Open a Bible chapter to compare versions.',
    );
  });

  it('says so when no other version carries the passage', async () => {
    world.vault.remove(chapterPath('ARA', 1, 'GEN', 1));
    world.plugin.invalidateIndex();
    await view.refresh(true);
    expect(view.listEl.querySelector('.kcp-empty')?.textContent).toBe(
      'No other version has this passage.',
    );
  });

  it('gives every other version a card', async () => {
    await view.refresh(true);
    const cards = view.listEl.querySelectorAll('.kcp-card');
    expect(cards.length).toBe(1);
    expect(cards[0].querySelector('.kcp-version')?.textContent).toBe(
      'Almeida Revista e Atualizada',
    );
  });
});

describe('locKey', () => {
  it('is nothing at all for no passage', () => {
    expect(view.locKey(null)).toBe('none');
  });

  it('names the version, the book, the chapter and the verse', () => {
    expect(view.locKey(loc)).toBe('NVI/1/1/1');
  });
});

describe('the pin', () => {
  beforeEach(async () => {
    await view.onOpen();
  });

  it('offers to hold the verse, and then to let it go again', async () => {
    await view.refresh(true);
    const pin = view.headerEl.querySelector('.kcp-pin') as HTMLElement;
    expect(pin.getAttribute('aria-label')).toBe('Pin this verse');
    expect(pin.getAttribute('data-icon')).toBe('pin-off');

    pin.click();
    expect(view.pinned).toBe(true);
    const pinned = view.headerEl.querySelector('.kcp-pin') as HTMLElement;
    expect(pinned.getAttribute('aria-label')).toBe(
      'Unpin (follow cursor again)',
    );
    expect(pinned.hasClass('is-active')).toBe(true);
  });
});

describe('a card', () => {
  beforeEach(async () => {
    await view.onOpen();
    MarkdownRenderer.rendered = [];
    await view.refresh(true);
  });

  function card(): HTMLElement {
    return view.listEl.querySelector('.kcp-card') as HTMLElement;
  }

  it('renders the verse as markdown, against the file it came from', () => {
    expect(MarkdownRenderer.rendered).toEqual([
      {
        markdown: 'No princípio, criou Deus',
        path: chapterPath('ARA', 1, 'GEN', 1),
      },
    ]);
  });

  it('marks the version being read when it is in the list', async () => {
    world.plugin.settings.showCurrentVersion = true;
    await view.refresh(true);
    const current = Array.from(
      view.listEl.querySelectorAll('.kcp-card'),
    ).filter((el) => el.hasClass('kcp-card-current'));
    expect(current.length).toBe(1);
  });

  it('says which verse it landed on when a version merges them', async () => {
    currentLocation.mockReturnValue({ ...loc, verse: 2 });
    await view.refresh(true);
    expect(card().querySelector('.kcp-merged')?.textContent).toBe('v.1');
  });

  it('writes a dash for a version with nothing there', async () => {
    world.vault.write(chapterPath('ARA', 1, 'GEN', 1), 'Sem versículos.');
    world.plugin.chapterCache.clear();
    await view.refresh(true);
    expect(card().querySelector('.kcp-text')?.textContent).toBe('—');
  });

  it('opens the version it was clicked on, in place', async () => {
    card().click();
    // The jump reads the file for an anchor before it opens anything.
    await vi.waitFor(() => expect(world.workspace.opened).toHaveLength(1));
    expect(world.workspace.opened[0].newLeaf).toBe(false);
  });

  it('opens it beside the note when the click carried Ctrl or Cmd', async () => {
    card().dispatchEvent(new MouseEvent('click', { metaKey: true }));
    await vi.waitFor(() => expect(world.workspace.opened).toHaveLength(1));
    expect(world.workspace.opened[0].newLeaf).toBe('tab');
  });

  it('copies the verse instead when the click carried Alt', async () => {
    const copy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    // The jump is watched where it is called rather than where it opens:
    // it reads the file for an anchor first, so nothing has been opened yet
    // whether or not the copy went on to make one.
    const jump = vi.spyOn(world.plugin, 'jumpTo');
    card().dispatchEvent(new MouseEvent('click', { altKey: true }));
    await vi.waitFor(() =>
      expect(copy).toHaveBeenCalledWith('No princípio, criou Deus'),
    );
    expect(jump).not.toHaveBeenCalled();
    expect(notices.at(-1)?.message).toBe('Copied Almeida Revista e Atualizada');
  });

  it('copies the words a version embeds, not the embed itself', async () => {
    world.vault.write(
      chapterPath('ARA', 1, 'GEN', 1),
      '![[NVI-01-GEN-001#^nvi-gen-1-1|flat]]\n^ara-gen-1-1',
    );
    world.plugin.chapterCache.clear();
    await view.refresh(true);
    const copy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    card().dispatchEvent(new MouseEvent('click', { altKey: true }));
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('No princípio'));
    expect(notices.at(-1)?.message).toBe('Copied Almeida Revista e Atualizada');
  });

  it('says nothing was copied where the card has nothing to copy', async () => {
    world.vault.write(chapterPath('ARA', 1, 'GEN', 1), 'Sem versículos.');
    world.plugin.chapterCache.clear();
    await view.refresh(true);
    const copy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    card().dispatchEvent(new MouseEvent('click', { altKey: true }));
    await vi.waitFor(() =>
      expect(notices.at(-1)?.message).toBe(
        'Almeida Revista e Atualizada has nothing to copy here.',
      ),
    );
    expect(copy).not.toHaveBeenCalled();
  });
});

describe('onClose', () => {
  it('leaves the pane empty behind it', async () => {
    await view.onOpen();
    await view.onClose();
    expect(view.contentEl.children.length).toBe(0);
  });
});
