// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

import { SuggestModal, clearNotices, notices } from '../test/obsidian';
import {
  FakeEditor,
  chapter,
  chapterPath,
  editorOf,
  harness,
  pane,
} from '../test/harness';
import type { Harness } from '../test/harness';
import { VIEW_TYPE } from './types';
import type { Location } from './types';
import { VersionSuggestModal } from './modal';
import { KingdoneChapelView } from './view';

const GEN_1 = [
  'No princípio, Deus criou os céus e a terra.',
  'Era a terra sem forma e vazia.',
  'Disse Deus: "Haja luz".',
];

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, GEN_1),
  ...chapter('NVI', 1, 'GEN', 2, ['Assim foram concluídos os céus.']),
  ...chapter('NVI', 43, 'JHN', 1, ['No princípio era o Verbo.']),
  'Bibles/NVI/NVI-01-Gênesis.md': 'Os capítulos de Gênesis.',
  'Bibles/NVI/Leituras.md': 'Um plano de leitura.',
  ...chapter('ARA', 1, 'GEN', 1, ['No princípio, criou Deus.']),
  ...chapter('ARA', 43, 'JHN', 1, ['No princípio era o Verbo.']),
  'Bibles/Notas.md': 'Solta na pasta das versões.',
  'Estudos/Romanos.md': 'Fora da pasta das versões.',
};

let world: Harness;

/** Everything a location is, for the file it names. */
function locationFor(
  world: Harness,
  path: string,
  extra: Partial<Location> = {},
): Location {
  const loc = world.plugin.locationOf(
    world.vault.getAbstractFileByPath(path) as TFile,
    null,
  );
  if (!loc) throw new Error(`${path} is no chapter`);
  return { ...loc, ...extra };
}

beforeEach(() => {
  clearNotices();
  world = harness(vault, { language: 'pt' });
});

afterEach(() => {
  vi.useRealTimers();
  // Every spy here is made inside the test that wants it, so none should
  // outlive it — and one on a prototype would, taking its call history into
  // the next test to reach for it. Unwound here rather than at the end of a
  // body, which a failing assertion never reaches.
  vi.restoreAllMocks();
});

describe('index', () => {
  it('groups every chapter under the version folder holding it', () => {
    const index = world.plugin.index();
    expect(Array.from(index.keys()).sort()).toEqual(['ARA', 'NVI']);
    expect(Array.from(index.get('NVI')!.keys())).toEqual([
      '1:1',
      '1:2',
      '43:1',
    ]);
  });

  it('reads a version laid out in whatever folders it likes', () => {
    const nested = harness({
      'Bibles/NVI/Antigo/Lei/NVI-01-GEN-001.md': '1. No princípio ^a',
    });
    expect(nested.plugin.index().get('NVI')?.has('1:1')).toBe(true);
  });

  it('leaves out a file that is not under the Bible folder', () => {
    const index = world.plugin.index();
    for (const chapters of index.values()) {
      for (const file of chapters.values()) {
        expect(file.path.startsWith('Bibles/')).toBe(true);
      }
    }
  });

  it('leaves out a loose file straight in the Bible folder', () => {
    expect(world.plugin.index().has('Notas')).toBe(false);
  });

  it('keeps the note listing a book apart from the chapters', () => {
    world.plugin.index();
    expect(world.plugin.bookNotes.get('NVI')?.get(1)?.basename).toBe(
      'NVI-01-Gênesis',
    );
  });

  it('leaves an ordinary note under a version alone', () => {
    world.plugin.index();
    expect(world.plugin.bookNotes.get('NVI')?.size).toBe(1);
  });

  it('is built once, and again once the vault has moved', () => {
    const read = vi.spyOn(world.vault, 'getMarkdownFiles');
    world.plugin.index();
    world.plugin.index();
    expect(read).toHaveBeenCalledTimes(1);
    world.plugin.invalidateIndex();
    world.plugin.index();
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe('two files for one chapter', () => {
  const clashing = {
    ...vault,
    'Bibles/NVI/cópia/NVI-01-GEN-001.md': '1. Uma cópia ^x',
  };

  it('leaves the chapter out rather than picking one of them', () => {
    const world = harness(clashing);
    expect(world.plugin.index().get('NVI')?.has('1:1')).toBe(false);
  });

  it('records both of them under the chapter they claim', () => {
    const world = harness(clashing);
    world.plugin.index();
    expect(
      world.plugin.chapterConflicts.get('NVI/1:1')?.map((f) => f.path),
    ).toEqual([
      'Bibles/NVI/NVI-01-GEN-001.md',
      'Bibles/NVI/cópia/NVI-01-GEN-001.md',
    ]);
  });

  it('takes in a third file claiming the same chapter', () => {
    const world = harness({
      ...clashing,
      'Bibles/NVI/outra/NVI-01-GEN-001.md': '1. Outra cópia ^y',
    });
    world.plugin.index();
    expect(world.plugin.chapterConflicts.get('NVI/1:1')).toHaveLength(3);
  });

  it('treats two notes for one book the same way', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/outra/NVI-01-Genesis.md': 'Outra lista.',
    });
    world.plugin.index();
    expect(world.plugin.chapterConflicts.get('NVI/book:1')).toHaveLength(2);
    expect(world.plugin.bookNotes.get('NVI')?.has(1)).toBe(false);
  });
});

describe('warnAboutConflicts', () => {
  it('says nothing about a vault with no duplicates', () => {
    world.plugin.index();
    expect(notices).toHaveLength(0);
  });

  it('names the files, once, however often the index is rebuilt', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/cópia/NVI-01-GEN-001.md': '1. Uma cópia ^x',
    });
    world.plugin.index();
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toContain('NVI-01-GEN-001 / NVI-01-GEN-001');
    world.plugin.invalidateIndex();
    world.plugin.index();
    expect(notices).toHaveLength(1);
  });

  it('shows three of them and counts the rest', () => {
    const many: Record<string, string> = { ...vault };
    for (const number of [1, 2, 3, 4, 5]) {
      const path = chapterPath('NVI', 1, 'GEN', number);
      many[path] = '1. Original ^a';
      many[path.replace('/NVI-', '/cópia/NVI-')] = '1. Cópia ^b';
    }
    const world = harness(many);
    world.plugin.index();
    expect(notices[0].message).toContain('...and 2 more');
    expect(notices[0].timeout).toBe(10000);
  });

  it('says nothing more once the duplicates are gone', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/cópia/NVI-01-GEN-001.md': '1. Uma cópia ^x',
    });
    world.plugin.index();
    expect(notices).toHaveLength(1);

    world.vault.remove('Bibles/NVI/cópia/NVI-01-GEN-001.md');
    world.plugin.invalidateIndex();
    world.plugin.index();
    expect(notices).toHaveLength(1);
  });

  it('says it again once the duplicates are not the same ones', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/cópia/NVI-01-GEN-001.md': '1. Uma cópia ^x',
    });
    world.plugin.index();
    world.vault.write('Bibles/NVI/cópia/NVI-01-GEN-002.md', '1. Outra ^y');
    world.plugin.invalidateIndex();
    world.plugin.index();
    expect(notices).toHaveLength(2);
  });
});

