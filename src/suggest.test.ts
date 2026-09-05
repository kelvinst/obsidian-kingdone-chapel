// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Editor,
  EditorPosition,
  EditorSuggestContext,
  TFile,
} from 'obsidian';

import { FakeEditor, chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { ReferenceSuggest } from './suggest';
import type { RefSuggestion } from './suggest';
import type { ChapterTarget, KingdoneChapelSettings } from './types';
import type KingdoneChapelPlugin from './main';

const vault = {
  ...chapter('NVI', 1, 'GEN', 1, [
    'No princípio, Deus criou os céus e a terra.',
    'Era a terra sem forma e vazia.',
    'Disse Deus: "Haja luz".',
  ]),
  ...chapter('NVI', 43, 'JHN', 1, ['No princípio era o Verbo.']),
  'Bibles/NVI/NVI-01-Gênesis.md': 'Os capítulos de Gênesis.',
  ...chapter('NTLH', 1, 'GEN', 1, ['No começo Deus criou o céu e a terra.']),
  ...chapter('NVT', 1, 'GEN', 1, ['No princípio, Deus criou os céus.']),
};

let world: Harness;
let suggest: ReferenceSuggest;

/** The popup's own view of a query, which is all `getSuggestions` reads. */
function context(query: string, file: TFile | null = null) {
  return {
    query,
    file,
    editor: new FakeEditor('') as unknown as Editor,
    start: { line: 0, ch: 0 },
    end: { line: 0, ch: query.length },
  } as unknown as EditorSuggestContext;
}

/**
 * The rows a query offers as links. A hint is a row that says why a query
 * found nothing rather than something to insert, so it is not one of these —
 * `hinted` below is what reads that kind.
 */
async function offered(
  ctx: EditorSuggestContext,
  from: ReferenceSuggest = suggest,
): Promise<RefSuggestion[]> {
  const rows = await from.getSuggestions(ctx);
  return rows.filter((row): row is RefSuggestion => !('hint' in row));
}

/** What a query said about itself, where it had nothing to offer. */
async function hinted(
  ctx: EditorSuggestContext,
  from: ReferenceSuggest = suggest,
): Promise<string[]> {
  const rows = await from.getSuggestions(ctx);
  return rows.flatMap((row) => ('hint' in row ? [row.hint] : []));
}

/** A line, with the cursor at its end — which is where typing leaves it. */
function typed(line: string) {
  const editor = new FakeEditor(line);
  return { editor, cursor: editor.at(0) };
}

/**
 * The popup's view of a bookless query typed after a link and a semicolon —
 * `[[...]]; @3.1` — which is what a carried reference is written as. `start`
 * sits on the `@`, where `onTrigger` puts it, so the line behind it is the
 * reference the book is carried on from.
 */
function carried(line: string, query: string, file: TFile | null = null) {
  const at = line.lastIndexOf('@');
  return {
    query,
    file,
    editor: new FakeEditor(line) as unknown as Editor,
    start: { line: 0, ch: at },
    end: { line: 0, ch: line.length },
  } as unknown as EditorSuggestContext;
}

beforeEach(() => {
  world = harness(vault, { language: 'pt', defaultVersion: 'NVI' });
  suggest = new ReferenceSuggest(world.plugin);
});

/** A row, filled in around the markdown that is the point of the test. */
const row = (markdown: string): RefSuggestion => ({
  ref: 'Sl 1.1',
  book: 'Salmos',
  preview: '',
  markdown,
});

/** What the editor was asked to do, which is what the popup is judged by. */
interface Written {
  replaced?: [string, EditorPosition, EditorPosition];
  cursor?: EditorPosition;
  selection?: [EditorPosition, EditorPosition];
}

/**
 * A popup with a row already picked and a note to write it into, standing
 * where `@Sl 1.1` was typed: at the fifth character of the second line, the
 * `@` included, which is what the popup replaces.
 */
function popup(): { suggest: ReferenceSuggest; written: Written } {
  const written: Written = {};
  const suggest = new ReferenceSuggest({
    app: {},
  } as unknown as KingdoneChapelPlugin);
  suggest.context = {
    start: { line: 1, ch: 5 },
    end: { line: 1, ch: 12 },
    editor: {
      replaceRange: (
        text: string,
        from: EditorPosition,
        to: EditorPosition,
      ) => {
        written.replaced = [text, from, to];
      },
      setCursor: (pos: EditorPosition) => {
        written.cursor = pos;
      },
      setSelection: (from: EditorPosition, to: EditorPosition) => {
        written.selection = [from, to];
      },
    },
  } as unknown as ReferenceSuggest['context'];
  return { suggest, written };
}

/** A key press, as much of one as the popup ever reads. */
const press = (key: string) => ({ key }) as unknown as KeyboardEvent;

const LINK = '[[ARA-19-Salmos-001#^ara-psa-1-1|Sl 1.1]]';
const RUN = `${LINK},[[ARA-19-Salmos-001#^ara-psa-1-2|2]]`;
const EMBED =
  '![[ARA-19-Salmos-001#^ara-psa-1-1]]\n![[ARA-19-Salmos-001#^ara-psa-1-2]]';

describe('selectSuggestion', () => {
  it('writes the row over what was typed', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(LINK), press('Enter'));
    expect(written.replaced).toEqual([
      LINK,
      { line: 1, ch: 5 },
      { line: 1, ch: 12 },
    ]);
  });

  it('leaves the cursor after the link it wrote', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(LINK), press('Enter'));
    expect(written.cursor).toEqual({ line: 1, ch: 5 + LINK.length });
    expect(written.selection).toBeUndefined();
  });

  it('leaves the cursor at the end of the last line of an embed', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(EMBED), press('Enter'));
    expect(written.cursor).toEqual({ line: 2, ch: 35 });
  });

  it('selects the label when the row was taken with Tab', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(LINK), press('Tab'));
    // The label is the last six characters inside the brackets.
    expect(written.selection).toEqual([
      { line: 1, ch: 5 + LINK.length - 8 },
      { line: 1, ch: 5 + LINK.length - 2 },
    ]);
    expect(written.cursor).toBeUndefined();
  });

  it('selects the first label of a run of verses', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(RUN), press('Tab'));
    expect(written.selection).toEqual([
      { line: 1, ch: 5 + LINK.length - 8 },
      { line: 1, ch: 5 + LINK.length - 2 },
    ]);
  });

  it('lands the cursor on Tab when the row wrote no label', () => {
    const { suggest, written } = popup();
    suggest.selectSuggestion(row(EMBED), press('Tab'));
    expect(written.selection).toBeUndefined();
    expect(written.cursor).toEqual({ line: 2, ch: 35 });
  });

  it('writes nothing when the popup has no context left', () => {
    const { suggest, written } = popup();
    suggest.context = null;
    suggest.selectSuggestion(row(LINK), press('Tab'));
    expect(written).toEqual({});
  });
});

