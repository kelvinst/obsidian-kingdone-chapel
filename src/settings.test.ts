// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chapter, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { DEFAULT_SETTINGS } from './types';
import type { KingdoneChapelSettings } from './types';
import { KingdoneChapelSettingTab } from './settings';
import { DEFAULT_NOTE_KINDS } from './notes';

/** The block of one setting, found by the name written above it. */
function setting(container: HTMLElement, name: string): HTMLElement {
  const found = Array.from(
    container.querySelectorAll<HTMLElement>('.setting-item'),
  ).find((el) => el.querySelector('.setting-item-name')?.textContent === name);
  if (!found) throw new Error(`no setting named ${name}`);
  return found;
}

function control<T extends HTMLElement>(
  container: HTMLElement,
  name: string,
  selector: string,
): T {
  const el = setting(container, name).querySelector<T>(selector);
  if (!el) throw new Error(`${name} has no ${selector}`);
  return el;
}

function toggle(container: HTMLElement, name: string): HTMLInputElement {
  return control<HTMLInputElement>(container, name, 'input[type="checkbox"]');
}

/** Change a control the way the app does: set the value, then say so. */
function change(el: HTMLElement, event: 'change' | 'input') {
  el.dispatchEvent(new Event(event));
}

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, ['No princípio']),
  ...chapter('ARA', 1, 'GEN', 1, ['No princípio']),
};

let world: Harness;
let tab: KingdoneChapelSettingTab;
let containerEl: HTMLElement;

/**
 * The same vault with a partial version in it, drawn afresh: a version that
 * says it is not the whole Bible is listed like any other and offered as a
 * link target by nothing.
 */
function withKelvin(): KingdoneChapelSettingTab {
  const w = harness({
    ...vault,
    'Notas/Kelvin/Kelvin.md': '',
    'Notas/Kelvin/Kelvin-01-GEN-001.md': '1. O que eu penso ^kelvin-gen-1-1',
  });
  w.metadataCache.frontmatter.set('Notas/Kelvin/Kelvin.md', {
    bible: true,
    code: 'Kelvin',
    complete: false,
  });
  const drawn = new KingdoneChapelSettingTab(w.app, w.plugin);
  drawn.display();
  return drawn;
}

beforeEach(() => {
  world = harness(vault, { labels: { NVI: 'Nova Versão Internacional' } });
  tab = new KingdoneChapelSettingTab(world.app, world.plugin);
  containerEl = tab.containerEl;
  tab.display();
});

describe('the language', () => {
  it('offers no preference beside each language', () => {
    const drop = control<HTMLSelectElement>(containerEl, 'Language', 'select');
    expect(Array.from(drop.options).map((o) => o.value)).toEqual([
      '',
      'pt',
      'en',
    ]);
  });

  it('opens on the language already chosen', () => {
    world.plugin.settings.language = 'en';
    tab.display();
    expect(
      control<HTMLSelectElement>(containerEl, 'Language', 'select').value,
    ).toBe('en');
  });

  it('saves the language it is changed to', async () => {
    const drop = control<HTMLSelectElement>(containerEl, 'Language', 'select');
    drop.value = 'pt';
    change(drop, 'change');
    await vi.waitFor(() => expect(world.plugin.settings.language).toBe('pt'));
    expect(world.plugin.data).toMatchObject({ language: 'pt' });
  });
});

describe('the translations folder', () => {
  it('opens on the folder in force', () => {
    expect(
      control<HTMLInputElement>(containerEl, 'Translations folder', 'input')
        .value,
    ).toBe('Bibles');
  });

  it('drops the trailing slashes off what is typed', async () => {
    const input = control<HTMLInputElement>(
      containerEl,
      'Translations folder',
      'input',
    );
    input.value = 'Textos/Bíblias//';
    change(input, 'input');
    await vi.waitFor(() =>
      expect(world.plugin.settings.translationsFolder).toBe('Textos/Bíblias'),
    );
  });
});

/** A setting a switch stands for, which is to say one of the boolean ones. */
type Switch = {
  [K in keyof KingdoneChapelSettings]: KingdoneChapelSettings[K] extends boolean
    ? K
    : never;
}[keyof KingdoneChapelSettings];

