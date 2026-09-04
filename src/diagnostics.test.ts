// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

import { chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { chapterDiagnostics } from './diagnostics';
import { parseVerses } from './utils';

/** The rows a chapter of `text` produces, read the way the plugin reads it. */
function of(text: string, chapter = 1): ReturnType<typeof chapterDiagnostics> {
  const ids = (text.match(/\^[A-Za-z0-9-]+\s*$/gm) || []).map((s) =>
    s.trim().slice(1),
  );
  return chapterDiagnostics(
    { version: 'ARA', path: 'Bibles/ARA/ARA-01-GEN-001.md', chapter },
    parseVerses(text),
    ids,
  );
}

describe('chapterDiagnostics', () => {
  it('says nothing about a chapter whose every verse is anchored', () => {
    expect(of('1. Um ^ara-gen-1-1\n2. Dois ^ara-gen-1-2')).toEqual([]);
  });

  it('reports a verse written but never anchored, as an error', () => {
    expect(of('1. Um ^ara-gen-1-1\n2. Dois\n3. Tres ^ara-gen-1-3')).toEqual([
      {
        kind: 'unanchored-verse',
        severity: 'error',
        version: 'ARA',
        paths: ['Bibles/ARA/ARA-01-GEN-001.md'],
        verse: 2,
      },
    ]);
  });

  it('reports a block id naming another chapter, as a warning', () => {
    expect(of('1. Um ^ara-gen-2-1\n2. Dois ^ara-gen-1-2')).toEqual([
      {
        kind: 'foreign-block-id',
        severity: 'warning',
        version: 'ARA',
        paths: ['Bibles/ARA/ARA-01-GEN-001.md'],
        verse: 1,
      },
    ]);
  });

  it('takes an id naming a verse and no chapter as anchoring it', () => {
    expect(of('1. Um ^ara-1\n2. Dois ^ara-gen-1-2')).toEqual([]);
  });

  it('leaves an id naming no verse at all alone', () => {
    expect(of('# Genesis 1 ^ara-gen-heading\n1. Um ^ara-gen-1-1')).toEqual([]);
  });

  it('reports a chapter holding no verses at all, as a warning', () => {
    expect(of('# Genesis 1\n\nNothing written yet.')).toEqual([
      {
        kind: 'empty-chapter',
        severity: 'warning',
        version: 'ARA',
        paths: ['Bibles/ARA/ARA-01-GEN-001.md'],
        verse: null,
      },
    ]);
  });

  it('reports every unanchored verse of a chapter, in reading order', () => {
    expect(
      of('1. Um\n2. Dois ^ara-gen-1-2\n3. Tres').map((d) => d.verse),
    ).toEqual([1, 3]);
  });
});

const GEN_1 = ['No princípio, Deus criou os céus e a terra.'];

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, GEN_1),
  ...chapter('NVI', 43, 'JHN', 1, ['No princípio era o Verbo.']),
  'Bibles/NVI/NVI-01-Gênesis.md': 'Os capítulos de Gênesis.',
};

/** The file at `path`, in the type the plugin reads it as. */
function fileAt(world: Harness, path: string): TFile {
  return world.vault.getAbstractFileByPath(path) as TFile;
}

describe('ofChapter', () => {
  it('reports the verses of a chapter that no id names', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um ^nvi-gen-1-1\n2. Dois',
    });
    const found = await world.plugin.diagnostics.ofChapter(
      fileAt(world, chapterPath('NVI', 1, 'GEN', 1)),
    );
    expect(found).toEqual([
      {
        kind: 'unanchored-verse',
        severity: 'error',
        version: 'NVI',
        paths: [chapterPath('NVI', 1, 'GEN', 1)],
        verse: 2,
      },
    ]);
  });

  it('says nothing about a note that is no chapter of a version', async () => {
    const world = harness(vault);
    expect(
      await world.plugin.diagnostics.ofChapter(
        fileAt(world, 'Bibles/NVI/NVI-01-Gênesis.md'),
      ),
    ).toEqual([]);
  });

  it('says nothing about a note in no version at all', async () => {
    const world = harness({ ...vault, 'Estudos/Romanos.md': 'Uma nota.' });
    expect(
      await world.plugin.diagnostics.ofChapter(
        fileAt(world, 'Estudos/Romanos.md'),
      ),
    ).toEqual([]);
  });

  it('reads the file once, however often it is asked', async () => {
    const world = harness(vault);
    const path = chapterPath('NVI', 1, 'GEN', 1);
    // The ids as Obsidian's own cache answers for them, so the read below is
    // the one the verses need and the only one there is.
    world.metadataCache.blocks.set(path, ['nvi-gen-1-1']);
    const read = vi.spyOn(world.vault, 'cachedRead');
    const file = fileAt(world, path);
    await world.plugin.diagnostics.ofChapter(file);
    await world.plugin.diagnostics.ofChapter(file);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads it again once the file has been written to', async () => {
    const world = harness(vault);
    const path = chapterPath('NVI', 1, 'GEN', 1);
    const file = fileAt(world, path);
    await world.plugin.diagnostics.ofChapter(file);
    world.vault.write(path, '1. Um\n2. Dois');
    expect(
      (await world.plugin.diagnostics.ofChapter(file)).map((d) => d.verse),
    ).toEqual([1, 2]);
  });
});