describe('the Tab key', () => {
  /** The handler the popup registered Tab under. */
  const tab = (suggest: ReferenceSuggest) => {
    const found = (
      suggest as unknown as {
        registered: {
          key: string;
          handler: (evt: KeyboardEvent) => boolean | void;
        }[];
      }
    ).registered.find((r) => r.key === 'Tab');
    if (!found) throw new Error('Tab was never registered');
    return found.handler;
  };

  /** A popup whose rows answer the way the app's do. */
  const withRows = (took: boolean) => {
    const { suggest } = popup();
    const calls: KeyboardEvent[] = [];
    (suggest as unknown as { suggestions: unknown }).suggestions = {
      useSelectedItem: (evt: KeyboardEvent) => {
        calls.push(evt);
        return took;
      },
    };
    return { suggest, calls };
  };

  it('takes the highlighted row and keeps the key from indenting', () => {
    const { suggest, calls } = withRows(true);
    const evt = press('Tab');
    expect(tab(suggest)(evt)).toBe(false);
    expect(calls).toEqual([evt]);
  });

  it('leaves the key alone when no row was highlighted', () => {
    const { suggest } = withRows(false);
    expect(tab(suggest)(press('Tab'))).toBeUndefined();
  });

  it('leaves the key alone while a word is being composed', () => {
    const { suggest, calls } = withRows(true);
    const evt = { key: 'Tab', isComposing: true } as unknown as KeyboardEvent;
    expect(tab(suggest)(evt)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('leaves the key alone when the popup has no rows at all', () => {
    const { suggest } = popup();
    expect(tab(suggest)(press('Tab'))).toBeUndefined();
  });
});

describe('onTrigger', () => {
  it('opens on an `@` starting a word', () => {
    const { editor, cursor } = typed('Veja @Gn 1.1');
    expect(suggest.onTrigger(cursor, editor as unknown as Editor)).toEqual({
      start: { line: 0, ch: 5 },
      end: cursor,
      query: 'Gn 1.1',
    });
  });

  it('opens on an `@` opening the line', () => {
    const { editor, cursor } = typed('@Gn 1');
    expect(
      suggest.onTrigger(cursor, editor as unknown as Editor),
    ).toMatchObject({ start: { line: 0, ch: 0 }, query: 'Gn 1' });
  });

  it('keeps the `!` of an embed, and takes it back with the query', () => {
    const { editor, cursor } = typed('Que texto!@Gn 1');
    expect(
      suggest.onTrigger(cursor, editor as unknown as Editor),
    ).toMatchObject({ start: { line: 0, ch: 9 }, query: '!Gn 1' });
  });

  it('stays shut for the `@` of an email address', () => {
    const { editor, cursor } = typed('kelvin@example.com');
    expect(suggest.onTrigger(cursor, editor as unknown as Editor)).toBeNull();
  });

  it('stays shut until something is written after the `@`', () => {
    const { editor, cursor } = typed('Veja @');
    expect(suggest.onTrigger(cursor, editor as unknown as Editor)).toBeNull();
    const spaced = typed('Veja @   ');
    expect(
      suggest.onTrigger(spaced.cursor, spaced.editor as unknown as Editor),
    ).toBeNull();
  });

  it('reads the line only as far as the cursor', () => {
    const editor = new FakeEditor('Veja @Gn 1 e mais');
    const info = suggest.onTrigger(
      editor.at(0, 10),
      editor as unknown as Editor,
    );
    expect(info?.query).toBe('Gn 1');
  });

  it('says what a reference may carry, under the rows', () => {
    expect(suggest.instructions.map((i) => i.command)).toEqual([
      'Jo 1',
      '.1',
      ',2-4',
      '-nvi',
      ';@3.1',
      '!@',
      '↵',
      '⇥',
    ]);
  });
});

describe('getSuggestions', () => {
  it('offers the abbreviation that was typed, then the name spelled out', async () => {
    const rows = await offered(context('Gn 1.1'));
    expect(rows.map((r) => r.ref)).toEqual(['Gn 1.1', 'Gênesis 1.1']);
    // The chip beside an abbreviation spells the whole reference out, not
    // only the book: `Gn 1.1` says as little about the passage as the book.
    expect(rows[0].book).toBe('Gênesis 1.1');
    expect(rows[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-1|Gn 1.1]]');
  });

  it('offers one row where the name is what was written', async () => {
    const rows = await offered(context('Gênesis 1'));
    expect(rows.map((r) => r.ref)).toEqual(['Gênesis 1']);
  });

  it('shows the opening verse of the passage', async () => {
    const [row] = await offered(context('Gn 1.2'));
    expect(row.preview).toBe('Era a terra sem forma e vazia.');
  });

  it('writes a run of verses as one link, to a quote of the passage', async () => {
    const [row] = await offered(context('Gn 1.1-2'));
    expect(row.ref).toBe('Gn 1.1,2');
    expect(row.markdown).toBe('[[#^nvi-gen-1-1-2|Gn 1.1,2]]');
    // The verse-by-verse references are not lost: they are the embeds the
    // quote the link points at is made of.
    expect(row.passage).toEqual({
      id: 'nvi-gen-1-1-2',
      callout: [
        '> [!quote]+ Gênesis 1.1,2 - NVI',
        '> ![[NVI-01-GEN-001#^nvi-gen-1-1]]',
        '> ![[NVI-01-GEN-001#^nvi-gen-1-2]] ^nvi-gen-1-1-2',
      ].join('\n'),
    });
  });

  it('names the version in the label only when it was asked for', async () => {
    const plain = await offered(context('Gn 1'));
    expect(plain[0].ref).toBe('Gn 1');
    const named = await offered(context('NVI Gn 1'));
    expect(named[0].ref).toBe('Gn 1 - NVI');
  });

  it('names the version in a passage label too, when it was asked for', async () => {
    const [row] = await offered(context('NVI Gn 1.1-2'));
    expect(row.ref).toBe('Gn 1.1,2 - NVI');
    expect(row.markdown).toBe('[[#^nvi-gen-1-1-2|Gn 1.1,2 - NVI]]');
  });

  it('splits the popup between the versions a half-written one reaches', async () => {
    const rows = await offered(context('Gn 1 -nv'));
    expect(rows.map((r) => r.ref)).toEqual([
      'Gn 1 - NVI',
      'Gênesis 1 - NVI',
      'Gn 1 - NVT',
      'Gênesis 1 - NVT',
    ]);
  });

  it('offers nothing for a query that is not a reference', async () => {
    expect(await offered(context('-nvi'))).toEqual([]);
  });

  it('offers nothing when the vault holds no version at all', async () => {
    const empty = harness();
    const bare = new ReferenceSuggest(empty.plugin);
    expect(await offered(context('Gn 1'), bare)).toEqual([]);
  });

  it('leaves out a book the version does not carry', async () => {
    const rows = await offered(context('Ap 1'));
    expect(rows).toEqual([]);
  });

  it('leaves out a book whose file has gone away since it was indexed', async () => {
    world.plugin.index();
    world.vault.contents.delete(chapterPath('NVI', 1, 'GEN', 1));
    expect(await offered(context('Gn 1'))).toEqual([]);
  });

  it('writes the link from the note it is being typed in', async () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 43, 'JHN', 1),
    ) as TFile;
    const linktext = vi.spyOn(world.metadataCache, 'fileToLinktext');
    await offered(context('Gn 1.1', from));
    expect(linktext).toHaveBeenCalledWith(expect.anything(), from.path, true);
  });

  it('stops at a popup nobody would scroll to the end of', async () => {
    const crowded: Record<string, string> = {};
    for (const version of ['V1', 'V2', 'V3', 'V4', 'V5']) {
      Object.assign(
        crowded,
        chapter(version, 43, 'JHN', 1, ['No princípio era o Verbo.']),
        chapter(version, 18, 'JOB', 1, ['Havia um homem na terra de Uz.']),
      );
    }
    const many = harness(crowded, { language: 'pt' });
    const rows = await offered(
      context('Jo 1 -'),
      new ReferenceSuggest(many.plugin),
    );
    expect(rows).toHaveLength(12);
  });
});