describe('listVersions', () => {
  it('names the folders holding chapters, in order', () => {
    expect(world.plugin.listVersions()).toEqual(['ARA', 'NVI']);
  });

  it('leaves out a folder with no chapters in it', () => {
    world.vault.write('Bibles/Rascunhos/Uma nota.md', 'Sem capítulos.');
    world.plugin.invalidateIndex();
    expect(world.plugin.listVersions()).toEqual(['ARA', 'NVI']);
  });

  it('names none at all where the translations folder is not a folder', () => {
    world.plugin.settings.translationsFolder = 'Estudos/Romanos.md';
    world.plugin.invalidateIndex();
    expect(world.plugin.listVersions()).toEqual([]);
  });
});

describe('label', () => {
  it('is the name given to a version, or the version itself', () => {
    world.plugin.settings.labels = { NVI: 'Nova Versão Internacional' };
    expect(world.plugin.label('NVI')).toBe('Nova Versão Internacional');
    expect(world.plugin.label('ARA')).toBe('ARA');
  });
});

describe('findVersion', () => {
  it('finds a version however it was typed', () => {
    expect(world.plugin.findVersion('nvi')).toBe('NVI');
    expect(world.plugin.findVersion('NVI')).toBe('NVI');
  });

  it('finds nothing for a word that is not a version', () => {
    expect(world.plugin.findVersion('Joao')).toBeNull();
  });
});

describe('defaultVersion', () => {
  it('is the one set, when the vault still has it', () => {
    world.plugin.settings.defaultVersion = 'NVI';
    expect(world.plugin.defaultVersion(null)).toBe('NVI');
  });

  it('falls through a version the vault no longer holds', () => {
    world.plugin.settings.defaultVersion = 'MENS';
    expect(world.plugin.defaultVersion(null)).toBe('ARA');
  });

  it('is the version of the note being written in', () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    expect(world.plugin.defaultVersion(from)).toBe('NVI');
  });

  it('is the first version in the vault for a note outside one', () => {
    const from = world.vault.getAbstractFileByPath(
      'Estudos/Romanos.md',
    ) as TFile;
    expect(world.plugin.defaultVersion(from)).toBe('ARA');
  });

  it('is nothing at all in a vault with no versions', () => {
    expect(harness().plugin.defaultVersion(null)).toBeNull();
  });
});

describe('chapterTargets', () => {
  it('is the file of every chapter the version has', () => {
    expect(world.plugin.chapterTargets('NVI', 1, [1, 2])).toMatchObject([
      { chapter: 1, path: 'Bibles/NVI/NVI-01-GEN-001.md' },
      { chapter: 2, path: 'Bibles/NVI/NVI-01-GEN-002.md' },
    ]);
  });

  it('names a chapter the version has yet to write, after one it has', () => {
    const targets = world.plugin.chapterTargets('NVI', 1, [1, 40]);
    expect(targets[1]).toEqual({
      chapter: 40,
      file: null,
      path: 'NVI-01-GEN-040',
    });
  });

  it('has no example to copy, and so no answer, for a book it lacks', () => {
    expect(world.plugin.chapterTargets('NVI', 20, [1])).toEqual([]);
  });

  it('has nothing to say about a version that is not there', () => {
    expect(world.plugin.chapterTargets('VULG', 1, [1])).toEqual([]);
  });
});

describe('referenceFile', () => {
  it('is the chapter that was asked for', () => {
    expect(world.plugin.referenceFile('NVI', 1, 2)?.basename).toBe(
      'NVI-01-GEN-002',
    );
  });

  it('falls back to the single file a commentary keeps per book', () => {
    const world = harness({
      'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^a',
    });
    expect(world.plugin.referenceFile('MENS', 1, 7)?.basename).toBe(
      'MENS-01-GEN-000',
    );
  });

  it('is the note listing the chapters when none was named', () => {
    expect(world.plugin.referenceFile('NVI', 1, null)?.basename).toBe(
      'NVI-01-Gênesis',
    );
  });

  it('falls back to the first chapter where there is no such note', () => {
    expect(world.plugin.referenceFile('ARA', 1, null)?.basename).toBe(
      'ARA-01-GEN-001',
    );
  });

  it('falls back to the whole-book file where there is neither', () => {
    const world = harness({
      'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^a',
    });
    expect(world.plugin.referenceFile('MENS', 1, null)?.basename).toBe(
      'MENS-01-GEN-000',
    );
  });

  it('is nothing for a book the version does not carry', () => {
    expect(world.plugin.referenceFile('ARA', 66, 1)).toBeNull();
    expect(world.plugin.referenceFile('ARA', 66, null)).toBeNull();
  });

  it('is nothing for a version the vault does not hold', () => {
    expect(world.plugin.referenceFile('MENS', 1, 1)).toBeNull();
  });
});

describe('chapterOrder', () => {
  it('walks the version by book and then by chapter', () => {
    expect(world.plugin.chapterOrder('NVI')).toEqual([
      { bookIndex: 1, chapter: 1, code: 'GEN' },
      { bookIndex: 1, chapter: 2, code: 'GEN' },
      { bookIndex: 43, chapter: 1, code: 'JHN' },
    ]);
  });

  it('is held until the vault moves under it', () => {
    const first = world.plugin.chapterOrder('NVI');
    expect(world.plugin.chapterOrder('NVI')).toBe(first);
    world.plugin.invalidateIndex();
    expect(world.plugin.chapterOrder('NVI')).not.toBe(first);
  });

  it('is empty for a version the vault does not hold', () => {
    expect(world.plugin.chapterOrder('MENS')).toEqual([]);
  });
});

