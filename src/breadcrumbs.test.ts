// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkdownView, TFile } from 'obsidian';

import { chapter, chapterPath, harness, pane } from '../test/harness';
import type { Harness } from '../test/harness';
import { Breadcrumbs } from './breadcrumbs';

/** The books of a version, each with the chapters named. */
function books(
  version: string,
  entries: [number, string, number[]][],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [index, code, chapters] of entries) {
    for (const number of chapters) {
      Object.assign(out, chapter(version, index, code, number, ['Um verso.']));
    }
  }
  return out;
}

const vault = {
  ...books('NVI', [
    [1, 'GEN', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    [2, 'EXO', [1]],
    [3, 'LEV', [1]],
    [4, 'NUM', [1]],
    [5, 'DEU', [1]],
    [6, 'JOS', [1]],
    [7, 'JDG', [1]],
    [8, 'RUT', [1]],
    [9, '1SA', [1]],
    [40, 'MAT', [1]],
  ]),
  ...books('ARA', [[1, 'GEN', [1]]]),
  ...books('ACF', [[1, 'GEN', [2]]]),
};

let world: Harness;
let crumbs: Breadcrumbs;
let view: MarkdownView;

function chapterFile(version: string, book: number, code: string, n: number) {
  return world.vault.getAbstractFileByPath(
    chapterPath(version, book, code, n),
  ) as TFile;
}

/**
 * A pane reading a chapter, in the workspace, with its bar drawn. The pane
 * goes into the document: a dropdown closes on events caught at the document,
 * which never reach a pane that is not in it.
 */
function reading(file: TFile | null): MarkdownView {
  const opened = pane(world.app, { file });
  document.body.append(opened.containerEl);
  world.workspace.addLeaf('markdown', opened);
  crumbs.refresh();
  return opened;
}

function bar(of: MarkdownView = view): HTMLElement | null {
  return of.containerEl.querySelector('.kcp-crumbs');
}

function crumb(index: number): HTMLElement {
  return bar()!.querySelectorAll<HTMLElement>('.kcp-crumb')[index];
}

function menu(): HTMLElement | null {
  return document.body.querySelector('.kcp-crumb-menu');
}

function entries(): string[] {
  return Array.from(
    menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item:not(.is-hidden)'),
  ).map((el) => el.textContent || '');
}

/** The entry Enter would take, of those a query has left showing. */
function active(): string {
  return (
    menu()!.querySelector('.kcp-crumb-item:not(.is-hidden).is-active')
      ?.textContent || ''
  );
}

function click(el: HTMLElement, init: MouseEventInit = {}) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
}

beforeEach(() => {
  world = harness(vault, { language: 'pt' });
  crumbs = new Breadcrumbs(world.plugin);
  view = reading(chapterFile('NVI', 1, 'GEN', 2));
});

afterEach(() => {
  crumbs.clear();
  document.body.innerHTML = '';
});

