// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

import { chapter, chapterPath, harness } from '../test/harness';
import type { Harness } from '../test/harness';
import { ReferenceInputSuggest } from './suggest-input';
import type { RefSuggestion, Row } from './suggest-rows';

const vault = {
  ...chapter('NVI', 43, 'JHN', 14, [
    'Não se turbe o coração de vocês',
    'Na casa de meu Pai há muitos aposentos',
  ]),
};

let world: Harness;

/** The field as the modal puts one on the page, and what picking a row said. */
function field(file: TFile | null = null) {
  const input = document.createElement('input');
  const chosen: RefSuggestion[] = [];
  const suggest = new ReferenceInputSuggest(
    world.app,
    world.plugin,
    input,
    file,
    (item) => chosen.push(item),
  );
  return { input, suggest, chosen };
}

/** What a row would write, for the rows that write anything. */
function written(rows: Row[]): string[] {
  return rows
    .filter((row): row is RefSuggestion => 'markdown' in row)
    .map((row) => row.markdown);
}

beforeEach(() => {
  world = harness(vault, { language: 'pt' });
});

describe('the reference popup on a field', () => {
  it('offers the rows the query reads as', async () => {
    const { suggest } = field();
    expect(written(await suggest.getSuggestions('Jo 14.1'))).toContain(
      '[[NVI-43-JHN-014#^nvi-jhn-14-1|João 14.1]]',
    );
  });

  it('refuses a passage asked for embedded, and says why', async () => {
    const { suggest } = field();
    const rows = await suggest.getSuggestions('!Jo 14.1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty('hint');
    expect(written(rows)).toEqual([]);
  });

  it('offers nothing at all until something is typed', async () => {
    const { suggest } = field();
    expect(await suggest.getSuggestions('')).toEqual([]);
    expect(await suggest.getSuggestions('   ')).toEqual([]);
  });

  it('asks the rows for the note it writes into, with no line in front', async () => {
    // A bare number in the editor may be a chapter of the book the line before
    // it named. A field has no line before it, which is what the empty `before`
    // says: the numbers fall to the books and to the note itself.
    const file = world.vault.getAbstractFileByPath(
      chapterPath('NVI', 43, 'JHN', 14),
    ) as TFile;
    expect(file).not.toBeNull();
    const { suggest } = field(file);
    const asked = vi.spyOn(suggest.rows, 'getSuggestions');
    await suggest.getSuggestions('14');

    expect(asked).toHaveBeenCalledWith({ query: '14', file, before: '' });
  });

  it('hands the row picked over, and closes on it', () => {
    const { suggest, chosen } = field();
    const closed = vi.spyOn(suggest, 'close');
    const row: RefSuggestion = {
      ref: 'João 14.1 - NVI',
      book: 'João',
      preview: 'Não se turbe',
      markdown: '[[NVI-43-JHN-014#^nvi-jhn-14-1|João 14.1]]',
    };
    suggest.selectSuggestion(row, new MouseEvent('click'));

    expect(chosen).toEqual([row]);
    expect(closed).toHaveBeenCalled();
  });

  it('takes nothing from a hint, which says why there is nothing', () => {
    const { suggest, chosen } = field();
    const closed = vi.spyOn(suggest, 'close');
    suggest.selectSuggestion({ hint: 'no such book' }, new MouseEvent('click'));

    expect(chosen).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
  });

  it('draws a row the way the editor popup draws it', () => {
    const { suggest } = field();
    const el = document.createElement('div');
    suggest.renderSuggestion(
      {
        ref: 'João 14.1 - NVI',
        book: 'João',
        preview: 'Não se turbe',
        markdown: '[[NVI-43-JHN-014#^nvi-jhn-14-1|João 14.1]]',
      },
      el,
    );

    expect(el.querySelector('.kcp-suggest-ref')?.textContent).toBe(
      'João 14.1 - NVI',
    );
    expect(el.querySelector('.kcp-preview')?.textContent).toBe('Não se turbe');
  });
});