describe('structural diagnostics', () => {
  it('reports two files claiming one chapter, naming both', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/cópia/NVI-01-GEN-001.md': '1. Uma cópia ^nvi-gen-1-1',
    });
    expect(world.plugin.diagnostics.structural()).toEqual([
      {
        kind: 'chapter-conflict',
        severity: 'error',
        version: 'NVI',
        paths: [
          chapterPath('NVI', 1, 'GEN', 1),
          'Bibles/NVI/cópia/NVI-01-GEN-001.md',
        ],
        verse: null,
      },
    ]);
  });

  it('reports two notes claiming one book', () => {
    const world = harness({
      ...vault,
      'Bibles/NVI/outra/NVI-01-Genesis.md': 'Outra lista.',
    });
    expect(world.plugin.diagnostics.structural()).toEqual([
      {
        kind: 'book-conflict',
        severity: 'error',
        version: 'NVI',
        paths: [
          'Bibles/NVI/NVI-01-Gênesis.md',
          'Bibles/NVI/outra/NVI-01-Genesis.md',
        ],
        verse: null,
      },
    ]);
  });

  it('reports a version declared but holding no chapter', () => {
    const world = harness({ ...vault, 'Estudos/Shedd/Shedd.md': '' });
    world.metadataCache.frontmatter.set('Estudos/Shedd/Shedd.md', {
      bible: true,
      code: 'Shedd',
    });
    expect(world.plugin.diagnostics.structural()).toEqual([
      {
        kind: 'empty-version',
        severity: 'warning',
        version: 'Shedd',
        paths: ['Estudos/Shedd/Shedd.md'],
        verse: null,
      },
    ]);
  });

  it('names the folder itself for a version that declared nothing', () => {
    const world = harness({ ...vault, 'Bibles/Rascunhos/Uma nota.md': '' });
    expect(world.plugin.diagnostics.structural()).toEqual([
      {
        kind: 'empty-version',
        severity: 'warning',
        version: 'Rascunhos',
        paths: ['Bibles/Rascunhos'],
        verse: null,
      },
    ]);
  });

  it('says nothing about a vault whose versions are whole', () => {
    expect(harness(vault).plugin.diagnostics.structural()).toEqual([]);
  });
});

describe('all', () => {
  it('holds the structural rows beside the chapters already read', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
      'Bibles/NVI/outra/NVI-01-Genesis.md': 'Outra lista.',
    });
    await world.plugin.diagnostics.ofChapter(
      fileAt(world, chapterPath('NVI', 1, 'GEN', 1)),
    );
    expect(
      world.plugin.diagnostics
        .all()
        .map((d) => d.kind)
        .sort(),
    ).toEqual(['book-conflict', 'unanchored-verse']);
  });

  it('drops what it read under a version the vault has stopped holding', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
    });
    await world.plugin.diagnostics.ofChapter(
      fileAt(world, chapterPath('NVI', 1, 'GEN', 1)),
    );
    // The folder the versions were found in, renamed in the settings: NVI is
    // no longer a version, and a row still naming it is about another vault.
    world.plugin.settings.translationsFolder = 'Bíblias';
    world.plugin.invalidateIndex();
    expect(world.plugin.diagnostics.all()).toEqual([]);
  });

  it('drops what it held about a file that has gone away', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
    });
    const path = chapterPath('NVI', 1, 'GEN', 1);
    await world.plugin.diagnostics.ofChapter(fileAt(world, path));
    world.plugin.diagnostics.forget(path);
    expect(world.plugin.diagnostics.all()).toEqual([]);
  });
});

/** Let everything the handlers set going finish, the way an idle app does. */
function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

describe('topping the results up', () => {
  it('reads a chapter it already knows again when it is edited', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um ^nvi-gen-1-1',
    });
    await world.plugin.onload();
    const path = chapterPath('NVI', 1, 'GEN', 1);
    const file = fileAt(world, path);
    expect(await world.plugin.diagnostics.ofChapter(file)).toEqual([]);

    world.vault.write(path, '1. Um ^nvi-gen-1-1\n2. Dois');
    world.metadataCache.trigger('changed', file, '', {});
    await flush();

    expect(world.plugin.diagnostics.all().map((d) => d.verse)).toEqual([2]);
  });

  it('forgets a chapter the vault has renamed', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
    });
    await world.plugin.onload();
    const path = chapterPath('NVI', 1, 'GEN', 1);
    const file = fileAt(world, path);
    await world.plugin.diagnostics.ofChapter(file);

    world.vault.trigger('rename', file, path);
    expect(world.plugin.diagnostics.all()).toEqual([]);
  });

  it('lets a read of a file that has gone away fail quietly', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
    });
    await world.plugin.onload();
    const path = chapterPath('NVI', 1, 'GEN', 1);
    const file = fileAt(world, path);
    await world.plugin.diagnostics.ofChapter(file);

    world.vault.write(path, '1. Um\n2. Dois');
    world.vault.remove(path);
    world.metadataCache.trigger('changed', file, '', {});
    await flush();
    expect(world.plugin.diagnostics.all().map((d) => d.verse)).toEqual([1]);
  });

  it('keeps up with a chapter that declares its own folder a version', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um ^nvi-gen-1-1',
    });
    const path = chapterPath('NVI', 1, 'GEN', 1);
    world.metadataCache.frontmatter.set(path, { bible: true, code: 'NVI' });
    await world.plugin.onload();
    const file = fileAt(world, path);
    expect(await world.plugin.diagnostics.ofChapter(file)).toEqual([]);

    world.vault.write(path, '1. Um ^nvi-gen-1-1\n2. Dois');
    world.metadataCache.trigger('changed', file, '', {
      frontmatter: { bible: true, code: 'NVI' },
    });
    await flush();

    expect(world.plugin.diagnostics.all().map((d) => d.verse)).toEqual([2]);
  });

  it('leaves a chapter it was never asked about unread', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um',
    });
    await world.plugin.onload();
    const file = fileAt(world, chapterPath('NVI', 1, 'GEN', 1));
    world.metadataCache.trigger('changed', file, '', {});
    await flush();
    expect(world.plugin.diagnostics.all()).toEqual([]);
  });
});