describe('an embed', () => {
  it('offers the whole file, and then a verse at a time', async () => {
    const rows = await offered(context('!Gn 1'));
    expect(rows.map((r) => r.note)).toEqual(['whole file', 'verse by verse']);
    expect(rows[0].markdown).toBe('![[NVI-01-GEN-001]]');
    expect(rows[1].markdown).toBe(
      '![[NVI-01-GEN-001#^nvi-gen-1-1]]\n' +
        '![[NVI-01-GEN-001#^nvi-gen-1-2]]\n' +
        '![[NVI-01-GEN-001#^nvi-gen-1-3]]',
    );
  });

  it('names the passage rather than writing a label of its own', async () => {
    const [row] = await offered(context('!Gn 1'));
    expect(row.ref).toBe('Gênesis 1');
    expect(row.markdown).not.toContain('|');
  });

  it('offers the one row for the verses that were asked for', async () => {
    const rows = await offered(context('!Gn 1.1,2'));
    expect(rows.map((r) => r.markdown)).toEqual([
      '![[NVI-01-GEN-001#^nvi-gen-1-1]]\n![[NVI-01-GEN-001#^nvi-gen-1-2]]',
    ]);
  });

  it('embeds the note listing a book when no chapter was named', async () => {
    const rows = await offered(context('!Gn'));
    expect(rows.map((r) => r.markdown)).toEqual(['![[NVI-01-Gênesis]]']);
    expect(rows[0].preview).toBe('');
  });

  it('names the version in the row where it was asked for', async () => {
    const rows = await offered(context('!Gn 1 -nvi'));
    expect(rows[0].ref).toBe('Gênesis 1 - NVI');
  });

  it('embeds from the note it is being typed in', async () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 43, 'JHN', 1),
    ) as TFile;
    const linktext = vi.spyOn(world.metadataCache, 'fileToLinktext');
    await offered(context('!Gn 1', from));
    expect(linktext).toHaveBeenCalledWith(expect.anything(), from.path, true);
  });

  it('leaves the verse-by-verse row off a file carrying no anchors', async () => {
    world.vault.write(chapterPath('NVI', 1, 'GEN', 1), '1. Sem âncoras');
    const rows = await offered(context('!Gn 1'));
    expect(rows.map((r) => r.note)).toEqual(['whole file']);
  });
});