describe('booksIn', () => {
  it('names every book once, on the first chapter it holds', () => {
    expect(world.plugin.booksIn('NVI')).toEqual([
      { index: 1, name: 'Gênesis', chapter: 1 },
      { index: 43, name: 'João', chapter: 1 },
    ]);
  });

  it('opens a book on the first chapter there, not on chapter one', () => {
    const world = harness({
      ...chapter('NVI', 1, 'GEN', 4, ['Adão teve relações.']),
      ...chapter('NVI', 1, 'GEN', 5, ['Esta é a lista.']),
    });
    expect(world.plugin.booksIn('NVI')).toEqual([
      { index: 1, name: 'Gênesis', chapter: 4 },
    ]);
  });

  it('falls back to the code for a book this plugin never heard of', () => {
    const world = harness({ 'Bibles/NVI/NVI-90-ENO-001.md': '1. Enoque ^a' });
    expect(world.plugin.booksIn('NVI')).toEqual([
      { index: 90, name: 'ENO', chapter: 1 },
    ]);
  });
});

describe('chaptersIn', () => {
  it('numbers the chapters a version has for one book', () => {
    expect(world.plugin.chaptersIn('NVI', 1)).toEqual([1, 2]);
  });

  it('numbers none for a book the version does not carry', () => {
    expect(world.plugin.chaptersIn('NVI', 66)).toEqual([]);
  });
});

describe('stepChapter', () => {
  it('walks on to the next chapter of the book', () => {
    expect(world.plugin.stepChapter('NVI', 1, 1, 1)).toEqual({
      bookIndex: 1,
      chapter: 2,
      code: 'GEN',
    });
  });

  it('walks straight out of a book into the next one', () => {
    expect(world.plugin.stepChapter('NVI', 1, 2, 1)).toMatchObject({
      bookIndex: 43,
      chapter: 1,
    });
    expect(world.plugin.stepChapter('NVI', 43, 1, -1)).toMatchObject({
      bookIndex: 1,
      chapter: 2,
    });
  });

  it('stops at either end of the version', () => {
    expect(world.plugin.stepChapter('NVI', 1, 1, -1)).toBeNull();
    expect(world.plugin.stepChapter('NVI', 43, 1, 1)).toBeNull();
  });

  it('stops at a chapter the index never took', () => {
    expect(world.plugin.stepChapter('NVI', 19, 119, 1)).toBeNull();
  });
});

describe('chapterVerses', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('reads the verses out of the file', async () => {
    expect(await world.plugin.chapterVerses(file)).toEqual([
      { verse: 1, text: GEN_1[0] },
      { verse: 2, text: GEN_1[1] },
      { verse: 3, text: GEN_1[2] },
    ]);
  });

  it('reads the file once, until it changes', async () => {
    const read = vi.spyOn(world.vault, 'cachedRead');
    await world.plugin.chapterVerses(file);
    await world.plugin.chapterVerses(file);
    expect(read).toHaveBeenCalledTimes(1);

    world.vault.write(file.path, '1. Reescrito ^nvi-gen-1-1');
    expect(await world.plugin.chapterVerses(file)).toEqual([
      { verse: 1, text: 'Reescrito' },
    ]);
  });

  it('reads no verses out of a file that carries none', async () => {
    world.vault.write(file.path, 'Só um parágrafo.');
    expect(await world.plugin.chapterVerses(file)).toEqual([]);
  });
});

describe('cachedVerses', () => {
  it('has nothing for no file at all', () => {
    expect(world.plugin.cachedVerses(null)).toBeNull();
  });

  it('has nothing on the first ask, and the verses on the next', async () => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    expect(world.plugin.cachedVerses(file)).toBeNull();
    await vi.waitFor(() =>
      expect(world.plugin.cachedVerses(file)).toHaveLength(3),
    );
  });

  it('swallows a read that fails on a file already gone', async () => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    world.vault.contents.delete(file.path);
    expect(world.plugin.cachedVerses(file)).toBeNull();
    await Promise.resolve();
  });
});

describe('blockIds', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('takes them from the metadata cache where it has them', async () => {
    world.metadataCache.blocks.set(file.path, ['from-the-cache']);
    expect(await world.plugin.blockIds(file)).toEqual(['from-the-cache']);
  });

  it('reads the file where the cache knows none', async () => {
    expect(await world.plugin.blockIds(file)).toEqual([
      'nvi-gen-1-1',
      'nvi-gen-1-2',
      'nvi-gen-1-3',
    ]);
  });

  it('reads the file where the cache holds an empty set', async () => {
    world.metadataCache.blocks.set(file.path, []);
    expect(await world.plugin.blockIds(file)).toHaveLength(3);
  });

  it('finds none in a file that carries none', async () => {
    world.vault.write(file.path, 'Sem âncoras.');
    expect(await world.plugin.blockIds(file)).toEqual([]);
  });
});

describe('findAnchors', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('names the anchor of each verse asked for', async () => {
    expect(await world.plugin.findAnchors(file, 1, [1, 3])).toEqual([
      'nvi-gen-1-1',
      'nvi-gen-1-3',
    ]);
  });

  it('falls back to the closest anchor before a merged verse', async () => {
    world.vault.write(
      file.path,
      '1. Um e dois ^nvi-gen-1-1\n3. Três ^nvi-gen-1-3',
    );
    expect(await world.plugin.findAnchors(file, 1, [2])).toEqual([
      'nvi-gen-1-1',
    ]);
  });

  it('names none where there is nothing before the verse', async () => {
    world.vault.write(file.path, '5. Cinco ^nvi-gen-1-5');
    expect(await world.plugin.findAnchors(file, 1, [1])).toEqual([null]);
  });

  it('names none for a chapter the anchors do not belong to', async () => {
    expect(await world.plugin.findAnchors(file, 2, [1])).toEqual([null]);
  });

  it('names none for no verses, and none for no chapter', async () => {
    expect(await world.plugin.findAnchors(file, 1, [])).toEqual([]);
    expect(await world.plugin.findAnchors(file, null, [1])).toEqual([null]);
  });

  it('reads the file once for a whole run of verses', async () => {
    const read = vi.spyOn(world.vault, 'cachedRead');
    await world.plugin.findAnchors(file, 1, [1, 2, 3]);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('findAnchor', () => {
  it('is the anchor of the one verse, or none', async () => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    expect(await world.plugin.findAnchor(file, 1, 2)).toBe('nvi-gen-1-2');
    expect(await world.plugin.findAnchor(file, 1, null)).toBeNull();
  });
});

describe('verseIn', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('is the verse that was asked for', async () => {
    expect(await world.plugin.verseIn(file, 2)).toEqual({
      verse: 2,
      text: GEN_1[1],
    });
  });

  it('is the opening verse where none was asked for', async () => {
    expect(await world.plugin.verseIn(file, null)).toMatchObject({ verse: 1 });
  });

  it('is the closest verse before it where a version merges them', async () => {
    world.vault.write(
      file.path,
      '1. Um e dois ^nvi-gen-1-1\n3. Três ^nvi-gen-1-3',
    );
    expect(await world.plugin.verseIn(file, 2)).toMatchObject({ verse: 1 });
  });

  it('falls back to the opening verse where none comes before', async () => {
    world.vault.write(file.path, '5. Cinco ^nvi-gen-1-5');
    expect(await world.plugin.verseIn(file, 1)).toMatchObject({ verse: 5 });
  });

  it('is nothing for a file holding no verses', async () => {
    world.vault.write(file.path, 'Sem versículos.');
    expect(await world.plugin.verseIn(file, 1)).toBeNull();
  });
});

describe('versionsFor', () => {
  it('gives every other version its entry', async () => {
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1), {
      verse: 1,
    });
    const items = await world.plugin.versionsFor(loc, false);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      version: 'ARA',
      text: 'No princípio, criou Deus.',
      matchedVerse: 1,
      isCurrent: false,
    });
  });

  it('takes in the version being read when it is asked for', async () => {
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    const items = await world.plugin.versionsFor(loc, true);
    expect(items.map((i) => i.version)).toEqual(['ARA', 'NVI']);
    expect(items[1].isCurrent).toBe(true);
  });

  it('leaves out a version that does not carry the chapter', async () => {
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 2));
    expect(await world.plugin.versionsFor(loc, false)).toEqual([]);
  });

  it('leaves the text empty where the version has no such verse', async () => {
    world.vault.write(chapterPath('ARA', 1, 'GEN', 1), 'Sem versículos.');
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    const [item] = await world.plugin.versionsFor(loc, false);
    expect(item).toMatchObject({ text: '', matchedVerse: null });
  });
});

