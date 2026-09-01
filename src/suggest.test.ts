import { describe, expect, it } from 'vitest';

import { ReferenceSuggest } from './suggest';
import type { EditorPosition } from 'obsidian';
import type KingdoneChapelPlugin from './main';
import type { RefSuggestion } from './suggest';

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