describe('a version no link may point at', () => {
  /** The same vault, with a partial version beside the translations. */
  function partial() {
    const w = harness({
      ...vault,
      'Notas/Kelvin/Kelvin.md': '',
      'Notas/Kelvin/Kelvin-01-GEN-001.md': '1. O que eu penso ^kelvin-gen-1-1',
    });
    w.metadataCache.frontmatter.set('Notas/Kelvin/Kelvin.md', {
      bible: true,
      complete: false,
    });
    return new ReferenceSuggest(w.plugin);
  }

  it('is not reached for by a half-written version name', () => {
    expect(
      partial().versionsFor({ version: 'k', versionPrefix: true }, null),
    ).toEqual([]);
  });

  it('is not reached for by its own name written in full', () => {
    expect(
      partial().versionsFor({ version: 'kelvin', versionPrefix: false }, null),
    ).toEqual([]);
  });

  it('offers no row for a reference that names it', async () => {
    expect(await offered(context('Gn 1 -kelvin'), partial())).toEqual([]);
  });
});

describe('versionsFor', () => {
  it('reaches for every version a half-written name begins', () => {
    expect(
      suggest.versionsFor(
        {
          version: 'n',
          versionPrefix: true,
        },
        null,
      ),
    ).toEqual(['NTLH', 'NVI', 'NVT']);
  });

  it('reaches for all of them when the name is only a dash', () => {
    expect(
      suggest.versionsFor(
        {
          version: '',
          versionPrefix: true,
        },
        null,
      ),
    ).toEqual(['NTLH', 'NVI', 'NVT']);
  });

  it('takes a version written in full as the only one meant', () => {
    expect(
      suggest.versionsFor(
        {
          version: 'ntlh',
          versionPrefix: false,
        },
        null,
      ),
    ).toEqual(['NTLH']);
  });

  it('falls back to the default where the query names none', () => {
    expect(
      suggest.versionsFor(
        {
          version: null,
          versionPrefix: false,
        },
        null,
      ),
    ).toEqual(['NVI']);
  });

  it('reaches for nothing where the version named is not one', () => {
    expect(
      suggest.versionsFor(
        {
          version: 'vulgata',
          versionPrefix: false,
        },
        null,
      ),
    ).toEqual([]);
  });
});

describe('forms', () => {
  it('offers the abbreviation and the name it stands for', () => {
    const match = { book: { index: 1 }, lang: 'pt', rank: 0, abbr: 'gn' };
    expect(suggest.forms(match as never, 'Gênesis')).toEqual(['Gn', 'Gênesis']);
  });

  it('offers the name alone where the two read the same', () => {
    const match = { book: { index: 1 }, lang: 'pt', rank: 0, abbr: 'gênesis' };
    expect(suggest.forms(match as never, 'Gênesis')).toEqual(['Gênesis']);
  });

  it('offers the name alone where the query was the name', () => {
    const match = { book: { index: 1 }, lang: 'pt', rank: 2, abbr: null };
    expect(suggest.forms(match as never, 'Gênesis')).toEqual(['Gênesis']);
  });
});

describe('a reference naming no chapter', () => {
  it('links the note listing the book’s chapters', async () => {
    const rows = await offered(context('Gênesis'));
    expect(rows[0]).toMatchObject({
      ref: 'Gênesis',
      preview: '',
      markdown: '[[NVI-01-Gênesis|Gênesis]]',
    });
  });

  it('embeds that note whole', async () => {
    const rows = await offered(context('!Gênesis'));
    expect(rows[0].markdown).toBe('![[NVI-01-Gênesis]]');
  });

  it('falls back to the opening chapter where there is no such note', async () => {
    const rows = await offered(context('João'));
    expect(rows[0].markdown).toBe('[[NVI-43-JHN-001|João]]');
  });

  it('offers nothing for a book the version does not carry', async () => {
    expect(await offered(context('Levítico'))).toEqual([]);
  });
});

describe('a chapter the version has yet to write', () => {
  it('links it by name, with no anchor and no preview', async () => {
    const rows = await offered(context('Gn 40.2'));
    expect(rows[0]).toMatchObject({
      ref: 'Gn 40.2',
      preview: '',
      markdown: '[[NVI-01-GEN-040|Gn 40.2]]',
    });
  });

  it('embeds it by name too', async () => {
    const rows = await offered(context('!Gn 40.2'));
    expect(rows[0].markdown).toBe('![[NVI-01-GEN-040]]');
  });

  it('has no verses to offer it one at a time, so embeds it whole', async () => {
    const rows = await offered(context('!Gn 40'));
    expect(rows.map((r) => r.note)).toEqual(['whole file']);
    expect(rows[0].markdown).toBe('![[NVI-01-GEN-040]]');
  });
});