describe('jumpTo', () => {
  it('opens the chapter of the other version, on the verse being read', async () => {
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1), {
      verse: 1,
    });
    await world.plugin.jumpTo('ARA', loc);
    expect(world.workspace.opened).toEqual([
      {
        link: 'Bibles/ARA/ARA-01-GEN-001.md#^ara-gen-1-1',
        from: 'Bibles/NVI/NVI-01-GEN-001.md',
        newLeaf: false,
      },
    ]);
  });

  it('opens the chapter itself where the verse has no anchor', async () => {
    world.vault.write(chapterPath('ARA', 1, 'GEN', 1), '1. Sem âncora');
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1), {
      verse: 1,
    });
    await world.plugin.jumpTo('ARA', loc);
    expect(world.workspace.opened[0].link).toBe('Bibles/ARA/ARA-01-GEN-001.md');
  });

  it('follows the setting when the caller names no pane', async () => {
    world.plugin.settings.openInNewTab = true;
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    await world.plugin.jumpTo('ARA', loc);
    expect(world.workspace.opened[0].newLeaf).toBe(true);
  });

  it('opens where the caller says, over the setting', async () => {
    world.plugin.settings.openInNewTab = true;
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    await world.plugin.jumpTo('ARA', loc, 'split');
    expect(world.workspace.opened[0].newLeaf).toBe('split');
  });

  it('says so where the version has no such chapter', async () => {
    world.plugin.settings.labels = { ARA: 'Almeida' };
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 2));
    await world.plugin.jumpTo('ARA', loc);
    expect(world.workspace.opened).toEqual([]);
    expect(notices.at(-1)?.message).toBe('Almeida has no Gênesis 2.');
  });

  it('names the files fighting over it where that is why', async () => {
    const world = harness({
      ...vault,
      'Bibles/ARA/cópia/ARA-01-GEN-001.md': '1. Uma cópia ^x',
    });
    clearNotices();
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    await world.plugin.jumpTo('ARA', loc);
    expect(notices.at(-1)?.message).toBe(
      'ARA has 2 files for Gênesis 1: ARA-01-GEN-001, ARA-01-GEN-001. ' +
        'Rename or remove one.',
    );
  });
});

describe('conflictFor', () => {
  it('is nothing where the version has no duplicates', () => {
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 1));
    expect(world.plugin.conflictFor('ARA', loc)).toBeNull();
  });

  it('finds the pair claiming the whole book', () => {
    const world = harness({
      ...vault,
      'Bibles/ARA/ARA-01-GEN-000.md': '1. Todo o livro ^a',
      'Bibles/ARA/cópia/ARA-01-GEN-000.md': '1. Uma cópia ^b',
    });
    const loc = locationFor(world, chapterPath('NVI', 1, 'GEN', 2));
    expect(world.plugin.conflictFor('ARA', loc)).toHaveLength(2);
  });
});

describe('openChapter', () => {
  it('opens the chapter, from the note it was asked in', async () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    await world.plugin.openChapter('ARA', 43, 1, from, 'tab');
    expect(world.workspace.opened).toEqual([
      {
        link: 'Bibles/ARA/ARA-43-JHN-001.md',
        from: 'Bibles/NVI/NVI-01-GEN-001.md',
        newLeaf: 'tab',
      },
    ]);
  });

  it('opens it from nowhere in particular where nothing asked', async () => {
    await world.plugin.openChapter('ARA', 43, 1, null);
    expect(world.workspace.opened[0]).toMatchObject({
      from: '',
      newLeaf: false,
    });
  });

  it('says so where the version has no such chapter', async () => {
    await world.plugin.openChapter('ARA', 1, 5, null);
    expect(notices.at(-1)?.message).toBe('ARA has no Gênesis 5.');
  });

  it('names the book alone where no chapter was asked for', async () => {
    await world.plugin.openChapter('ARA', 66, null, null);
    expect(notices.at(-1)?.message).toBe('ARA has no Apocalipse.');
  });
});

describe('promptVersion', () => {
  it('says what to open first where nothing is', async () => {
    await world.plugin.promptVersion();
    expect(notices.at(-1)?.message).toBe('Open a Bible chapter first.');
  });

  it('says so where no other version carries the passage', async () => {
    world.workspace.activeView = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 2),
      ) as TFile,
    });
    await world.plugin.promptVersion();
    expect(notices.at(-1)?.message).toBe('No other version has this passage.');
  });

  it('opens the picker on the versions that do', async () => {
    world.workspace.activeView = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
    });
    const open = vi.spyOn(SuggestModal.prototype, 'open');
    await world.plugin.promptVersion();

    expect(open).toHaveBeenCalledTimes(1);
    // Opened on the passage in front, holding the versions that carry it.
    const picker = open.mock.contexts[0] as unknown as VersionSuggestModal;
    expect(picker.placeholder).toBe('Gênesis 1 — pick a version');
    expect(picker.getSuggestions('').map((i) => i.version)).toEqual(['ARA']);
  });
});