describe('refresh', () => {
  it('names the version, the book and the chapter', () => {
    expect(
      Array.from(bar()!.querySelectorAll('.kcp-crumb')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['NVI', 'Gênesis', '2']);
  });

  it('sits above the note, so it stays put while the note scrolls', () => {
    expect(bar()!.nextElementSibling).toBe(view.contentEl);
  });

  it('leaves a pane reading something else without one', () => {
    const other = reading(null);
    expect(bar(other)).toBeNull();
  });

  it('takes the bar off a pane that moves on to another note', () => {
    expect(bar()).not.toBeNull();
    view.file = null;
    crumbs.refresh();
    expect(bar()).toBeNull();
  });

  it('takes every bar off once the setting is turned off', () => {
    world.plugin.settings.showBreadcrumbs = false;
    crumbs.refresh();
    expect(bar()).toBeNull();
  });

  it('leaves a pane that holds no note at all alone', () => {
    world.workspace.addLeaf('markdown', { notAView: true });
    expect(() => crumbs.refresh()).not.toThrow();
  });

  it('leaves the bar it drew where it is', () => {
    const drawn = bar();
    crumbs.refresh();
    expect(bar()).toBe(drawn);
  });

  it('draws it again once a neighbouring chapter goes', () => {
    const drawn = bar();
    world.vault.remove(chapterPath('NVI', 1, 'GEN', 3));
    world.plugin.invalidateIndex();
    crumbs.refresh();
    expect(bar()).not.toBe(drawn);
  });

  it('drops every bar, and any list, when the plugin goes', () => {
    crumbs.clear();
    expect(document.querySelectorAll('.kcp-crumbs')).toHaveLength(0);
  });
});

describe('the arrows', () => {
  function arrow(which: 'left' | 'right'): HTMLElement {
    const found = bar()!.querySelector<HTMLElement>(
      `.kcp-crumb-arrow[data-icon="arrow-${which}"]`,
    );
    if (!found) throw new Error(`no ${which} arrow`);
    return found;
  }

  it('walks to the chapter before and the chapter after', () => {
    click(arrow('right'));
    expect(world.workspace.opened.at(-1)).toMatchObject({
      link: chapterPath('NVI', 1, 'GEN', 3),
      from: chapterPath('NVI', 1, 'GEN', 2),
      newLeaf: false,
    });

    click(arrow('left'));
    expect(world.workspace.opened.at(-1)?.link).toBe(
      chapterPath('NVI', 1, 'GEN', 1),
    );
  });

  it('walks out of a book straight into the next', () => {
    view = reading(chapterFile('NVI', 1, 'GEN', 10));
    click(arrow('right'));
    expect(world.workspace.opened.at(-1)?.link).toBe(
      chapterPath('NVI', 2, 'EXO', 1),
    );
  });

  it('opens beside the pane when the click carried Ctrl or Cmd', () => {
    click(arrow('right'), { metaKey: true });
    expect(world.workspace.opened.at(-1)?.newLeaf).toBe('tab');
  });

  it('keeps its place, unclickable, at either end of the version', () => {
    view = reading(chapterFile('NVI', 1, 'GEN', 1));
    expect(arrow('left').hasClass('is-disabled')).toBe(true);
    click(arrow('left'));
    expect(world.workspace.opened).toHaveLength(0);

    view = reading(chapterFile('NVI', 40, 'MAT', 1));
    expect(arrow('right').hasClass('is-disabled')).toBe(true);
  });
});

describe('the version list', () => {
  beforeEach(() => {
    click(crumb(0));
  });

  it('names every version, marking the one being read', () => {
    expect(entries()).toEqual(['ACF', 'ARA', 'NVI']);
    expect(menu()!.querySelector('.is-current')?.textContent).toBe('NVI');
  });

  it('greys a version that skips this chapter, and offers it anyway', () => {
    const missing = Array.from(
      menu()!.querySelectorAll('.kcp-crumb-item.is-missing'),
    ).map((el) => el.textContent);
    expect(missing).toEqual(['ARA']);
  });

  it('opens the passage in the version chosen, and closes', async () => {
    const acf = Array.from(
      menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item'),
    ).find((el) => el.textContent === 'ACF')!;
    click(acf);
    expect(menu()).toBeNull();
    // The jump reads the file for an anchor before it opens anything.
    await vi.waitFor(() =>
      expect(world.workspace.opened.at(-1)?.link).toContain('ACF-01-GEN-002'),
    );
  });

  it('falls back to the passage the bar names when the pane empties', async () => {
    view.file = null;
    const acf = Array.from(
      menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item'),
    ).find((el) => el.textContent === 'ACF')!;
    click(acf);
    await vi.waitFor(() =>
      expect(world.workspace.opened.at(-1)?.link).toContain('ACF-01-GEN-002'),
    );
  });

  it('reads the verse now rather than when the bar was drawn', () => {
    const at = vi.spyOn(world.plugin, 'locationOf');
    const acf = Array.from(
      menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item'),
    ).find((el) => el.textContent === 'ACF')!;
    click(acf);
    expect(at).toHaveBeenLastCalledWith(view.file, view);
  });
});

describe('the book list', () => {
  beforeEach(() => {
    click(crumb(1));
  });

  it('files the books under the testaments they belong to', () => {
    expect(
      Array.from(menu()!.querySelectorAll('.kcp-crumb-head')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['Antigo Testamento', 'Novo Testamento']);
  });

  it('names every book the version carries, marking the one being read', () => {
    expect(entries()).toEqual([
      'Gênesis',
      'Êxodo',
      'Levítico',
      'Números',
      'Deuteronômio',
      'Josué',
      'Juízes',
      'Rute',
      '1 Samuel',
      'Mateus',
    ]);
    expect(menu()!.querySelector('.is-current')?.textContent).toBe('Gênesis');
  });

  it('breaks the testaments down when that is asked for', () => {
    crumbs.close();
    world.plugin.settings.bookCategories = true;
    click(crumb(1));
    expect(
      Array.from(menu()!.querySelectorAll('.kcp-crumb-subhead')).map(
        (el) => el.textContent,
      ),
    ).toEqual(['Lei', 'Históricos', 'Evangelhos']);
  });

  it('opens a book on the first chapter it holds', () => {
    const mateus = Array.from(
      menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item'),
    ).find((el) => el.textContent === 'Mateus')!;
    click(mateus);
    expect(world.workspace.opened.at(-1)?.link).toBe(
      chapterPath('NVI', 40, 'MAT', 1),
    );
  });
});

describe('the chapter list', () => {
  beforeEach(() => {
    click(crumb(2));
  });

  it('numbers every chapter of the book, marking the one being read', () => {
    expect(entries()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(menu()!.querySelector('.is-current')?.textContent).toBe('2');
  });

  it('lays them out in rows rather than in one long column', () => {
    expect(
      menu()!
        .querySelector<HTMLElement>('.kcp-crumb-grid')
        ?.style.getPropertyValue('--kcp-crumb-columns'),
    ).toBe('5');
  });

  it('opens the chapter that was chosen', () => {
    click(
      Array.from(menu()!.querySelectorAll<HTMLElement>('.kcp-crumb-item')).find(
        (el) => el.textContent === '7',
      )!,
    );
    expect(world.workspace.opened.at(-1)?.link).toBe(
      chapterPath('NVI', 1, 'GEN', 7),
    );
  });
});

describe('a list that is worth searching', () => {
  function field(): HTMLInputElement | null {
    return menu()!.querySelector('.kcp-crumb-input');
  }

  function type(query: string) {
    const input = field()!;
    input.value = query;
    input.dispatchEvent(new Event('input'));
  }

  function press(key: string) {
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  it('gets no field where it is read faster than it is typed', () => {
    click(crumb(0));
    expect(field()).toBeNull();
  });

  it('gets one once it is longer than a handful', () => {
    click(crumb(1));
    expect(field()?.getAttribute('placeholder')).toBe('Search books');
  });

  it('finds a name past the accents that were skipped while typing', () => {
    click(crumb(1));
    type('juizes');
    expect(entries()).toEqual(['Juízes']);
  });

  it('matches anywhere in the name, not only at its start', () => {
    click(crumb(1));
    type('sam');
    expect(entries()).toEqual(['1 Samuel']);
  });

  it('takes a heading down with the books under it', () => {
    click(crumb(1));
    type('mateus');
    const shown = Array.from(
      menu()!.querySelectorAll(
        '.kcp-crumb-group:not(.is-hidden) .kcp-crumb-head',
      ),
    ).map((el) => el.textContent);
    expect(shown).toEqual(['Novo Testamento']);
  });

  it('says so where nothing matches at all', () => {
    click(crumb(1));
    type('vulgata');
    expect(entries()).toEqual([]);
    expect(
      menu()!.querySelector('.kcp-crumb-empty')?.hasClass('is-hidden'),
    ).toBe(false);
  });

  it('opens on the book being read, and on the best match once narrowed', () => {
    click(crumb(1));
    expect(active()).toBe('Gênesis');
    type('u');
    expect(active()).toBe('Números');
  });

  it('walks the list with the arrows, and takes one with Enter', () => {
    click(crumb(1));
    press('ArrowDown');
    expect(active()).toBe('Êxodo');
    press('ArrowUp');
    expect(active()).toBe('Gênesis');

    press('Enter');
    expect(menu()).toBeNull();
    expect(world.workspace.opened.at(-1)?.link).toBe(
      chapterPath('NVI', 1, 'GEN', 1),
    );
  });

  it('stays where it is at either end of what is left', () => {
    click(crumb(1));
    press('ArrowUp');
    expect(active()).toBe('Gênesis');
  });

  it('goes on typing for every other key', () => {
    click(crumb(1));
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      cancelable: true,
    });
    field()!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('takes nothing with Enter where nothing is left', () => {
    click(crumb(1));
    type('vulgata');
    press('Enter');
    expect(world.workspace.opened).toHaveLength(0);
  });

  it('focuses the field once the list is placed', () => {
    vi.useFakeTimers();
    click(crumb(1));
    vi.runAllTimers();
    expect(document.activeElement).toBe(field());
    vi.useRealTimers();
  });
});

describe('closing a list', () => {
  beforeEach(() => {
    click(crumb(1));
  });

  it('closes on Escape', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu()).toBeNull();
  });

  it('stays open for any other key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(menu()).not.toBeNull();
  });

  it('closes on a click anywhere else', () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu()).toBeNull();
  });

  it('stays open for a click inside it', () => {
    menu()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu()).not.toBeNull();
  });

  it('closes rather than reopening when its own crumb is clicked again', () => {
    crumb(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu()).toBeNull();
    click(crumb(1));
    expect(menu()).toBeNull();
    click(crumb(1));
    expect(menu()).not.toBeNull();
  });

  it('closes when the window is resized out from under it', () => {
    window.dispatchEvent(new Event('resize'));
    expect(menu()).toBeNull();
  });

  it('closes when the page behind it scrolls, but not when it does', () => {
    menu()!.dispatchEvent(new Event('scroll', { bubbles: true }));
    expect(menu()).not.toBeNull();
    document.dispatchEvent(new Event('scroll'));
    expect(menu()).toBeNull();
  });

  it('replaces whatever was open when another crumb is clicked', () => {
    click(crumb(2));
    expect(document.querySelectorAll('.kcp-crumb-menu')).toHaveLength(1);
    expect(menu()!.querySelector('.kcp-crumb-grid')).not.toBeNull();
  });
});