describe('embedLines', () => {
  let target: ChapterTarget;

  beforeEach(() => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    target = { chapter: 1, file, path: file.path };
  });

  it('writes one embed per anchor', () => {
    expect(suggest.embedLines(target, ['a', 'b'], null)).toBe(
      '![[NVI-01-GEN-001#^a]]\n![[NVI-01-GEN-001#^b]]',
    );
  });

  it('writes a merged run of verses once', () => {
    expect(suggest.embedLines(target, ['a', 'a'], null)).toBe(
      '![[NVI-01-GEN-001#^a]]',
    );
  });

  it('embeds the file itself where there are no anchors at all', () => {
    expect(suggest.embedLines(target, [], null)).toBe('![[NVI-01-GEN-001]]');
    expect(suggest.embedLines(target, [null, null], null)).toBe(
      '![[NVI-01-GEN-001]]',
    );
  });
});

describe('linktext', () => {
  it('shortens a file the vault knows as far as it goes', () => {
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
    expect(suggest.linktext({ chapter: 1, file, path: file.path }, null)).toBe(
      'NVI-01-GEN-001',
    );
  });

  it('writes a chapter with no file yet by the name it would go under', () => {
    expect(
      suggest.linktext(
        { chapter: 40, file: null, path: 'NVI-01-GEN-040' },
        null,
      ),
    ).toBe('NVI-01-GEN-040');
  });
});

describe('previewOf', () => {
  let file: TFile;

  beforeEach(() => {
    file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 1, 'GEN', 1),
    ) as TFile;
  });

  it('shows nothing for a reference naming no chapter', async () => {
    expect(await suggest.previewOf(file, null, [])).toBe('');
  });

  it('shows the first verse asked for', async () => {
    expect(await suggest.previewOf(file, 1, [3])).toBe(
      'Disse Deus: "Haja luz".',
    );
  });

  it('shows the opening verse where none was asked for', async () => {
    expect(await suggest.previewOf(file, 1, [])).toBe(
      'No princípio, Deus criou os céus e a terra.',
    );
  });

  it('shows the words of a verse that hangs an aside off itself', async () => {
    world.vault.write(
      chapterPath('NVI', 1, 'GEN', 1),
      'No princípio ,,**Refs**:\n[[NVI-43-JHN-001#^nvi-jhn-1-1|Jo 1.1]].,, ^nvi-gen-1-1',
    );
    expect(await suggest.previewOf(file, 1, [])).toBe('No princípio');
  });

  it('shows nothing for a file holding no verses', async () => {
    world.vault.write(chapterPath('NVI', 1, 'GEN', 1), 'Sem versículos');
    expect(await suggest.previewOf(file, 1, [])).toBe('');
  });
});

describe('renderSuggestion', () => {
  function render(
    item: Partial<Parameters<ReferenceSuggest['renderSuggestion']>[0]>,
  ) {
    const el = document.createElement('div');
    suggest.renderSuggestion(
      { ref: '', book: '', preview: '', markdown: '', ...item },
      el,
    );
    return el;
  }

  it('names the book an abbreviation hides', () => {
    const el = render({ ref: 'Gn 1.1', book: 'Gênesis' });
    expect(el.querySelector('.kcp-suggest-book')?.textContent).toBe('Gênesis');
  });

  it('leaves the book off a row that already says it', () => {
    const el = render({ ref: 'Gênesis 1.1', book: 'Gênesis' });
    expect(el.querySelector('.kcp-suggest-book')).toBeNull();
  });

  it('tells two rows for the same chapter apart', () => {
    const el = render({ ref: 'Gn 1', book: 'Gênesis', note: 'whole file' });
    expect(el.querySelector('.kcp-suggest-note')?.textContent).toBe(
      'whole file',
    );
  });

  it('shows the opening verse under the reference', () => {
    const el = render({
      ref: 'Gn 1',
      book: 'Gênesis',
      preview: 'No princípio',
    });
    expect(el.querySelector('.kcp-preview')?.textContent).toBe('No princípio');
  });

  it('leaves the preview off a row with nothing to show', () => {
    expect(render({ ref: 'Gn' }).querySelector('.kcp-preview')).toBeNull();
  });
});

