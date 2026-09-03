// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { editorLivePreviewField } from 'obsidian';

import { LiveMarks, build, liveMarks } from './live';

/**
 * The parse `build` reads its blocks from.
 *
 * Obsidian's own editor already carries this — a plugin only ever reads the
 * tree, never builds one — so a test has to bring one of its own. GFM is
 * tables: without it a `|` row is only ever a line of prose to the grammar,
 * never cells of their own.
 */
const MD = markdown({ extensions: GFM });

/**
 * Every decoration a note asks for, as `what:text` — or `what@Ln` for the ones
 * that dress a whole line.
 *
 * The cursor starts where an editor puts it, at the top of the note, so a note
 * whose first line is plain is a note read with the cursor out of the way.
 */
function read(doc: string, cursor = 0): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [MD],
  });
  const set = build(state, [{ from: 0, to: doc.length }]);
  const out: string[] = [];
  set.between(0, doc.length, (from, to, value) => {
    const what = (value.spec.class as string | undefined) ?? 'hidden';
    const line = state.doc.lineAt(from).number;
    out.push(
      from === to ? `${what}@L${line}` : `${what}:${doc.slice(from, to)}`,
    );
  });
  return out;
}

/** A note whose first line keeps the cursor away from what is being read. */
function below(...lines: string[]): string {
  return ['Um verso.', '', ...lines].join('\n');
}