describe('where a list is placed', () => {
  function place(top: number, bottom: number, left: number) {
    crumb(1).getBoundingClientRect = () =>
      ({ top, bottom, left, right: left + 60 }) as DOMRect;
  }

  function size(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: height,
      configurable: true,
    });
  }

  function measure(width: number, height: number) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      value: width,
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      value: height,
      configurable: true,
    });
  }

  afterEach(() => {
    for (const name of ['offsetWidth', 'offsetHeight']) {
      Reflect.deleteProperty(HTMLElement.prototype, name);
    }
  });

  it('hangs under the crumb it belongs to', () => {
    size(1000, 800);
    measure(200, 100);
    place(40, 60, 120);
    click(crumb(1));
    expect(menu()!.style.left).toBe('120px');
    expect(menu()!.style.top).toBe('64px');
  });

  it('flips above the crumb where it would not fit below', () => {
    size(1000, 200);
    measure(200, 100);
    place(120, 140, 10);
    click(crumb(1));
    expect(menu()!.style.top).toBe('16px');
  });

  it('is pulled back on screen where it fits neither way', () => {
    size(1000, 150);
    measure(200, 120);
    place(10, 30, 10);
    click(crumb(1));
    expect(menu()!.style.top).toBe('22px');
  });

  it('is pulled in from the right edge of the window', () => {
    size(300, 800);
    measure(200, 100);
    place(40, 60, 250);
    click(crumb(1));
    expect(menu()!.style.left).toBe('92px');
  });

  it('is never pushed off the left edge either', () => {
    size(100, 800);
    measure(200, 100);
    place(40, 60, 0);
    click(crumb(1));
    expect(menu()!.style.left).toBe('8px');
  });
});
