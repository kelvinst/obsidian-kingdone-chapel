// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notice as ObsidianNotice, TFile } from 'obsidian';

import { Notice, clearNotices, notices } from '../test/obsidian';
import { chapter, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { CreateVersionModal } from './create-modal';
import type { Source } from './sources';

const vault = {
  ...chapter('ARA', 1, 'GEN', 1, ['No princípio, criou Deus.']),
  ...chapter('ARA', 1, 'GEN', 2, ['Assim foram acabados os céus.']),
  ...chapter('ARA', 41, 'MRK', 14, ['Dali a dois dias.', 'Pois diziam.']),
  'Bibles/ARA/Leituras.md': 'Um plano de leitura.',
  ...chapter('NVI', 1, 'GEN', 1, ['No princípio Deus criou.']),
};

let world: Harness;

/** The versions the command would have handed the modal. */
function sources(): Source[] {
  return world.plugin.listSources();
}

function modalOn(over: Partial<CreateVersionModal> = {}): CreateVersionModal {
  const modal = new CreateVersionModal(world.app, world.plugin, sources());
  modal.open();
  Object.assign(modal, over);
  return modal;
}

/** The text of the file at `path`, or null where nothing was written there. */
function wrote(path: string): string | null {
  const file = world.vault.getAbstractFileByPath(path);
  return file ? (world.vault.contents.get(path) ?? null) : null;
}

/** Every block id of a chapter, so the translation has anchors to be quoted. */
function anchorsForVault() {
  for (const file of world.vault.getMarkdownFiles()) {
    const text = world.vault.contents.get(file.path) || '';
    const ids = Array.from(text.matchAll(/\^(\S+)$/gm), (m) => m[1]);
    if (ids.length) world.metadataCache.blocks.set(file.path, ids);
  }
}

beforeEach(() => {
  clearNotices();
  world = harness(vault, { language: 'pt' });
  anchorsForVault();
});

/**
 * Read the vault again with a version filed away from the translations, which
 * is the only way the folder a version is offered ever moves: two translations
 * sitting side by side answer with the folder holding both of them.
 *
 * Headed after the translations so the list still opens on ARA, and the folder
 * the modal shows is the one the reader has yet to move off.
 */
function elsewhere() {
  world = harness(
    {
      ...vault,
      ...chapter('Shedd', 1, 'GEN', 1, ['No princípio.'], 'Estudos'),
      'Estudos/Shedd/Shedd.md': '',
    },
    { language: 'pt' },
  );
  world.metadataCache.frontmatter.set('Estudos/Shedd/Shedd.md', {
    bible: true,
    group: 'Versões',
    code: 'Shedd',
  });
  anchorsForVault();
}

describe('the fields it opens with', () => {
  it('starts on the first version, in the folder that version sits in', () => {
    const modal = modalOn();

    expect(modal.from).toBe('ARA');
    expect(modal.folder).toBe('Bibles');
  });

  it('asks for the five things a version cannot be worked out without', () => {
    const modal = modalOn();
    const named = Array.from(
      modal.contentEl.querySelectorAll('.setting-item-name'),
      (el) => el.textContent,
    );

    expect(named).toEqual([
      'Based on',
      'Folder',
      'Code',
      'Name',
      'Heading',
      '',
    ]);
  });

  it('follows the version picked to the folder that one sits in', () => {
    const modal = modalOn();
    const drop = modal.contentEl.querySelector('select') as HTMLSelectElement;

    drop.value = 'NVI';
    drop.dispatchEvent(new Event('change'));

    expect(modal.from).toBe('NVI');
    expect(modal.folder).toBe('Bibles');
  });

  it('leaves the folder alone for a version it was never given', () => {
    const modal = modalOn();
    const drop = modal.contentEl.querySelector('select') as HTMLSelectElement;

    drop.add(new Option('Outra', 'Outra'));
    drop.value = 'Outra';
    drop.dispatchEvent(new Event('change'));

    expect(modal.from).toBe('Outra');
    expect(modal.folder).toBe('Bibles');
  });

  it('shows the folder it followed the version to', () => {
    elsewhere();
    const modal = modalOn();
    const drop = modal.contentEl.querySelector('select') as HTMLSelectElement;
    const folder = modal.contentEl.querySelector('input') as HTMLInputElement;

    drop.value = 'Shedd';
    drop.dispatchEvent(new Event('change'));

    expect(modal.folder).toBe('Estudos');
    expect(folder.value).toBe('Estudos');
  });

  it('leaves a folder that was written by hand where the version moves', () => {
    elsewhere();
    const modal = modalOn();
    const drop = modal.contentEl.querySelector('select') as HTMLSelectElement;
    const folder = modal.contentEl.querySelector('input') as HTMLInputElement;

    folder.value = 'Comentarios';
    folder.dispatchEvent(new Event('input'));
    drop.value = 'Shedd';
    drop.dispatchEvent(new Event('change'));

    expect(modal.folder).toBe('Comentarios');
    expect(folder.value).toBe('Comentarios');
  });

  it('follows the version again once the folder is emptied', () => {
    elsewhere();
    const modal = modalOn();
    const drop = modal.contentEl.querySelector('select') as HTMLSelectElement;
    const folder = modal.contentEl.querySelector('input') as HTMLInputElement;

    folder.value = 'Comentarios';
    folder.dispatchEvent(new Event('input'));
    folder.value = '';
    folder.dispatchEvent(new Event('input'));
    drop.value = 'Shedd';
    drop.dispatchEvent(new Event('change'));

    expect(modal.folder).toBe('Estudos');
  });
});

describe('the name following the code', () => {
  /** The inputs of the modal, in the order the fields were added. */
  function inputs(modal: CreateVersionModal): HTMLInputElement[] {
    return Array.from(modal.contentEl.querySelectorAll('input'));
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('writes the code into the name while the name is untouched', () => {
    const modal = modalOn();
    const [folder, code, name] = inputs(modal);
    expect(folder).toBeTruthy();

    type(code, 'Shedd');

    expect(modal.code).toBe('Shedd');
    expect(modal.name).toBe('Shedd');
    expect(name.value).toBe('Shedd');
  });

  it('leaves a name that was written by hand', () => {
    const modal = modalOn();
    const [, code, name] = inputs(modal);

    type(name, 'Bíblia Shedd');
    type(code, 'Shedd');

    expect(modal.name).toBe('Bíblia Shedd');
    expect(name.value).toBe('Bíblia Shedd');
  });

  it('follows the code again once the name is emptied', () => {
    const modal = modalOn();
    const [, code, name] = inputs(modal);

    type(name, 'Bíblia Shedd');
    type(name, '');
    type(code, 'Shedd');

    expect(modal.name).toBe('Shedd');
  });

  it('takes the folder and the heading as they are typed', () => {
    const modal = modalOn();
    const [folder, , , group] = inputs(modal);

    type(folder, 'Comentarios');
    type(group, ' Versões ');

    expect(modal.folder).toBe('Comentarios');
    expect(modal.group).toBe('Versões');
  });
});

describe('what it refuses', () => {
  it('refuses a version with no code', () => {
    expect(modalOn().refuse()).toBe('Give the version a code.');
  });

  it('refuses a code that would not make a folder name', () => {
    expect(modalOn({ code: 'a/b' }).refuse()).toBe(
      'A code cannot carry / \\ or :.',
    );
  });

  it('refuses a code the vault already knows', () => {
    expect(modalOn({ code: 'ARA' }).refuse()).toBe(
      'ARA is already a version in this vault.',
    );
  });

  it('refuses one that differs from a known code only in case', () => {
    expect(modalOn({ code: 'ara' }).refuse()).toBe(
      'ara is already a version in this vault.',
    );
  });

  it('refuses a folder that is already there', () => {
    const modal = modalOn({ code: 'Shedd', folder: 'Estudos' });
    world.vault.folder('Estudos/Shedd');

    expect(modal.refuse()).toBe(
      'Estudos/Shedd is already there. Move it or pick another folder.',
    );
  });

  it('says nothing where the fields are enough', () => {
    expect(modalOn({ code: 'Shedd' }).refuse()).toBeNull();
  });

  it('says the refusal rather than writing anything', async () => {
    const modal = modalOn();

    await modal.create();

    expect(notices.map((n) => n.message)).toEqual(['Give the version a code.']);
    expect(world.vault.getMarkdownFiles().map((f) => f.path)).toHaveLength(5);
  });
});

describe('where the folder goes', () => {
  it('puts the version under the folder it was given', () => {
    expect(modalOn({ code: 'Shedd', folder: 'Comentarios' }).target()).toBe(
      'Comentarios/Shedd',
    );
  });

  it('drops the trailing slashes off the folder', () => {
    expect(modalOn({ code: 'Shedd', folder: 'Comentarios//' }).target()).toBe(
      'Comentarios/Shedd',
    );
  });

  it('puts it at the top of the vault where no folder was given', () => {
    expect(modalOn({ code: 'Shedd', folder: '' }).target()).toBe('Shedd');
  });

  it('puts it at the top for a folder that is only a slash', () => {
    expect(modalOn({ code: 'Shedd', folder: '/' }).target()).toBe('Shedd');
  });
});

describe('writing the version', () => {
  async function write(over: Partial<CreateVersionModal> = {}) {
    const modal = modalOn({ code: 'Shedd', folder: 'Comentarios', ...over });
    await modal.create();
    return modal;
  }

  it('says the version it declared, and what it is called', async () => {
    await write({ name: 'Bíblia Shedd', group: 'Versões' });

    expect(wrote('Comentarios/Shedd/Shedd.md')).toBe(
      '---\n' +
        'bible: true\n' +
        'complete: true\n' +
        'translation: "ARA"\n' +
        'group: "Versões"\n' +
        'code: "Shedd"\n' +
        'name: "Bíblia Shedd"\n' +
        '---\n',
    );
  });

  it('falls back to the code where no name was written', async () => {
    await write();

    expect(wrote('Comentarios/Shedd/Shedd.md')).toContain('name: "Shedd"\n');
  });

  it('writes a chapter for every chapter the translation holds', async () => {
    await write();

    expect(wrote('Comentarios/Shedd/Shedd-01-GEN-001.md')).toBeTruthy();
    expect(wrote('Comentarios/Shedd/Shedd-01-GEN-002.md')).toBeTruthy();
    expect(wrote('Comentarios/Shedd/Shedd-41-MRK-014.md')).toBeTruthy();
  });

  it('embeds each verse of the translation over an id of its own', async () => {
    await write();

    expect(wrote('Comentarios/Shedd/Shedd-41-MRK-014.md')).toBe(
      '# Marcos 14\n' +
        '\n' +
        '## [[ARA-41-MRK-014|ARA]]\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-1]]\n' +
        '^shedd-mrk-14-1\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-2]]\n' +
        '^shedd-mrk-14-2\n',
    );
  });

  it('quotes a verse the translation never anchored under the id it would carry', async () => {
    world.vault.write(
      'Bibles/ARA/ARA-41-MRK-014.md',
      '1. Dali a dois dias. ^ara-mrk-14-1\n\n2. Pois diziam.\n',
    );
    world.metadataCache.blocks.set('Bibles/ARA/ARA-41-MRK-014.md', [
      'ara-mrk-14-1',
    ]);
    world.plugin.invalidateIndex();

    await write();

    // Verse 2 names `ara-mrk-14-2`, which is not there: the embed does not
    // resolve, rather than quietly quoting verse 1 a second time.
    expect(wrote('Comentarios/Shedd/Shedd-41-MRK-014.md')).toBe(
      '# Marcos 14\n' +
        '\n' +
        '## [[ARA-41-MRK-014|ARA]]\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-1]]\n' +
        '^shedd-mrk-14-1\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-2]]\n' +
        '^shedd-mrk-14-2\n',
    );
  });

  it('quotes every verse of a chapter the translation never anchored at all', async () => {
    world.vault.write(
      'Bibles/ARA/ARA-41-MRK-014.md',
      '1. Dali a dois dias.\n\n2. Pois diziam.\n',
    );
    world.metadataCache.blocks.delete('Bibles/ARA/ARA-41-MRK-014.md');
    world.plugin.invalidateIndex();

    await write();

    const note = wrote('Comentarios/Shedd/Shedd-41-MRK-014.md') as string;
    expect(note).toContain('![[ARA-41-MRK-014#^ara-mrk-14-1]]');
    expect(note).toContain('![[ARA-41-MRK-014#^ara-mrk-14-2]]');
  });

  it('says how many it wrote, and reads the vault again', async () => {
    const refresh = vi.spyOn(world.plugin, 'refreshViews');

    await write();

    expect(notices.at(-1)?.message).toBe('Shedd: 3 chapters written.');
    expect(refresh).toHaveBeenCalled();
  });

  it('counts the chapters off as they go by', async () => {
    const many: Record<string, string> = {};
    for (let n = 1; n <= 26; n++) {
      Object.assign(many, chapter('ARA', 19, 'PSA', n, ['Um salmo.']));
    }
    world = harness(many, { language: 'pt' });
    anchorsForVault();
    clearNotices();
    const rewritten = vi.spyOn(Notice.prototype, 'setMessage');

    await write();

    expect(rewritten).toHaveBeenCalledWith('Writing Shedd... 25/26');
    rewritten.mockRestore();
  });

  it('skips a note in the version folder that is not a chapter', async () => {
    await write();

    expect(wrote('Comentarios/Shedd/Leituras.md')).toBeNull();
  });

  it('says so where the translation it was given holds nothing', async () => {
    await write({ from: 'Vulgata' });

    expect(notices.at(-1)?.message).toBe('Vulgata has no chapters to answer.');
  });

  it('refuses to write under a note standing where a folder must go', async () => {
    world.vault.write('Comentarios.md', 'uma nota');

    await write({ folder: 'Comentarios.md' });

    expect(notices.at(-1)?.message).toBe(
      'Shedd was not written: Comentarios.md is a note, not a folder.',
    );
  });

  it('writes into a folder that is already there', async () => {
    world.vault.folder('Comentarios');

    await write();

    expect(wrote('Comentarios/Shedd/Shedd.md')).toBeTruthy();
  });
});

describe('a file the index named that is no chapter', () => {
  it('is passed over rather than written', async () => {
    const modal = modalOn({ code: 'Shedd', folder: 'Comentarios' });
    const source = world.plugin.source('ARA') as Source;
    const loose = world.vault.getAbstractFileByPath(
      'Bibles/ARA/Leituras.md',
    ) as TFile;

    // The stand-in carries only what the plugin's own code touches, which is
    // less than the whole of the app's `Notice`.
    const counting = new Notice('', 0) as unknown as ObsidianNotice;
    const written = await modal.write(source, [loose], counting);

    expect(written).toBe(0);
  });
});

describe('the button that writes it', () => {
  it('writes the version the fields describe', async () => {
    const modal = modalOn({ code: 'Shedd', folder: 'Comentarios' });
    const button = modal.contentEl.querySelector('button') as HTMLButtonElement;

    button.click();
    await vi.waitFor(() =>
      expect(wrote('Comentarios/Shedd/Shedd.md')).toBeTruthy(),
    );
  });
});

describe('closing', () => {
  it('empties what it drew', () => {
    const modal = modalOn();
    expect(modal.contentEl.children.length).toBeGreaterThan(0);

    modal.close();

    expect(modal.contentEl.children.length).toBe(0);
  });
});

describe('a version at the top of the vault', () => {
  it('reads its folder as the vault itself', () => {
    const loose = harness({
      ...chapter('ARA', 1, 'GEN', 1, ['No princípio.'], ''),
    });
    loose.plugin.settings.translationsFolder = '';
    const modal = new CreateVersionModal(loose.app, loose.plugin, [
      {
        path: 'ARA',
        code: 'ARA',
        label: 'ARA',
        group: '',
        complete: true,
        declaredBy: '',
      },
    ]);

    expect(modal.folder).toBe('');
  });
});

/** The plugin's own file type, for a test that hands one over directly. */
export type { TFile };