describe('build', () => {
  it('marks a run and hides its delimiters', () => {
    expect(read('Água é H~2~O.')).toEqual([
      'hidden:~',
      'kcp-sub:2',
      'hidden:~',
    ]);
  });

  it('marks each kind by its own class', () => {
    expect(read('x^2^ !!nota!!')).toEqual([
      'hidden:^',
      'kcp-sup:2',
      'hidden:^',
      'hidden:!!',
      'kcp-small:nota',
      'hidden:!!',
    ]);
  });

  it('gives the delimiters back when the cursor is in the run', () => {
    expect(read('Água é H~2~O.', 9)).toEqual(['kcp-sub:2']);
  });

  it('hides them again when the cursor is elsewhere on the line', () => {
    expect(read('Água é H~2~O.', 0)).toEqual([
      'hidden:~',
      'kcp-sub:2',
      'hidden:~',
    ]);
  });

  it('carries a run across a line break', () => {
    expect(read(below('!!Refs: Sl 26.4', 'Notas: n1!!'))).toEqual([
      'kcp-small-line@L3',
      'hidden:!!',
      'kcp-small:Refs: Sl 26.4\nNotas: n1',
      'hidden:!!',
      'kcp-small-line@L4',
    ]);
  });

  it('does not carry a run across a blank line', () => {
    expect(read(below('!!Refs: Sl 26.4', '', 'Notas: n1!!'))).toEqual([]);
  });

  it('does not carry a run from one list item into the next', () => {
    expect(read(below('- !!nota um', '- nota dois!!'))).toEqual([]);
  });

  it('carries a run across the lines of one quote', () => {
    expect(read(below('> !!Refs: Sl 26.4', '> Notas: n1!!'))).toEqual([
      'hidden:!!',
      'kcp-small:Refs: Sl 26.4\n> Notas: n1',
      'hidden:!!',
      // The quote's own marker is inside the run, the note having written it
      // between the delimiters, so the line it opens takes the size with it.
      'kcp-small-line@L4',
    ]);
  });

  it('does not carry a run from a paragraph into the quote under it', () => {
    expect(read(below('Um verso !!a', '> b!! citado'))).toEqual([]);
  });

  it('carries a run on into the line a quote is finished on', () => {
    expect(read(below('> !!Refs: Sl 26.4', 'Notas: n1!!'))).toEqual([
      'hidden:!!',
      'kcp-small:Refs: Sl 26.4\nNotas: n1',
      'hidden:!!',
      'kcp-small-line@L4',
    ]);
  });

  it('does not carry a run across a quote of its own', () => {
    expect(read(below('> !!Refs: Sl 26.4', '>', '> Notas: n1!!'))).toEqual([]);
  });

  it('does not carry a run from one table cell into the next', () => {
    expect(read(below('| !!a | b!! |', '|---|---|'))).toEqual([]);
  });

  it('reads a run written inside one cell', () => {
    expect(read(below('| !!uma nota!! | outra |', '|---|---|'))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('reads the last cell of a row written without its closing pipe', () => {
    expect(read(below('| outra | !!uma nota!!', '|---|---|'))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('reads one run out of a row an escaped pipe stops from being a table', () => {
    // A pipe the grammar counts before it ever tries to parse the delimiter
    // row: an escaped one throws that count off, so this is one paragraph
    // rather than two cells — and, with no cell to end it, one run.
    expect(read(below('| !!a \\| b!! |', '|---|---|'))).toEqual([
      'hidden:!!',
      'kcp-small:a \\| b',
      'hidden:!!',
    ]);
  });

  it('does not carry a run from one quoted list item into the next', () => {
    expect(read(below('> - !!nota um', '> - nota dois!!'))).toEqual([]);
  });

  it('does not carry a run out of a quoted heading', () => {
    expect(read(below('> # Título !!a', '> b!! resto'))).toEqual([]);
  });

  it('does not carry a run from one quoted table cell into the next', () => {
    expect(read(below('> | !!a | b!! |', '> |---|---|'))).toEqual([]);
  });

  it('leaves a code block written inside a quote alone', () => {
    expect(read(below('> ```', '> a ~b~ c', '> ```'))).toEqual([]);
  });

  it('reads a run written after a quoted code block', () => {
    expect(read(below('> ```', '> a ~b~ c', '> ```', '', 'H~2~O'))).toEqual([
      'hidden:~',
      'kcp-sub:2',
      'hidden:~',
    ]);
  });

  it('closes a quoted code block on a fence spaced differently', () => {
    expect(read(below('> ```', '> x', '>```', '', 'H~2~O'))).toEqual([
      'hidden:~',
      'kcp-sub:2',
      'hidden:~',
    ]);
  });

  it('leaves a quoted fence inside a code block as part of it', () => {
    expect(read(below('```', '> ```', '~x~ solto'))).toEqual([]);
  });

  it('does not carry a run into a quote written inside a quote', () => {
    expect(read(below('> !!a', '> > b!! fim'))).toEqual([]);
  });

  it('carries a run on into the line a nested quote is finished on', () => {
    expect(read(below('> > !!a', '> b!! fim'))).toEqual([
      'hidden:!!',
      'kcp-small:a\n> b',
      'hidden:!!',
    ]);
  });

  it("does not carry a run across a nested quote's own blank line", () => {
    expect(read(below('> > !!a', '> >', '> > b!! fim'))).toEqual([]);
  });

  it("does not carry a run out of a callout's title", () => {
    expect(read(below('> [!note] !!a', '> b!! fim'))).toEqual([]);
  });

  it('reads a run written in the body of a callout', () => {
    expect(read(below('> [!note] Nota', '> !!uma nota!!'))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('does not carry a run out of a heading underlined with equals', () => {
    expect(read(below('Título !!a', '===', 'b!! resto'))).toEqual([]);
  });

  it('does not carry a run across an embed', () => {
    const embed = '![[ARA-19-Salmos-001#^ara-psa-1-1|flat]]';
    expect(read(below(`!!Refs: ${embed} fim!!`))).toEqual([]);
  });

  it('reads a run written before an embed on the same line', () => {
    const embed = '![[ARA-19-Salmos-001#^ara-psa-1-1|flat]]';
    expect(read(below(`!!uma nota!! e ${embed}`))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('reads a run written after one', () => {
    const embed = '![[ARA-19-Salmos-001#^ara-psa-1-1|flat]]';
    expect(read(below(`${embed} e !!uma nota!!`))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('carries a run across a quote written inside a list item', () => {
    // A quote written over two lines is one lazy-continued paragraph whether
    // it sits at the top of the note or inside a list item.
    expect(read(below('- > !!a', '  > b!! fim'))).toEqual([
      'hidden:!!',
      'kcp-small:a\n  > b',
      'hidden:!!',
    ]);
  });

  it('does not carry a run from one list item into the next, inside a quote', () => {
    expect(read(below('> - !!um', '> - dois!!'))).toEqual([]);
  });

  it('does not carry a run across a table cell nested in a quote in a list', () => {
    expect(read(below('- > | !!a | b!! |', '  > |---|---|'))).toEqual([]);
  });

  it('does not carry a run out of a heading', () => {
    expect(read(below('# Título !!a', 'b!! resto'))).toEqual([]);
  });

  it('still reads a run written inside one list item', () => {
    expect(read(below('- !!uma nota!!', '- outra'))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('leaves a run with nothing but code in it as it was written', () => {
    expect(read(below('!!`ls -la`!!'))).toEqual([]);
  });

  it('marks a run that is nothing but a link, which does show', () => {
    expect(read(below('!![Sl 26.4](x)!!'))).toEqual([
      'kcp-small-line@L3',
      'hidden:!!',
      'kcp-small:[Sl 26.4](x)',
      'hidden:!!',
    ]);
  });

  it('leaves a code block alone', () => {
    expect(read('```\na ~b~ c\n```')).toEqual([]);
  });

  it('leaves inline code alone, and reads a run across it', () => {
    expect(read(below('!!rode `a ~b~ c` agora!!'))).toEqual([
      'kcp-small-line@L3',
      'hidden:!!',
      'kcp-small:rode `a ~b~ c` agora',
      'hidden:!!',
    ]);
  });

  it('leaves the caret of a block anchor alone', () => {
    expect(
      read('Refs: [[NVI-43-JHN-001#^nvi-jhn-1-1|Jo 1.1]]; [[X#^x-1-2|Jr]].'),
    ).toEqual([]);
  });

  it('leaves the block ids of two verse lines alone', () => {
    expect(
      read(
        [
          '**1** No princípio. ^ara-gen-1-1',
          '**2** E a terra. ^ara-gen-1-2',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('leaves a markdown link alone', () => {
    expect(read('Veja [um^dois](http://x/a^b) ali.')).toEqual([]);
  });

  it('reads a run holding a link', () => {
    expect(read(below('!!Refs: [[Sl 26.4|Sl 26.4]].!!'))).toEqual([
      'kcp-small-line@L3',
      'hidden:!!',
      'kcp-small:Refs: [[Sl 26.4|Sl 26.4]].',
      'hidden:!!',
    ]);
  });

  it('leaves inline maths alone', () => {
    expect(read('veja $x^2^$ ali')).toEqual([]);
  });

  it('reads a run holding a price, two dollars being no maths', () => {
    expect(read(below('!!Custa $5!! e $6'))).toEqual([
      'hidden:!!',
      'kcp-small:Custa $5',
      'hidden:!!',
    ]);
  });

  it('leaves strikethrough alone', () => {
    expect(read('um ~~riscado~~ verso')).toEqual([]);
  });

  it('reads a run written after a code block', () => {
    expect(read('```\nx\n```\nH~2~O')).toEqual([
      'hidden:~',
      'kcp-sub:2',
      'hidden:~',
    ]);
  });

  it('reads nothing out of an empty note', () => {
    expect(read('')).toEqual([]);
  });

  it('reads nothing when nothing is visible', () => {
    const state = EditorState.create({ doc: 'H~2~O', extensions: [MD] });
    expect(build(state, []).size).toBe(0);
  });

  it('skips a block lying in the gap between two visible ranges', () => {
    const doc = 'H~2~O\n\n2^10^\n\n!!nota!!';
    const state = EditorState.create({ doc, extensions: [MD] });
    // The first and third paragraph are on screen; the second — folded away —
    // still falls inside the outer bound the tree is walked over, and has to
    // be turned down on its own.
    const set = build(state, [
      { from: 0, to: 5 },
      { from: 14, to: 21 },
    ]);
    const out: string[] = [];
    set.between(0, doc.length, (_from, _to, value) => {
      out.push((value.spec.class as string | undefined) ?? 'hidden');
    });
    expect(out).toEqual([
      'hidden',
      'kcp-sub',
      'hidden',
      'kcp-small-line',
      'hidden',
      'kcp-small',
      'hidden',
    ]);
  });

  it('reads only what is on screen', () => {
    const doc = 'H~2~O\n\n2^10^';
    const state = EditorState.create({ doc, extensions: [MD] });
    const set = build(state, [{ from: 0, to: 5 }]);
    const out: string[] = [];
    set.between(0, doc.length, (_from, _to, value) => {
      out.push((value.spec.class as string | undefined) ?? 'hidden');
    });
    expect(out).toEqual(['hidden', 'kcp-sub', 'hidden']);
  });
});

describe('source mode', () => {
  /** The decorations of a note the editor is drawing one way or the other. */
  function read(doc: string, live: boolean): string[] {
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [MD, editorLivePreviewField.init(() => live)],
    });
    const out: string[] = [];
    build(state, [{ from: 0, to: doc.length }]).between(
      0,
      doc.length,
      (f, t, v) => {
        const what = (v.spec.class as string | undefined) ?? 'hidden';
        out.push(f === t ? `${what}@line` : `${what}:${doc.slice(f, t)}`);
      },
    );
    return out;
  }

  it('keeps the delimiters on the page, and still marks the run', () => {
    expect(read('Um verso.\n\n!!uma nota!!', false)).toEqual([
      'kcp-small-line@line',
      'kcp-small:uma nota',
    ]);
  });

  it('hides them in live preview, as before', () => {
    expect(read('Um verso.\n\n!!uma nota!!', true)).toEqual([
      'kcp-small-line@line',
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });
});

describe('the spacing of an aside', () => {
  it('gives its size to a line it covers whole', () => {
    expect(read(below('!!very', 'small', 'text!!'))).toEqual([
      'kcp-small-line@L3',
      'hidden:!!',
      'kcp-small:very\nsmall\ntext',
      'hidden:!!',
      'kcp-small-line@L4',
      'kcp-small-line@L5',
    ]);
  });

  it('gives it to one long line too, which the editor wraps on its own', () => {
    const long = `!!${'very '.repeat(40)}long line!!`;
    expect(read(below(long))).toContain('kcp-small-line@L3');
  });

  it('leaves a line the aside only reaches into at its own size', () => {
    expect(read(below('Refs: !!uma nota!! e o resto.'))).toEqual([
      'hidden:!!',
      'kcp-small:uma nota',
      'hidden:!!',
    ]);
  });

  it('leaves the line of a raised or lowered run alone', () => {
    expect(read(below('~2~'))).toEqual(['hidden:~', 'kcp-sub:2', 'hidden:~']);
  });
});

describe('LiveMarks', () => {
  /** Enough of an editor to be decorated: what it holds and what it shows. */
  function view(doc: string): EditorView {
    const state = EditorState.create({ doc, extensions: [MD] });
    return {
      state,
      visibleRanges: [{ from: 0, to: doc.length }],
    } as unknown as EditorView;
  }

  it('decorates what the editor opened on', () => {
    const marks = new LiveMarks(view('H~2~O'));
    expect(marks.decorations.size).toBe(3);
  });

  it('reads the editor again when the note changes', () => {
    const marks = new LiveMarks(view('H~2~O'));
    const next = view('H~2~O e 2^10^');
    marks.update({
      docChanged: true,
      selectionSet: false,
      viewportChanged: false,
      view: next,
    } as never);
    expect(marks.decorations.size).toBe(6);
  });

  it('hands its decorations to the editor it is installed in', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'H~2~O',
        extensions: [MD, liveMarks],
      }),
      parent: document.body,
    });
    expect(view.plugin(liveMarks)?.decorations.size).toBe(3);
    expect(view.dom.querySelector('.kcp-sub')?.textContent).toBe('2');
    view.destroy();
  });

  /** An editor drawing one view of a note or the other. */
  function drawing(doc: string, live: boolean): EditorView {
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [MD, editorLivePreviewField.init(() => live)],
    });
    return {
      state,
      visibleRanges: [{ from: 0, to: doc.length }],
    } as unknown as EditorView;
  }

  it('reads the editor again when it is switched to source mode', () => {
    const note = 'Um verso.\n\n!!uma nota!!';
    const preview = drawing(note, true);
    const marks = new LiveMarks(preview);
    // The line, the run, and the two delimiters taken off the page.
    expect(marks.decorations.size).toBe(4);

    const source = drawing(note, false);
    marks.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: preview.state,
      state: source.state,
      view: source,
    } as never);
    expect(marks.decorations.size).toBe(2);
  });

  it('leaves the decorations alone when nothing that matters moved', () => {
    const marks = new LiveMarks(view('H~2~O'));
    const before = marks.decorations;
    const still = view('H~2~O e 2^10^');
    marks.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: still.state,
      state: still.state,
      view: still,
    } as never);
    expect(marks.decorations).toBe(before);
  });
});