describe('locationOf', () => {
  it('reads the version, the book, the chapter and the file', () => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    expect(world.plugin.locationOf(file, null)).toEqual({
      version: 'NVI',
      bookIndex: 1,
      book: 'Gênesis',
      chapter: 1,
      verse: null,
      file,
    });
  });

  it('is nothing for no file at all', () => {
    expect(world.plugin.locationOf(null, null)).toBeNull();
  });

  it('is nothing for a note outside the Bible folder', () => {
    const file = world.vault.getAbstractFileByPath(
      'Estudos/Romanos.md',
    ) as TFile;
    expect(world.plugin.locationOf(file, null)).toBeNull();
  });

  it('is nothing for a loose file straight in the Bible folder', () => {
    const file = world.vault.getAbstractFileByPath('Bibles/Notas.md') as TFile;
    expect(world.plugin.locationOf(file, null)).toBeNull();
  });

  it('is nothing for a note under a version that is not a chapter', () => {
    const file = world.vault.getAbstractFileByPath(
      'Bibles/NVI/Leituras.md',
    ) as TFile;
    expect(world.plugin.locationOf(file, null)).toBeNull();
  });
});

describe('linkContext', () => {
  /** A note whose links are `targets`, in the order it writes them. */
  function note(...targets: string[]): TFile {
    const file = world.vault.write('Estudos/Salmo.md', 'Um estudo.');
    world.metadataCache.links.set(file.path, targets);
    return file;
  }

  it('reads the passage off the first link that lands in the Bible', () => {
    expect(world.plugin.linkContext(note('NVI-43-JHN-001'))).toEqual(
      locationFor(world, chapterPath('NVI', 43, 'JHN', 1)),
    );
  });

  it('walks past everything the note links that is not a chapter', () => {
    const here = note('Estudos/Romanos', 'Bibles/Notas', 'NVI-01-GEN-002');
    expect(world.plugin.linkContext(here)).toEqual(
      locationFor(world, chapterPath('NVI', 1, 'GEN', 2)),
    );
  });

  it('takes the first chapter linked, not the last', () => {
    const here = note('NVI-01-GEN-001', 'NVI-43-JHN-001');
    expect(world.plugin.linkContext(here)).toEqual(
      locationFor(world, chapterPath('NVI', 1, 'GEN', 1)),
    );
  });

  it('reads the chapter a link names past the verse it points into', () => {
    const here = note('NVI-43-JHN-001#^nvi-jhn-1-1');
    expect(world.plugin.linkContext(here)).toEqual(
      locationFor(world, chapterPath('NVI', 43, 'JHN', 1)),
    );
  });

  it('carries nothing from a link to nothing the vault holds', () => {
    expect(world.plugin.linkContext(note('Salmos 151'))).toBeNull();
  });

  it('carries nothing from a note that links nothing at all', () => {
    const file = world.vault.write('Estudos/Vazio.md', 'Sem links.');
    expect(world.plugin.linkContext(file)).toBeNull();
  });

  it('carries nothing where there is no note to read', () => {
    expect(world.plugin.linkContext(null)).toBeNull();
  });
});
describe('cursorVerse', () => {
  function editing(text: string) {
    const view = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
      editor: new FakeEditor(text),
    });
    return { view, editor: editorOf(view) };
  }

  it('is the verse the cursor sits on', () => {
    const { view, editor } = editing(
      '1. Um ^nvi-gen-1-1\n2. Dois ^nvi-gen-1-2',
    );
    editor.at(1);
    expect(world.plugin.cursorVerse(view)).toBe(2);
  });

  it('is the nearest verse above a line that is not one', () => {
    const { view, editor } = editing('1. Um ^nvi-gen-1-1\n\nUm comentário\n');
    editor.at(3);
    expect(world.plugin.cursorVerse(view)).toBe(1);
  });

  it('is nothing above the first verse of the chapter', () => {
    const { view, editor } = editing('# Gênesis 1\n\n1. Um ^nvi-gen-1-1');
    editor.at(0);
    expect(world.plugin.cursorVerse(view)).toBeNull();
  });

  it('is the verse a selection starts on, not the one it ends on', () => {
    const { view, editor } = editing(
      '1. Um ^nvi-gen-1-1\n2. Dois ^nvi-gen-1-2',
    );
    editor.at(1);
    editor.anchor = { line: 0, ch: 0 };
    editor.selected = true;
    expect(world.plugin.cursorVerse(view)).toBe(1);
  });

  it('is nothing where the pane has no editor', () => {
    const view = pane(world.app, { file: null });
    expect(world.plugin.cursorVerse(view)).toBeNull();
  });

  it('is nothing where the cursor cannot be read at all', () => {
    const { view, editor } = editing('1. Um ^nvi-gen-1-1');
    editor.broken = true;
    expect(world.plugin.cursorVerse(view)).toBeNull();
  });
});

