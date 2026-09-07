// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

import { chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { Sweep } from './sweep';
import type { SweepProgress } from './sweep';

const NVI_GEN = ['No princípio, Deus criou os céus e a terra.'];

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, NVI_GEN),
  ...chapter('NVI', 43, 'JHN', 1, ['No princípio era o Verbo.']),
  ...chapter('ARA', 1, 'GEN', 1, ['No princípio, criou Deus.']),
};

/** The file at `path`, in the type the plugin reads it as. */
function fileAt(world: Harness, path: string): TFile {
  return world.vault.getAbstractFileByPath(path) as TFile;
}

describe('Sweep', () => {
  it('reads every chapter the vault holds', async () => {
    const world = harness({
      ...vault,
      [chapterPath('NVI', 1, 'GEN', 1)]: '1. Um ^nvi-gen-1-1\n2. Dois',
    });
    await new Sweep(world.plugin).run();
    expect(
      world.plugin.diagnostics.all().map((row) => [row.kind, row.verse]),
    ).toEqual([['unanchored-verse', 2]]);
  });

  it('says how many files there are before it has read any', async () => {
    const world = harness(vault);
    const seen: SweepProgress[] = [];
    await new Sweep(world.plugin).run((at) => seen.push({ ...at }));
    expect(seen[0]).toEqual({ done: 0, total: 3 });
    expect(seen[seen.length - 1]).toEqual({ done: 3, total: 3 });
  });

  it('reads the version of the note in front before the others', async () => {
    const world = harness(vault);
    world.workspace.activeFile = fileAt(world, chapterPath('ARA', 1, 'GEN', 1));
    const read: string[] = [];
    vi.spyOn(world.plugin.diagnostics, 'ofChapter').mockImplementation(
      async (file: TFile) => {
        read.push(file.path);
        return [];
      },
    );
    await new Sweep(world.plugin).run();
    expect(read[0]).toBe(chapterPath('ARA', 1, 'GEN', 1));
  });

  it('yields to the interface rather than reading the vault in one go', async () => {
    const world = harness(vault);
    const sweep = new Sweep(world.plugin, 1);
    const seen: number[] = [];
    const done = sweep.run((at) => seen.push(at.done));
    // Whatever the first chunk managed, and no more: the rest waits for a turn
    // the interface has had first.
    await Promise.resolve();
    expect(seen[seen.length - 1]).toBeLessThan(3);
    await done;
  });

  it('stops where it stands when it is cancelled', async () => {
    const world = harness(vault);
    const sweep = new Sweep(world.plugin, 1);
    const read: string[] = [];
    vi.spyOn(world.plugin.diagnostics, 'ofChapter').mockImplementation(
      async (file: TFile) => {
        read.push(file.path);
        sweep.cancel();
        return [];
      },
    );
    await sweep.run();
    expect(read).toHaveLength(1);
  });

  it('answers with what it found, once it has read everything', async () => {
    const world = harness({
      ...vault,
      [chapterPath('ARA', 1, 'GEN', 1)]: '1. Um\n2. Dois',
    });
    const found = await new Sweep(world.plugin).run();
    expect(found.map((row) => row.verse)).toEqual([1, 2]);
  });
});

describe('a sweep with nothing in front of it', () => {
  it('reads the vault all the same when the note in front is no chapter', async () => {
    const world = harness({ ...vault, 'Estudos/Romanos.md': 'Uma nota.' });
    world.workspace.activeFile = fileAt(world, 'Estudos/Romanos.md');
    const read = vi.spyOn(world.plugin.diagnostics, 'ofChapter');
    await new Sweep(world.plugin).run();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('reads past a chapter it cannot read at all', async () => {
    const world = harness(vault);
    const read = vi
      .spyOn(world.plugin.diagnostics, 'ofChapter')
      .mockRejectedValueOnce(new Error('unreadable'));
    await new Sweep(world.plugin).run();
    expect(read).toHaveBeenCalledTimes(3);
  });
});
