import { beforeEach, describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';

import { chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { ReferenceRows } from './suggest-rows';
import type { RefSuggestion, RowContext } from './suggest-rows';

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, [
    'No princípio, Deus criou os céus e a terra.',
    'Era a terra sem forma e vazia.',
    'Disse Deus: "Haja luz".',
  ]),
  ...chapter('NVI', 1, 'GEN', 2, ['Assim foram concluídos os céus.']),
  ...chapter('NTLH', 1, 'GEN', 1, ['No começo Deus criou o céu e a terra.']),
};

let world: Harness;
let rows: ReferenceRows;

/**
 * A query asked with nothing in front of it, which is what a field of its own
 * hands over: no line to carry a book on from, and no editor to read one out
 * of. `file` is the note the reference is bound for, which the links are
 * shortened against and the numbers are counted in.
 */
function asked(query: string, file: TFile | null = null): RowContext {
  return { query, file, before: '' };
}

/** The same query, written after a reference the book may be carried on from. */
function following(before: string, query: string): RowContext {
  return { query, file: null, before };
}

/** `Gn 1.1` linked, then the semicolon that carries its book on. */
const CARRIED = 'Veja [[NVI-01-GEN-001#^nvi-gen-1-1|Gn 1.1]]; ';

/** The rows that link, which is every row but the ones that only say why. */
async function offered(
  ctx: RowContext,
  from: ReferenceRows = rows,
): Promise<RefSuggestion[]> {
  const all = await from.getSuggestions(ctx);
  return all.filter((row): row is RefSuggestion => !('hint' in row));
}

/** What a query said about itself where it had nothing to offer. */
async function hinted(
  ctx: RowContext,
  from: ReferenceRows = rows,
): Promise<string[]> {
  const all = await from.getSuggestions(ctx);
  return all.flatMap((row) => ('hint' in row ? [row.hint] : []));
}

/**
 * A note that already links a passage, which is what a bookless reference is
 * counted against. The note is an ordinary one — the passage it is about is
 * what it links, not what it is named.
 */
function about(target: string) {
  const made = harness(vault, { language: 'pt', defaultVersion: 'NVI' });
  const from = made.vault.write('Estudos/Nota.md', 'Um estudo.');
  made.metadataCache.links.set(from.path, [target]);
  return { world: made, from, rows: new ReferenceRows(made.plugin) };
}

beforeEach(() => {
  world = harness(vault, { language: 'pt', defaultVersion: 'NVI' });
  rows = new ReferenceRows(world.plugin);
});

describe('a reference written out in full', () => {
  it('answers a query and a note with the rows the query could be', async () => {
    const found = await offered(asked('Gn 1.1'));
    expect(found.map((r) => r.ref)).toEqual(['Gn 1.1', 'Gênesis 1.1']);
    expect(found[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-1|Gn 1.1]]');
    expect(found[0].preview).toBe(
      'No princípio, Deus criou os céus e a terra.',
    );
  });

  it('shortens the link against the note the reference is bound for', async () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 2),
    ) as TFile;
    const found = await offered(asked('Gn 1.1', from));
    expect(found[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-1|Gn 1.1]]');
  });

  it('embeds the passage where the query opens with a bang', async () => {
    const found = await offered(asked('!Gn 1.1'));
    expect(found.map((r) => r.markdown)).toEqual([
      '![[NVI-01-GEN-001#^nvi-gen-1-1]]',
    ]);
  });

  it('offers nothing for a query naming no book anyone wrote', async () => {
    expect(await offered(asked('Zzz 1.1'))).toEqual([]);
  });
});

describe('a reference counted against the note own passage', () => {
  it('reads numbers alone against the passage the note links', async () => {
    const made = about('NVI-01-GEN-001');
    const found = await offered(asked('3', made.from), made.rows);
    expect(found[0].ref).toBe('3');
    expect(found[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-3|3]]');
  });

  it('says so where the note holds no passage to read a number against', async () => {
    const from = world.vault.write('Estudos/Solta.md', 'Sem links.');
    expect(await hinted(asked('2', from))).toEqual([
      'No link in this note to read a book from — write one',
    ]);
  });
});

describe('a book carried on from what stands before the reference', () => {
  it('counts a bare number as a verse of the chapter carried from', async () => {
    const found = await offered(following(CARRIED, '3'));
    expect(found.map((r) => r.ref)).toEqual(['3', 'Gênesis 1.3']);
    expect(found[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-3|3]]');
  });

  it('takes the chapter from the reference where it names one', async () => {
    const found = await offered(following(CARRIED, '2.1'));
    expect(found[0].markdown).toBe('[[NVI-01-GEN-002#^nvi-gen-2-1|2.1]]');
  });

  it('carries nothing where nothing stands in front of the reference', async () => {
    // What a field of its own hands over. The numbers fall to the books, which
    // no bare number answers, so there is nothing to offer at all.
    expect(await offered(asked('3'))).toEqual([]);
  });

  it('reads the passage a carried link points at', () => {
    expect(rows.carriedFrom(CARRIED, null)).toEqual({
      version: 'NVI',
      bookIndex: 1,
      book: 'GEN',
      chapter: 1,
    });
  });

  it('carries nothing from a line ending in no link', () => {
    expect(rows.carriedFrom('Veja ; ', null)).toBeNull();
  });
});