describe('a chapter in reading mode', () => {
  let page: HTMLElement;
  let scroller: HTMLElement;
  let file: TFile;

  /** Where an element sits on screen, which nothing in jsdom works out. */
  function place(el: Element, top: number) {
    el.getBoundingClientRect = () =>
      ({ top, bottom: top + 20, height: 20 }) as DOMRect;
  }

  function scrollTo(el: HTMLElement, top: number) {
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true });
  }

  /** A rendered chapter, as a list of verses, with the tops they sit at. */
  function render(html: string, tops: number[] = []) {
    page.innerHTML = `
      <div class="markdown-preview-view">
        <div class="markdown-preview-sizer">${html}</div>
      </div>`;
    scroller = page.querySelector('.markdown-preview-view') as HTMLElement;
    place(scroller, 0);
    scrollTo(scroller, 0);
    const verses = page.querySelectorAll('.markdown-preview-sizer li, p');
    tops.forEach((top, i) => place(verses[i], top));
  }

  function reading() {
    return pane(world.app, { file, mode: 'preview', preview: page });
  }

  beforeEach(async () => {
    page = document.createElement('div');
    document.body.append(page);
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    // The verses are paired against the file, which has to have been read.
    await world.plugin.chapterVerses(file);
    // The page has been scrolled: verse 1 is off the top, verse 2 is under it.
    render('<ol><li>Um</li><li>Dois</li><li>Três</li></ol>', [-50, 10, 200]);
  });

  afterEach(() => {
    page.remove();
    world.plugin.previewLock = null;
  });

  it('reads the topmost verse still on the page', () => {
    expect(world.plugin.previewVerse(reading())).toBe(2);
  });

  it('reads the first verse where the page has not scrolled', () => {
    render('<ol><li>Um</li><li>Dois</li><li>Três</li></ol>', [100, 200, 300]);
    expect(world.plugin.previewVerse(reading())).toBe(1);
  });

  it('is what the sidebar reads off a pane in reading mode', () => {
    world.workspace.activeView = reading();
    expect(world.plugin.currentLocation()).toMatchObject({
      version: 'NVI',
      verse: 2,
    });
  });

  it('measures against the pane where it renders no view of its own', () => {
    const bare = document.createElement('div');
    bare.innerHTML =
      '<div class="markdown-preview-sizer"><ol><li>Um</li></ol></div>';
    const view = pane(world.app, { file, mode: 'preview', preview: bare });
    expect(world.plugin.previewScroller(view)).toBe(bare);
  });

  it('reads past a selection that is in no verse at all', () => {
    render(
      '<p id="head">Um cabeçalho</p>' +
        '<ol><li>Um</li><li>Dois</li><li>Três</li></ol>',
      [0, -50, 10, 200],
    );
    const head = page.querySelector('#head') as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(head);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(world.plugin.previewVerse(reading())).toBe(2);
    selection?.removeAllRanges();
  });

  it('reads nothing from a pane that renders nothing', () => {
    const bare = pane(world.app, { file, mode: 'preview' });
    expect(world.plugin.previewVerse(bare)).toBeNull();
  });

  it('reads nothing while the file itself has not been read', () => {
    const cold = harness(vault, { language: 'pt' });
    const view = pane(cold.app, {
      file: cold.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
      mode: 'preview',
      preview: page,
    });
    expect(cold.plugin.previewVerse(view)).toBeNull();
  });

  it('falls back to the numbers the page writes when they cannot be paired', () => {
    render(
      '<p>Um cabeçalho</p><ol start="4"><li>Quatro</li><li>Cinco</li></ol>',
      [10, 20, 30],
    );
    const view = reading();
    expect(
      world.plugin.verseParagraphs(view, scroller).map((v) => v.verse),
    ).toEqual([4, 5]);
  });

  it('reads the number an older chapter bolds into the paragraph', () => {
    render(
      '<p><strong>1</strong> Um</p><p><strong>2</strong> Dois</p>' +
        '<p><strong>3</strong> Três</p><p>E um comentário</p>',
      [10, 20, 30, 40],
    );
    const view = reading();
    expect(
      world.plugin.verseParagraphs(view, scroller).map((v) => v.verse),
    ).toEqual([1, 2, 3]);
  });

  it('holds the verse that was clicked until the pane scrolls on', () => {
    const view = reading();
    world.workspace.activeView = view;
    const third = page.querySelectorAll('li')[2];
    world.plugin.lockPreviewVerse({ target: third } as unknown as MouseEvent);
    expect(world.plugin.previewLock).toMatchObject({ verse: 3, scrollTop: 0 });
    expect(world.plugin.previewVerse(view)).toBe(3);

    scrollTo(scroller, 300);
    expect(world.plugin.previewVerse(view)).toBe(2);
    expect(world.plugin.previewLock).toBeNull();
  });

  it('lets a verse go once another file is in front', () => {
    const view = reading();
    world.plugin.previewLock = { path: 'outro.md', verse: 3, scrollTop: 0 };
    expect(world.plugin.previewVerse(view)).toBe(2);
    expect(world.plugin.previewLock).toBeNull();
  });

  it('reads the verse a selection starts in', () => {
    const view = reading();
    const range = document.createRange();
    const items = page.querySelectorAll('li');
    range.setStart(items[1].firstChild as Node, 0);
    range.setEnd(items[2].firstChild as Node, 1);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(world.plugin.previewVerse(view)).toBe(2);
    selection?.removeAllRanges();
  });

  it('ignores a selection made somewhere else entirely', () => {
    const outside = document.createElement('p');
    outside.textContent = 'Noutro sítio';
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(world.plugin.previewVerse(reading())).toBe(2);
    selection?.removeAllRanges();
    outside.remove();
  });
});

describe('lockPreviewVerse', () => {
  let page: HTMLElement;
  let file: TFile;

  beforeEach(async () => {
    page = document.createElement('div');
    page.innerHTML = `
      <div class="markdown-preview-view">
        <div class="markdown-preview-sizer">
          <ol><li>Um</li><li>Dois</li><li id="tres">Três</li></ol>
        </div>
      </div>`;
    document.body.append(page);
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    await world.plugin.chapterVerses(file);
    world.workspace.activeView = pane(world.app, {
      file,
      mode: 'preview',
      preview: page,
    });
  });

  afterEach(() => {
    page.remove();
    world.plugin.previewLock = null;
  });

  function clickOn(el: Element | null) {
    world.plugin.lockPreviewVerse({ target: el } as unknown as MouseEvent);
  }

  it('holds the verse the click landed in', () => {
    clickOn(page.querySelector('#tres'));
    expect(world.plugin.previewLock).toMatchObject({
      path: file.path,
      verse: 3,
    });
  });

  it('leaves a link to navigate on its own', () => {
    const link = document.createElement('a');
    page.querySelector('#tres')?.append(link);
    clickOn(link);
    expect(world.plugin.previewLock).toBeNull();
  });

  it('holds nothing for a click on nothing at all', () => {
    world.plugin.lockPreviewVerse({ target: null } as unknown as MouseEvent);
    expect(world.plugin.previewLock).toBeNull();
  });

  it('holds nothing while the pane is being edited', () => {
    world.workspace.activeView = pane(world.app, {
      file,
      editor: new FakeEditor(''),
    });
    clickOn(page.querySelector('#tres'));
    expect(world.plugin.previewLock).toBeNull();
  });

  it('holds nothing for a click outside the chapter', () => {
    const outside = document.createElement('p');
    document.body.append(outside);
    clickOn(outside);
    expect(world.plugin.previewLock).toBeNull();
    outside.remove();
  });

  it('holds nothing for a click that is on no verse', () => {
    clickOn(page.querySelector('.markdown-preview-sizer'));
    expect(world.plugin.previewLock).toBeNull();
  });
});