describe('a reference carried on after a semicolon', () => {
  /** `Gn 1.1` linked, then a semicolon, then the numbers alone. */
  const after = (numbers: string) =>
    `Veja [[NVI-01-GEN-001#^nvi-gen-1-1|Gn 1.1]]; @${numbers}`;

  /** A vault with a second chapter, for the references that name one. */
  function twoChapters() {
    const world = harness(
      {
        ...chapter('NVI', 1, 'GEN', 1, ['No princípio', 'Era a terra']),
        ...chapter('NVI', 1, 'GEN', 2, ['Assim foram concluídos os céus']),
      },
      { language: 'pt', defaultVersion: 'NVI' },
    );
    return { world, suggest: new ReferenceSuggest(world.plugin) };
  }

  it('counts a bare number as a verse of the chapter carried from', async () => {
    const rows = await offered(carried(after('3'), '3'));
    expect(rows.map((r) => r.ref)).toEqual(['3', 'Gênesis 1.3']);
    expect(rows[0].markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-3|3]]');
    expect(rows[0].book).toBe('Gênesis');
    expect(rows[0].preview).toBe('Disse Deus: "Haja luz".');
  });

  it('takes the chapter from the reference when it names one', async () => {
    const { suggest } = twoChapters();
    const rows = await offered(carried(after('2.1'), '2.1'), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['2.1', 'Gênesis 2.1']);
    expect(rows[0].markdown).toBe('[[NVI-01-GEN-002#^nvi-gen-2-1|2.1]]');
  });

  it('carries a run of verses as one link, to a quote of the passage', async () => {
    const rows = await offered(carried(after('1-2'), '1-2'));
    expect(rows[0].ref).toBe('1,2');
    // The same id the spelled-out reference writes, so a carried run finds the
    // quote that is already there rather than writing a second one.
    expect(rows[0].markdown).toBe('[[#^nvi-gen-1-1-2|1,2]]');
    expect(rows[0].passage?.id).toBe('nvi-gen-1-1-2');
  });

  it('names the chapter alone where the reference gave no verse', async () => {
    const { suggest } = twoChapters();
    const rows = await offered(carried(after('2.'), '2.'), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['2', 'Gênesis 2']);
  });

  it('embeds the carried passage', async () => {
    const rows = await offered(carried(after('!3'), '!3'));
    expect(rows[0].markdown).toBe('![[NVI-01-GEN-001#^nvi-gen-1-3]]');
    expect(rows[0].ref).toBe('Gênesis 1.3');
  });

  it('resolves the link from the note it is being written in', async () => {
    const from = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 43, 'JHN', 1),
    ) as TFile;
    const place = vi.spyOn(world.metadataCache, 'getFirstLinkpathDest');
    await offered(carried(after('3'), '3', from));
    expect(place).toHaveBeenCalledWith('NVI-01-GEN-001', from.path);
  });

  it('carries nothing where no link comes before the semicolon', async () => {
    expect(await offered(carried('Veja ; @2', '2'))).toEqual([]);
  });

  it('carries nothing from a link to something that is no chapter', async () => {
    const line = 'Veja [[NVI-01-Gênesis]]; @2';
    expect(await offered(carried(line, '2'))).toEqual([]);
  });

  it('carries nothing from a link the vault cannot place', async () => {
    const line = 'Veja [[Não existe]]; @2';
    expect(await offered(carried(line, '2'))).toEqual([]);
  });

  it('carries nothing from a version the vault does not hold', async () => {
    const line = 'Veja [[ACF-01-GEN-001]]; @2';
    world.vault.write('Outros/ACF-01-GEN-001.md', '1. No princípio ^a');
    expect(await offered(carried(line, '2'))).toEqual([]);
  });

  it('carries nothing from a note that only reads like a chapter', async () => {
    // Outside the Bible folder, so the index never took it — which is the one
    // thing that tells a chapter from a note named to look like one.
    world.vault.write('Estudos/NVI-01-GEN-009.md', 'Uma nota.');
    const line = 'Veja [[Estudos/NVI-01-GEN-009]]; @2';
    expect(await offered(carried(line, '2'))).toEqual([]);
  });

  it('leaves a bare verse to the books where the book is one file', async () => {
    const mens = harness(
      { 'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^mens-gen-0-1' },
      { language: 'pt', defaultVersion: 'MENS' },
    );
    const suggest = new ReferenceSuggest(mens.plugin);
    const line = 'Veja [[MENS-01-GEN-000]]; @2';
    expect(await offered(carried(line, '2'), suggest)).toEqual([]);
  });

  it('carries nothing where the version has no such chapter', async () => {
    const rows = await offered(carried(after('40.1'), '40.1'));
    expect(rows).toEqual([]);
  });

  it('leaves the passage out where the file has gone away', async () => {
    world.plugin.index();
    world.vault.contents.delete(chapterPath('NVI', 1, 'GEN', 1));
    expect(await offered(carried(after('3'), '3'))).toEqual([]);
  });
});

