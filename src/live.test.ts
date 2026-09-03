// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { LiveMarks, build, liveMarks } from './live';

/**
 * Every decoration a note asks for, as `what:text` — or `what@Ln` for the ones
 * that dress a whole line.
 *
 * The cursor starts where an editor puts it, at the top of the note, so a note
 * whose first line is plain is a note read with the cursor out of the way.
 */
function read(doc: string, cursor = 0): string[] {
  const state = EditorState.create({ doc, selection: { anchor: cursor } });
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

  it('does not carry a run across a quote of its own', () => {
    expect(read(below('> !!Refs: Sl 26.4', '>', '> Notas: n1!!'))).toEqual([]);
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

  it('reads only what is on screen', () => {
    const doc = 'H~2~O\n\n2^10^';
    const state = EditorState.create({ doc });
    const set = build(state, [{ from: 0, to: 5 }]);
    const out: string[] = [];
    set.between(0, doc.length, (_from, _to, value) => {
      out.push((value.spec.class as string | undefined) ?? 'hidden');
    });
    expect(out).toEqual(['hidden', 'kcp-sub', 'hidden']);
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
    const state = EditorState.create({ doc });
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
      state: EditorState.create({ doc: 'H~2~O', extensions: [liveMarks] }),
      parent: document.body,
    });
    expect(view.plugin(liveMarks)?.decorations.size).toBe(3);
    expect(view.dom.querySelector('.kcp-sub')?.textContent).toBe('2');
    view.destroy();
  });

  it('leaves the decorations alone when nothing that matters moved', () => {
    const marks = new LiveMarks(view('H~2~O'));
    const before = marks.decorations;
    marks.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      view: view('H~2~O e 2^10^'),
    } as never);
    expect(marks.decorations).toBe(before);
  });
});