describe('writtenVerse', () => {
  function element(html: string, selector: string): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    return holder.querySelector(selector) as HTMLElement;
  }

  it('counts a list item from the number the list opens on', () => {
    expect(
      world.plugin.writtenVerse(
        element('<ol start="4"><li>a</li><li id="b">b</li></ol>', '#b'),
      ),
    ).toBe(5);
  });

  it('reads nothing off a list item outside an ordered list', () => {
    expect(
      world.plugin.writtenVerse(element('<ul><li id="a">a</li></ul>', '#a')),
    ).toBeNull();
  });

  it('reads the number an older chapter bolds into the paragraph', () => {
    expect(
      world.plugin.writtenVerse(
        element('<p id="a"><strong>7</strong> Sete</p>', '#a'),
      ),
    ).toBe(7);
  });

  it('reads nothing off a paragraph that opens with something else', () => {
    expect(
      world.plugin.writtenVerse(element('<p id="a">Sem número</p>', '#a')),
    ).toBeNull();
    expect(
      world.plugin.writtenVerse(
        element('<p id="a"><strong>Nota</strong> ...</p>', '#a'),
      ),
    ).toBeNull();
  });
});

describe('currentLocation', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('reads the pane being edited, cursor and all', () => {
    const editor = new FakeEditor('1. Um ^nvi-gen-1-1\n2. Dois ^nvi-gen-1-2');
    editor.at(1);
    world.workspace.activeView = pane(world.app, { file, editor });
    expect(world.plugin.currentLocation()).toMatchObject({
      version: 'NVI',
      verse: 2,
    });
  });

  it('is nothing at all with nothing open', () => {
    expect(world.plugin.currentLocation()).toBeNull();
  });

  it('reads the file in front where focus is not on an editor', () => {
    world.workspace.activeFile = file;
    expect(world.plugin.currentLocation()).toMatchObject({ version: 'NVI' });
  });

  it('keeps the verse it had when focus leaves the editor', () => {
    const editor = new FakeEditor('1. Um ^nvi-gen-1-1\n2. Dois ^nvi-gen-1-2');
    editor.at(1);
    world.workspace.activeView = pane(world.app, { file, editor });
    world.plugin.currentLocation();

    world.workspace.activeView = null;
    world.workspace.activeFile = file;
    expect(world.plugin.currentLocation()?.verse).toBe(2);
  });

  it('lets the verse go once another file is in front', () => {
    const editor = new FakeEditor('1. Um ^nvi-gen-1-1');
    world.workspace.activeView = pane(world.app, { file, editor });
    world.plugin.currentLocation();

    world.workspace.activeView = null;
    world.workspace.activeFile = world.vault.getAbstractFileByPath(
      chapterPath('ARA', 1, 'GEN', 1),
    ) as TFile;
    expect(world.plugin.currentLocation()).toMatchObject({ version: 'ARA' });
  });
});

describe('keepVerse', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('holds the verse across a switch into reading mode', () => {
    world.plugin.lastLocation = { ...locationFor(world, file.path), verse: 2 };
    const fresh = { ...locationFor(world, file.path), verse: null };
    expect(world.plugin.keepVerse(fresh)?.verse).toBe(2);
  });

  it('holds nothing for another file, or for no location at all', () => {
    world.plugin.lastLocation = {
      ...locationFor(world, chapterPath('ARA', 1, 'GEN', 1)),
      verse: 2,
    };
    const fresh = { ...locationFor(world, file.path), verse: null };
    expect(world.plugin.keepVerse(fresh)?.verse).toBeNull();
    expect(world.plugin.keepVerse(null)).toBeNull();
  });

  it('leaves a verse that was read alone', () => {
    world.plugin.lastLocation = { ...locationFor(world, file.path), verse: 2 };
    const fresh = { ...locationFor(world, file.path), verse: 3 };
    expect(world.plugin.keepVerse(fresh)?.verse).toBe(3);
  });
});

describe('activateView', () => {
  it('reveals the sidebar that is already open', async () => {
    const leaf = world.workspace.addLeaf(VIEW_TYPE);
    expect(await world.plugin.activateView()).toBe(leaf);
    expect(world.workspace.revealed).toEqual([leaf]);
  });

  it('leaves an open sidebar where it is when told to', async () => {
    world.workspace.addLeaf(VIEW_TYPE);
    await world.plugin.activateView(false);
    expect(world.workspace.revealed).toEqual([]);
  });

  it('opens one on the right where there is none', async () => {
    const leaf = world.workspace.addLeaf('empty');
    world.workspace.rightLeaf = leaf;
    expect(await world.plugin.activateView()).toBe(leaf);
    expect(leaf.type).toBe(VIEW_TYPE);
    expect(world.workspace.revealed).toEqual([leaf]);
  });

  it('opens nothing where the workspace has no room on the right', async () => {
    expect(await world.plugin.activateView()).toBeNull();
  });
});

describe('refreshViews', () => {
  it('redraws every sidebar, and the bars over the chapters', async () => {
    await world.plugin.onload();
    const leaf = world.workspace.addLeaf(VIEW_TYPE);
    const view = world.plugin.views.get(VIEW_TYPE)!(leaf) as KingdoneChapelView;
    leaf.view = view;
    await view.onOpen();
    const redraw = vi.spyOn(view, 'refresh');
    const refresh = vi.spyOn(world.plugin.breadcrumbs, 'refresh');

    world.plugin.refreshViews();
    expect(redraw).toHaveBeenCalledWith(true);
    expect(refresh).toHaveBeenCalled();
    view.unload();
    world.plugin.unload();
  });

  it('leaves alone a pane of the right type holding something else', () => {
    const leaf = world.workspace.addLeaf(VIEW_TYPE);
    leaf.view = { refresh: vi.fn() };
    world.plugin.refreshViews();
    expect(
      (leaf.view as { refresh: () => void }).refresh,
    ).not.toHaveBeenCalled();
  });
});

describe('saveSettings', () => {
  it('writes the settings, and reads the vault again', async () => {
    world.plugin.settings.translationsFolder = 'Textos';
    world.plugin.index();
    await world.plugin.saveSettings();
    expect(world.plugin.data).toMatchObject({ translationsFolder: 'Textos' });
    expect(world.plugin.bibleIndex).toBeNull();
  });
});

describe('the breadcrumbs waiting out a run of changes', () => {
  it('redraws once for a run of renames, and not before it ends', async () => {
    vi.useFakeTimers();
    await world.plugin.onload();
    const refresh = vi.spyOn(world.plugin.breadcrumbs, 'refresh');

    world.plugin.queueBreadcrumbs();
    world.plugin.queueBreadcrumbs();
    vi.advanceTimersByTime(199);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(world.plugin.queuedRefresh).toBeNull();
    world.plugin.unload();
  });

  it('drops a redraw that never came due', () => {
    vi.useFakeTimers();
    world.plugin.breadcrumbs = { refresh: vi.fn() } as never;
    world.plugin.queueBreadcrumbs();
    world.plugin.cancelQueuedRefresh();
    vi.advanceTimersByTime(500);
    expect(world.plugin.breadcrumbs.refresh).not.toHaveBeenCalled();
    expect(world.plugin.queuedRefresh).toBeNull();
  });

  it('drops nothing where nothing is due', () => {
    world.plugin.cancelQueuedRefresh();
    expect(world.plugin.queuedRefresh).toBeNull();
  });
});