describe('a number read against the passage the note is about', () => {
  /**
   * A note that links one chapter, and the popup for a query typed in it. The
   * link is what the numbers are counted from — a note says which passage it
   * is about once, and goes on writing about it.
   */
  function about(
    target: string,
    files: Record<string, string> = vault,
    settings: Partial<KingdoneChapelSettings> = {},
  ) {
    const world = harness(files, {
      language: 'pt',
      defaultVersion: 'NVI',
      ...settings,
    });
    const from = world.vault.write('Estudos/Nota.md', 'Um estudo.');
    world.metadataCache.links.set(from.path, [target]);
    return { world, from, suggest: new ReferenceSuggest(world.plugin) };
  }

  /** A note about a partial version, which no link may point at. */
  function aboutPartial() {
    const made = about('Kelvin-01-GEN-001', {
      ...vault,
      'Notas/Kelvin/Kelvin.md': '',
      'Notas/Kelvin/Kelvin-01-GEN-001.md': '1. O que eu penso ^kelvin-gen-1-1',
    });
    made.world.metadataCache.frontmatter.set('Notas/Kelvin/Kelvin.md', {
      bible: true,
      code: 'Kelvin',
      complete: false,
    });
    made.world.plugin.invalidateIndex();
    return made;
  }

  it('writes into a linkable version where the note is about a partial one', async () => {
    const { from, suggest } = aboutPartial();

    const rows = await offered(context('2', from), suggest);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !r.markdown.includes('Kelvin'))).toBe(true);
  });

  it('names the version it fell back to, the note being about another', async () => {
    const { from, suggest } = aboutPartial();

    const rows = await offered(context('2', from), suggest);

    // The bare rows read back what was typed and name nothing; the ones that
    // spell the reference out say where it lands, which is not this note.
    expect(rows.map((r) => r.ref)).toEqual([
      '2',
      '2',
      'Gênesis 1.2 - NVI',
      'Gênesis 2 - NVI',
    ]);
  });

  it('leaves the version unsaid where it is the one the note is about', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');

    const rows = await offered(context('2', from), suggest);

    expect(rows.some((r) => r.ref.includes(' - '))).toBe(false);
  });

  it('offers the verse of the chapter, then the chapter of the book', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('2', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual([
      '2',
      '2',
      'Gênesis 1.2',
      'Gênesis 2',
    ]);
  });

  it('says beside each what the number was counted as', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const [verse, chapter] = await offered(context('2', from), suggest);
    expect(verse.book).toBe('Gênesis 1.2');
    expect(chapter.book).toBe('Gênesis 2');
  });

  it('writes the numbers back as the label they were typed as', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const [verse] = await offered(context('2', from), suggest);
    expect(verse.markdown).toBe('[[NVI-01-GEN-001#^nvi-gen-1-2|2]]');
  });

  it('reads a run both ways, and says each the short way', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('1-3', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual([
      '1,2,3',
      '1,2,3',
      'Gênesis 1.1,2,3',
      'Gênesis 1,2,3',
    ]);
    // The label spells every number, the way the links read once written;
    // the chip beside it closes the run up, the way it is said.
    expect(rows[0].book).toBe('Gênesis 1.1-3');
    expect(rows[1].book).toBe('Gênesis 1-3');
  });

  it('takes a chapter written in front of the numbers as its own', async () => {
    const { from, suggest } = about('NVI-01-GEN-001', {
      ...vault,
      ...chapter('NVI', 1, 'GEN', 2, ['Assim foram concluídos os céus.']),
    });
    const rows = await offered(context('2.1', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['2.1', 'Gênesis 2.1']);
    expect(rows[0].markdown).toBe('[[NVI-01-GEN-002#^nvi-gen-2-1|2.1]]');
  });

  it('links a verse of a chapter the version has yet to write', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('40.2', from), suggest);
    // No file to read, so no anchor to stop at and no verse to show — the
    // link lands on the name the chapter would be written under.
    expect(rows.map((r) => r.ref)).toEqual(['40.2', 'Gênesis 40.2']);
    expect(rows[0].markdown).toBe('[[NVI-01-GEN-040|40.2]]');
    expect(rows[0].preview).toBe('');
  });

  it('asks for the note own passage again when only a version is named', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('ntlh', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['NTLH', 'Gênesis 1 - NTLH']);
    expect(rows[0].markdown).toBe('[[NTLH-01-GEN-001|NTLH]]');
  });

  it('offers the passage in every version a half-written name reaches', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('1 -nv', from), suggest);
    expect(rows.map((r) => r.book)).toEqual([
      'Gênesis 1.1 - NVI',
      'Gênesis 1 - NVI',
      'Gênesis 1.1 - NVI',
      'Gênesis 1 - NVI',
      'Gênesis 1.1 - NVT',
      'Gênesis 1 - NVT',
      'Gênesis 1.1 - NVT',
      'Gênesis 1 - NVT',
    ]);
  });

  it('embeds the passage rather than labelling it', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('!1', from), suggest);
    expect(rows.map((r) => r.markdown)).toEqual([
      '![[NVI-01-GEN-001#^nvi-gen-1-1]]',
      '![[NVI-01-GEN-001]]',
      '![[NVI-01-GEN-001#^nvi-gen-1-1]]\n![[NVI-01-GEN-001#^nvi-gen-1-2]]' +
        '\n![[NVI-01-GEN-001#^nvi-gen-1-3]]',
    ]);
  });

  it('leaves the books to answer under the rows it offers', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    const rows = await offered(context('1', from), suggest);
    expect(rows.some((r) => r.ref === 'Gênesis 1')).toBe(true);
  });

  it('says so where the note holds no passage to read a number against', async () => {
    const bare = harness(vault, { language: 'pt', defaultVersion: 'NVI' });
    const from = bare.vault.write('Estudos/Solta.md', 'Sem links.');
    const alone = new ReferenceSuggest(bare.plugin);
    expect(await hinted(context('2', from), alone)).toEqual([
      'No link in this note to read a book from — write one',
    ]);
  });

  it('says so where the run reaches past what a reference may carry', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    expect(await hinted(context('1-99', from), suggest)).toEqual([
      'More verses than one reference can carry — ask for fewer',
    ]);
    expect(await offered(context('1-99', from), suggest)).toEqual([]);
  });

  it('says so where a run is too long to be chapters but not verses', async () => {
    const { from, suggest } = about('NVI-01-GEN-001');
    expect(await hinted(context('1-26', from), suggest)).toEqual([
      'More chapters than one reference can carry — read as verses',
    ]);
  });

  it('counts no verse against a book that opens with no chapter', async () => {
    const { from, suggest } = about(
      'MENS-01-GEN-000',
      {
        'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^mens-gen-0-1',
      },
      { defaultVersion: 'MENS' },
    );
    const rows = await offered(context('1', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['1', 'Gênesis 1']);
  });

  it('says nothing about verses where none were read', async () => {
    const { from, suggest } = about(
      'MENS-01-GEN-000',
      {
        'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^mens-gen-0-1',
      },
      { defaultVersion: 'MENS' },
    );
    expect(await hinted(context('1-26', from), suggest)).toEqual([]);
  });

  it('drops the verses where the file they sit in has gone away', async () => {
    const { world, from, suggest } = about('NVI-01-GEN-001');
    world.plugin.index();
    world.vault.contents.delete(chapterPath('NVI', 1, 'GEN', 1));
    // The chapter the note is about can no longer be read, so nothing is
    // counted in it — but the same number still names a chapter of the book.
    const rows = await offered(context('2', from), suggest);
    expect(rows.map((r) => r.book)).toEqual(['Gênesis 2', 'Gênesis 2']);
  });

  it('asks for the book itself where the note is about a whole book', async () => {
    const { from, suggest } = about(
      'MENS-01-GEN-000',
      { 'Bibles/MENS/MENS-01-GEN-000.md': '1. Todo o livro ^mens-gen-0-1' },
      { defaultVersion: 'MENS' },
    );
    // A chapter of 0 is the book's introduction, so naming a version alone
    // asks for the book, not for a chapter of it.
    const rows = await offered(context('mens', from), suggest);
    expect(rows.map((r) => r.ref)).toEqual(['MENS', 'Gênesis - MENS']);
  });

  it('offers nothing in a version that does not carry the book', async () => {
    const { from, suggest } = about('NVI-43-JHN-001');
    expect(await offered(context('ntlh', from), suggest)).toEqual([]);
  });

  it('writes no bare row where nothing was typed to label it', async () => {
    const { world, suggest } = about('NVI-01-GEN-001');
    const here = world.plugin.locationOf(
      world.vault.getAbstractFileByPath(
        chapterPath('NVI', 1, 'GEN', 1),
      ) as TFile,
      null,
    );
    if (!here) throw new Error('no passage to read against');
    const rows = await suggest.passageRows(
      here,
      [1],
      [],
      [],
      false,
      null,
      null,
    );
    expect(rows.bare).toBeNull();
    expect(rows.full.map((r) => r.ref)).toEqual(['Gênesis 1']);
  });

  it('stops reading versions once the popup has no room left', async () => {
    const crowded: Record<string, string> = {};
    for (const version of ['NVA', 'NVB', 'NVC', 'NVD']) {
      Object.assign(crowded, chapter(version, 1, 'GEN', 1, ['No princípio']));
    }
    const { from, suggest } = about('NVA-01-GEN-001', crowded, {
      defaultVersion: 'NVA',
    });
    // Four rows a version, and four versions the dash reaches: the popup
    // fills before the last of them, and the books are left no room at all.
    const rows = await offered(context('1 -nv', from), suggest);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.book.startsWith('Gênesis'))).toBe(true);
  });

  it('renders a hint as the word it is, with nothing to insert', () => {
    const el = document.createElement('div');
    suggest.renderSuggestion({ hint: 'Nada por aqui' }, el);
    expect(el.textContent).toBe('Nada por aqui');
    const editor = new FakeEditor('@2');
    suggest.selectSuggestion(
      { hint: 'Nada por aqui' },
      new MouseEvent('click'),
    );
    expect(editor.getLine(0)).toBe('@2');
  });
});