describe('the switches', () => {
  const switches: [string, Switch][] = [
    ['Open in new tab', 'openInNewTab'],
    ['Chapter breadcrumbs', 'showBreadcrumbs'],
    ['Group books by category', 'bookCategories'],
    ['Follow cursor', 'followCursor'],
    ['Show the version you are reading', 'showCurrentVersion'],
    ['Open sidebar on startup', 'openSidebarOnStart'],
  ];

  for (const [name, key] of switches) {
    it(`opens ${name} on the setting in force`, () => {
      // Drawn from a setting that is not the default, so a switch reading the
      // wrong one cannot pass by the two of them happening to agree.
      const wanted = !DEFAULT_SETTINGS[key];
      world.plugin.settings[key] = wanted;
      tab.display();
      expect(toggle(containerEl, name).checked).toBe(wanted);
    });

    it(`saves ${name} when it is flipped`, async () => {
      const was = world.plugin.settings[key];
      const el = toggle(containerEl, name);
      el.checked = !was;
      change(el, 'change');
      await vi.waitFor(() => expect(world.plugin.settings[key]).toBe(!was));
      expect(world.plugin.data).toMatchObject({ [key]: !was });
    });
  }
});

describe('the default version for @ references', () => {
  const name = 'Default version for @ references';

  it('offers every version under its label, after Automatic', () => {
    const drop = control<HTMLSelectElement>(containerEl, name, 'select');
    expect(
      Array.from(drop.options).map((o) => [o.value, o.textContent]),
    ).toEqual([
      ['', 'Automatic'],
      ['ARA', 'ARA'],
      ['NVI', 'Nova Versão Internacional'],
    ]);
  });

  it('leaves out a version no link may point at', () => {
    const partial = withKelvin();
    const drop = control<HTMLSelectElement>(
      partial.containerEl,
      name,
      'select',
    );

    expect(Array.from(drop.options).map((o) => o.value)).toEqual([
      '',
      'ARA',
      'NVI',
    ]);
  });

  it('saves the version it is set to', async () => {
    const drop = control<HTMLSelectElement>(containerEl, name, 'select');
    drop.value = 'NVI';
    change(drop, 'change');
    await vi.waitFor(() =>
      expect(world.plugin.settings.defaultVersion).toBe('NVI'),
    );
  });
});

describe('the headings', () => {
  it('breaks the references and the sidebar out of the rest', () => {
    expect(
      Array.from(containerEl.querySelectorAll('h3')).map((h) => h.textContent),
    ).toEqual(['References', 'Notes', 'Sidebar']);
  });
});

describe('the versions it found', () => {
  it('names them, in order', () => {
    expect(
      setting(containerEl, 'Detected versions').querySelector(
        '.setting-item-description',
      )?.textContent,
    ).toBe('ARA, NVI');
  });

  it('says which of them no link may point at', () => {
    expect(
      setting(withKelvin().containerEl, 'Detected versions').querySelector(
        '.setting-item-description',
      )?.textContent,
    ).toBe('Kelvin (partial), ARA, NVI');
  });

  it('says so when there are none', () => {
    const empty = harness();
    const bare = new KingdoneChapelSettingTab(empty.app, empty.plugin);
    bare.display();
    expect(
      setting(bare.containerEl, 'Detected versions').querySelector(
        '.setting-item-description',
      )?.textContent,
    ).toBe('none');
  });

  it('reads the vault again, and the chapters with it, on Reload', () => {
    world.plugin.index();
    world.plugin.chapterCache.set('stale', { mtime: 1, verses: [] });
    world.vault.write(...Object.entries(chapter('ACF', 1, 'GEN', 1, ['x']))[0]);

    control<HTMLButtonElement>(
      containerEl,
      'Detected versions',
      'button',
    ).click();

    expect(world.plugin.chapterCache.size).toBe(0);
    expect(
      setting(containerEl, 'Detected versions').querySelector(
        '.setting-item-description',
      )?.textContent,
    ).toBe('ACF, ARA, NVI');
  });

  it('gives every version its own command again', () => {
    const spy = vi.spyOn(world.plugin, 'registerVersionCommands');
    control<HTMLButtonElement>(
      containerEl,
      'Detected versions',
      'button',
    ).click();
    expect(spy).toHaveBeenCalled();
  });
});

describe('the duplicate files', () => {
  it('are left out when the vault has none', () => {
    expect(containerEl.querySelector('.kcp-conflicts')).toBeNull();
  });

  it('name the files fighting over each chapter', () => {
    const clashing = harness({
      ...vault,
      'Bibles/NVI/copy/NVI-01-GEN-001.md': 'duplicate',
    });
    const other = new KingdoneChapelSettingTab(clashing.app, clashing.plugin);
    other.display();

    const items = Array.from(
      other.containerEl.querySelectorAll('.kcp-conflicts li'),
    ).map((li) => li.textContent);
    expect(items).toEqual([
      'Bibles/NVI/NVI-01-GEN-001.md  |  Bibles/NVI/copy/NVI-01-GEN-001.md',
    ]);
  });
});