describe('onload', () => {
  afterEach(() => {
    world.plugin.unload();
  });

  it('reads the settings that were saved, over the defaults', async () => {
    world.plugin.data = { translationsFolder: 'Textos', followCursor: false };
    await world.plugin.onload();
    expect(world.plugin.settings).toMatchObject({
      translationsFolder: 'Textos',
      followCursor: false,
      openInNewTab: false,
    });
  });

  it('offers the sidebar, the picker and a command per version', async () => {
    await world.plugin.onload();
    expect(world.plugin.commands.map((c) => c.id)).toEqual([
      'open-verse-in-another-version',
      'create-version',
      'open-sidebar',
      'open-in-ara',
      'open-in-nvi',
      'reload-versions',
    ]);
    expect(world.plugin.ribbons[0]).toMatchObject({ icon: 'church' });
    expect(world.plugin.views.has(VIEW_TYPE)).toBe(true);
    expect(world.plugin.settingTabs).toHaveLength(1);
    expect(world.plugin.suggests).toHaveLength(1);
  });

  it('opens the picker and the sidebar from what it offers', async () => {
    await world.plugin.onload();
    const prompt = vi.spyOn(world.plugin, 'promptVersion').mockResolvedValue();
    const activate = vi
      .spyOn(world.plugin, 'activateView')
      .mockResolvedValue(null);

    world.plugin.commands
      .find((c) => c.id === 'open-verse-in-another-version')
      ?.callback?.();
    world.plugin.commands.find((c) => c.id === 'open-sidebar')?.callback?.();
    world.plugin.ribbons[0].callback();

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(2);
  });

  it('watches for the click that holds a verse in reading mode', async () => {
    await world.plugin.onload();
    const lock = vi.spyOn(world.plugin, 'lockPreviewVerse');
    document.dispatchEvent(new MouseEvent('click'));
    expect(lock).toHaveBeenCalled();
  });

  it('drops a chapter from the cache when it is written to', async () => {
    await world.plugin.onload();
    world.plugin.chapterCache.set('Bibles/NVI/x.md', { mtime: 1, verses: [] });
    world.vault.trigger('modify', { path: 'Bibles/NVI/x.md' });
    expect(world.plugin.chapterCache.size).toBe(0);
  });

  it('reads the vault again once it has stopped moving', async () => {
    vi.useFakeTimers();
    await world.plugin.onload();
    world.plugin.index();
    const refresh = vi.spyOn(world.plugin.breadcrumbs, 'refresh');

    for (const event of ['create', 'delete', 'rename']) {
      world.vault.trigger(event, {});
    }
    expect(world.plugin.bibleIndex).toBeNull();
    vi.advanceTimersByTime(200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('puts the bar back whenever a pane changes what it shows', async () => {
    await world.plugin.onload();
    const refresh = vi.spyOn(world.plugin.breadcrumbs, 'refresh');
    for (const event of ['file-open', 'layout-change', 'active-leaf-change']) {
      world.workspace.trigger(event);
    }
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('says which versions it found, on being asked to look again', async () => {
    await world.plugin.onload();
    const reload = world.plugin.commands.find(
      (c) => c.id === 'reload-versions',
    );
    world.plugin.chapterCache.set('x', { mtime: 1, verses: [] });
    reload?.callback?.();
    expect(world.plugin.chapterCache.size).toBe(0);
    expect(notices.at(-1)?.message).toBe('Versions found: ARA, NVI');
  });

  it('says as much where it found none', async () => {
    const empty = harness();
    await empty.plugin.onload();
    empty.plugin.commands.find((c) => c.id === 'reload-versions')?.callback?.();
    expect(notices.at(-1)?.message).toBe('Versions found: none');
    empty.plugin.unload();
  });

  it('opens the sidebar on startup where that is asked for', async () => {
    world.plugin.data = { openSidebarOnStart: true };
    world.workspace.rightLeaf = world.workspace.addLeaf('empty');
    await world.plugin.onload();
    await vi.waitFor(() =>
      expect(world.workspace.getLeavesOfType(VIEW_TYPE)).toHaveLength(1),
    );
    expect(world.workspace.revealed).toEqual([]);
  });

  it('leaves the sidebar shut otherwise', async () => {
    world.workspace.rightLeaf = world.workspace.addLeaf('empty');
    await world.plugin.onload();
    expect(world.workspace.getLeavesOfType(VIEW_TYPE)).toHaveLength(0);
  });

  it('takes the bars down with it when it is unloaded', async () => {
    await world.plugin.onload();
    const clear = vi.spyOn(world.plugin.breadcrumbs, 'clear');
    world.plugin.unload();
    expect(clear).toHaveBeenCalled();
  });
});

describe('a command per version', () => {
  let command: NonNullable<ReturnType<typeof commandFor>>;

  function commandFor(id: string) {
    return world.plugin.commands.find((c) => c.id === id);
  }

  beforeEach(async () => {
    await world.plugin.onload();
    command = commandFor('open-in-ara')!;
  });

  afterEach(() => {
    world.plugin.unload();
  });

  it('is offered only while a chapter of another version is open', () => {
    expect(command.checkCallback?.(true)).toBe(false);

    world.workspace.activeView = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
    });
    expect(command.checkCallback?.(true)).toBe(true);
  });

  it('is not offered for the version already being read', () => {
    world.workspace.activeView = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('ARA', 1, 'GEN', 1),
      ) as TFile,
    });
    expect(command.checkCallback?.(true)).toBe(false);
  });

  it('opens the chapter when it is run', async () => {
    world.workspace.activeView = pane(world.app, {
      file: world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
    });
    command.checkCallback?.(false);
    await vi.waitFor(() => expect(world.workspace.opened).toHaveLength(1));
    expect(world.workspace.opened[0].link).toContain('ARA-01-GEN-001');
  });

  it('names the version under the label it was given', async () => {
    const labelled = harness(vault, { labels: { ARA: 'Almeida' } });
    await labelled.plugin.onload();
    expect(
      labelled.plugin.commands.find((c) => c.id === 'open-in-ara')?.name,
    ).toBe('Open this verse in Almeida');
    labelled.plugin.unload();
  });
});