describe('appendPassage', () => {
  /** The quote a passage row carries, as `getSuggestions` builds it. */
  const passage = {
    id: 'nvi-gen-1-1-2',
    callout: [
      '> [!quote]+ Gênesis 1.1,2 - NVI',
      '> ![[NVI-01-GEN-001#^nvi-gen-1-1]]',
      '> ![[NVI-01-GEN-001#^nvi-gen-1-2]] ^nvi-gen-1-1-2',
    ].join('\n'),
  };

  it('files the quote under a heading of its own, at the foot of the note', () => {
    const editor = new FakeEditor('Veja [[#^nvi-gen-1-1-2|Gn 1.1,2]] aqui');
    const wrote = suggest.appendPassage(editor as unknown as Editor, passage);
    expect(editor.text).toBe(
      `Veja [[#^nvi-gen-1-1-2|Gn 1.1,2]] aqui\n\n## Citações\n\n${passage.callout}\n`,
    );
    // The line it was written at, and the lines it added there, which is what
    // moves the reference when the quote lands above it.
    expect(wrote).toEqual({ line: 0, lines: 7 });
  });

  it('leaves a passage already quoted as it is', () => {
    const editor = new FakeEditor(
      `Veja [[#^nvi-gen-1-1-2|Gn 1.1,2]]\n\n## Citações\n\n${passage.callout}\n`,
    );
    const before = editor.text;
    expect(suggest.appendPassage(editor as unknown as Editor, passage)).toBe(
      null,
    );
    expect(editor.text).toBe(before);
  });

  it('moves the reference down when the quote is written above it', () => {
    const editor = new FakeEditor(
      [
        '## Citações',
        '',
        '> [!quote]+ Gênesis 3.16 - NVI',
        '',
        '## Notas',
        '',
        'Veja aqui',
      ].join('\n'),
    );
    suggest.context = {
      start: { line: 6, ch: 5 },
      end: { line: 6, ch: 9 },
      editor: editor as unknown as Editor,
    } as unknown as ReferenceSuggest['context'];
    suggest.selectSuggestion(
      {
        ref: 'Gn 1.1,2',
        book: 'Gênesis',
        preview: '',
        markdown: '[[#^nvi-gen-1-1-2|Gn 1.1,2]]',
        passage,
      },
      press('Enter'),
    );
    // The quote went into the section it belongs to, which sits above the line
    // the reference was written on — four lines above where it started.
    expect(editor.lines.slice(2, 7)).toEqual([
      '> [!quote]+ Gênesis 3.16 - NVI',
      '',
      ...passage.callout.split('\n'),
    ]);
    // So the cursor is read off where that line ended up, not where it was.
    expect(editor.cursor).toEqual({ line: 10, ch: 33 });
  });
});