describe('the kinds of note', () => {
  /** The rows the tab draws, one per kind. */
  function rows(): HTMLElement[] {
    return Array.from(
      containerEl.querySelectorAll<HTMLElement>('.kcp-note-kind'),
    );
  }

  /** The fields of one row: callout, letter, and a title per language. */
  function fields(at: number): HTMLInputElement[] {
    return Array.from(rows()[at].querySelectorAll<HTMLInputElement>('input'));
  }

  /** A button of the tab, or of one row, found by what is written on it. */
  function button(text: string, within: HTMLElement = containerEl) {
    const found = Array.from(
      within.querySelectorAll<HTMLButtonElement>('button'),
    ).find((el) => el.textContent === text);
    if (!found) throw new Error(`no button reading ${text}`);
    return found;
  }

  it('draws the three it ships with, as they are written', () => {
    expect(rows()).toHaveLength(3);
    expect(fields(0).map((f) => f.value)).toEqual(['note', 'n', 'Nota']);
    expect(fields(1).map((f) => f.value)).toEqual([
      'homiletic',
      'h',
      'Nótula Homilética',
    ]);
  });

  it('saves a callout, a letter and a name as they are typed', async () => {
    const [callout, letter, name] = fields(0);
    callout.value = 'comentario';
    change(callout, 'input');
    letter.value = 'c';
    change(letter, 'input');
    name.value = 'Comentário';
    change(name, 'input');

    await vi.waitFor(() =>
      expect(world.plugin.settings.noteKinds[0]).toEqual({
        callout: 'comentario',
        letter: 'c',
        title: 'Comentário',
      }),
    );
    expect(world.plugin.settings.noteKinds).toHaveLength(3);
  });

  it('adds a kind with nothing written in it yet', async () => {
    button('Add').dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(rows()).toHaveLength(4));
    expect(world.plugin.settings.noteKinds[3]).toEqual({
      callout: 'note',
      letter: 'n',
      title: '',
    });
  });

  it('drops the kind whose row is removed', async () => {
    button('Remove', rows()[1]).dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    expect(world.plugin.settings.noteKinds.map((kind) => kind.callout)).toEqual(
      ['note', 'reviewers'],
    );
  });

  it('puts the three back where a vault has written over them', async () => {
    world.plugin.settings.noteKinds = [];
    tab.display();
    expect(rows()).toHaveLength(3); // the ones it falls back on, undrawn

    button('Reset').dispatchEvent(new Event('click'));
    await vi.waitFor(() =>
      expect(world.plugin.settings.noteKinds).toHaveLength(3),
    );
    expect(world.plugin.data).toMatchObject({
      noteKinds: DEFAULT_NOTE_KINDS,
    });
  });
});

describe('the last kind of note', () => {
  function rows(): HTMLElement[] {
    return Array.from(
      containerEl.querySelectorAll<HTMLElement>('.kcp-note-kind'),
    );
  }

  function remove(at: number) {
    const found = Array.from(
      rows()[at].querySelectorAll<HTMLButtonElement>('button'),
    ).find((el) => el.textContent === 'Remove');
    found?.dispatchEvent(new Event('click'));
  }

  it('stays, since an empty list is read as no answer at all', async () => {
    remove(2);
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    remove(1);
    await vi.waitFor(() => expect(rows()).toHaveLength(1));

    remove(0);
    expect(rows()).toHaveLength(1);
    expect(world.plugin.settings.noteKinds).toHaveLength(1);
  });
});

describe('the kinds table', () => {
  function rows(): HTMLElement[] {
    return Array.from(
      containerEl.querySelectorAll<HTMLElement>('.kcp-note-kind'),
    );
  }

  it('is drawn as a table, so its columns are the one width down it', () => {
    const table = containerEl.querySelector<HTMLElement>('.kcp-note-kinds');
    expect(table?.tagName).toBe('TABLE');
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(rows()[0].tagName).toBe('TR');
  });

  it('names its columns once, in a head of its own', () => {
    expect(
      Array.from(containerEl.querySelectorAll('.kcp-note-kinds thead th')).map(
        (column) => column.textContent,
      ),
      // The last of them stands over the buttons, and names nothing.
    ).toEqual(['Callout', 'Anchor letter', 'Name', '']);
  });

  it('gives every field a cell of its own, named for what it holds', () => {
    const row = rows()[0];
    expect(row.querySelectorAll('td')).toHaveLength(4);
    expect(
      Array.from(row.querySelectorAll<HTMLInputElement>('input')).map(
        (field) => field.title,
      ),
    ).toEqual(['Callout', 'Anchor letter', 'Name']);
  });
});
