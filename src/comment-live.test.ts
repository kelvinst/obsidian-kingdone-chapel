// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';

import { CommentFold, build, liveComments } from './comment-live';

/**
 * The lines a note has taken off it, by their text.
 *
 * The cursor starts where an editor puts it, at the top of the note, so a note
 * whose first line is plain is a note read with the cursor out of the way.
 */
function hidden(doc: string, cursor = 0): string[] {
  const state = EditorState.create({ doc, selection: { anchor: cursor } });
  const out: string[] = [];
  for (const fold of foldsIn(build(state), doc.length)) {
    const first = state.doc.lineAt(fold.from).number;
    const last = state.doc.lineAt(fold.to).number;
    for (let n = first; n <= last; n++) out.push(state.doc.line(n).text);
  }
  return out;
}

/**
 * The folds in `set`, leaving aside the size its lines are given.
 *
 * A comment's lines are drawn small whether the comment is folded or not, so
 * what a set holds and what it takes off the page are two different questions.
 */
function foldsIn(
  set: DecorationSet,
  end: number,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  set.between(0, end, (from, to, value) => {
    if (value.spec.widget instanceof CommentFold) out.push({ from, to });
  });
  return out;
}

/** The lines the note has drawn small, by their text. */
function small(doc: string, cursor = 0, live = true): string[] {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [editorLivePreviewField.init(() => live)],
  });
  const out: string[] = [];
  build(state).between(0, doc.length, (from, to, value) => {
    if (value.spec.class === 'kcp-small-line')
      out.push(state.doc.lineAt(from).text);
  });
  return out;
}

/** A note whose first line keeps the cursor away from what is being read. */
function below(...lines: string[]): string {
  return ['Um verso.', '', ...lines].join('\n');
}

describe('build', () => {
  it('takes a `prettier-ignore` line off the page', () => {
    expect(hidden(below('<!-- prettier-ignore -->'))).toEqual([
      '<!-- prettier-ignore -->',
    ]);
  });

  it('takes the pair bounding a run off too', () => {
    expect(
      hidden(
        below(
          '<!-- prettier-ignore-start -->',
          'Verso.',
          '<!-- prettier-ignore-end -->',
        ),
      ),
    ).toEqual([
      '<!-- prettier-ignore-start -->',
      '<!-- prettier-ignore-end -->',
    ]);
  });

  it('takes any other html comment off the page', () => {
    // The comment is addressed to whatever machinery reads the note, whether
    // or not that machinery is Prettier.
    expect(hidden(below('<!-- gerado por okc -->'))).toEqual([
      '<!-- gerado por okc -->',
    ]);
  });

  it("leaves the note's own `%%` comment standing", () => {
    // Neither comment reaches the reader; this is the one that reaches the
    // writer, which is the whole reason for keeping both around.
    expect(hidden(below('%% conferir esta tradução %%'))).toEqual([]);
  });

  it('leaves a line carrying inline html alone', () => {
    // The bug that started this: the vault snippet matched `.cm-html-embed`,
    // so any line with a tag on it vanished along with the comments.
    expect(hidden(below('Verso<sup>1</sup> assim.'))).toEqual([]);
  });

  it('leaves a line that goes on to say something of its own', () => {
    expect(hidden(below('Verso. <!-- conferir -->'))).toEqual([]);
  });

  it('leaves a line whose comment closes before its prose does', () => {
    expect(hidden(below('<!-- conferir --> Verso.'))).toEqual([]);
  });

  it('gives the line back when the cursor is on it', () => {
    const doc = below('<!-- prettier-ignore -->');
    expect(hidden(doc, doc.length)).toEqual([]);
  });

  it('gives it back when the selection reaches into it', () => {
    const doc = below('<!-- a -->');
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length - 4, head: doc.length },
    });
    expect(foldsIn(build(state), doc.length)).toEqual([]);
  });

  it('takes a comment written over several lines off whole', () => {
    expect(hidden(below('<!--', 'por quê', '-->'))).toEqual([
      '<!--',
      'por quê',
      '-->',
    ]);
  });

  it('gives the whole block back when the cursor is anywhere inside it', () => {
    // Half a block on the page is a block whose ends the cursor cannot be
    // seen to be between, so the ends come back with the middle.
    const doc = below('<!--', 'por quê', '-->');
    const inside = doc.indexOf('por quê') + 2;
    expect(hidden(doc, inside)).toEqual([]);
  });

  it('leaves a block whose closing line goes on to say something', () => {
    expect(hidden(below('<!--', 'por quê', '--> Verso.'))).toEqual([]);
  });

  it('leaves a comment inside a fenced block alone', () => {
    // A note explaining the format writes the markers to be read, not obeyed.
    expect(hidden(below('```', '<!-- prettier-ignore -->', '```'))).toEqual([]);
  });

  it('leaves a comment inside an indented code block alone', () => {
    // Four spaces is a code block of its own, fences or no fences, and the
    // reader is handed what is in it as code.
    expect(hidden(below('    <!-- prettier-ignore -->'))).toEqual([]);
  });

  it('leaves a comment inside a tab-indented code block alone', () => {
    expect(hidden(below('\t<!-- prettier-ignore -->'))).toEqual([]);
  });

  it('takes a comment indented short of a code block off the page', () => {
    // Three spaces is as far as a comment may be pushed and still be one.
    expect(hidden(below('   <!-- prettier-ignore -->'))).toEqual([
      '   <!-- prettier-ignore -->',
    ]);
  });

  it('leaves a comment inside a fence written inside a callout alone', () => {
    expect(
      hidden(below('> [!note]', '> ```', '> <!-- a -->', '> ```')),
    ).toEqual([]);
  });

  it('does not close a fence on a line quoted to a different depth', () => {
    expect(hidden(below('> ```', '>> ```', '> <!-- a -->', '> ```'))).toEqual(
      [],
    );
  });

  it('takes a quoted comment off the page', () => {
    expect(hidden(below('> [!note]', '> <!-- prettier-ignore -->'))).toEqual([
      '> <!-- prettier-ignore -->',
    ]);
  });

  it('leaves the markers standing on the line it takes it off', () => {
    // The `>` is what holds the callout together: replace it along with the
    // comment and the callout is broken in two around the row.
    const doc = below('> [!note]', '> <!-- prettier-ignore -->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    expect(foldsIn(build(state), doc.length).map((fold) => fold.from)).toEqual([
      doc.indexOf('<!-- prettier-ignore -->'),
    ]);
  });

  it('leaves a comment written over several quoted lines standing', () => {
    // Replacing across the line breaks would swallow the markers of every
    // line but the first, which is okc-1lz.
    expect(hidden(below('> <!--', '> por quê', '> -->'))).toEqual([]);
  });

  it('gives a quoted comment back when the cursor is on its markers', () => {
    // The comment is taken off from the `<!--` on, but it is the whole line
    // the cursor is tested against — a cursor on the `>` is a cursor there.
    const doc = below('> [!note]', '> <!-- a -->');
    expect(hidden(doc, doc.lastIndexOf('>'))).toEqual([]);
  });
});

describe('small', () => {
  it('draws the lines a comment covers small', () => {
    // The same size an aside written `,,so,,` takes, and taken the same way:
    // on the line, because the height of a line is struck from the size of
    // the line and a span cannot shrink the line it sits in.
    expect(small(below('<!-- prettier-ignore -->'))).toEqual([
      '<!-- prettier-ignore -->',
    ]);
  });

  it('draws every line of a comment written over several small', () => {
    expect(small(below('<!--', 'por quê', '-->'))).toEqual([
      '<!--',
      'por quê',
      '-->',
    ]);
  });

  it('keeps them small while the comment is being written', () => {
    // Only the taking off the page answers to the cursor. A line that changed
    // height as the cursor arrived would move the note under whoever came to
    // read it.
    const doc = below('<!-- prettier-ignore -->');
    expect(small(doc, doc.length)).toEqual(['<!-- prettier-ignore -->']);
    expect(hidden(doc, doc.length)).toEqual([]);
  });

  it('leaves a line that is no comment at its own size', () => {
    expect(small(below('Verso. <!-- conferir -->'))).toEqual([]);
  });

  it('draws them small in source mode too', () => {
    // `live.ts` shrinks an aside's lines in both views and takes only its
    // delimiters off the page in one. A comment is an aside in both views as
    // well, and a note that reflowed around its comments on every toggle
    // would be a note moving under whoever toggled.
    const doc = below('<!-- prettier-ignore -->');
    expect(small(doc, 0, false)).toEqual(['<!-- prettier-ignore -->']);
  });
});

describe('the fold', () => {
  /** The widget a note's one folded comment is drawn by. */
  function fold(doc: string): CommentFold {
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    let found: CommentFold | null = null;
    build(state).between(0, doc.length, (from, to, value) => {
      if (value.spec.widget) found = value.spec.widget as CommentFold;
    });
    if (!found) throw new Error('nothing folded');
    return found;
  }

  /** What such a fold puts on the page. */
  function drawn(doc: string): HTMLElement {
    return fold(doc).toDOM({
      dom: document.body,
      dispatch: () => {},
      focus: () => {},
    } as never);
  }

  it('folds a comment written over several lines into one row', () => {
    // Three lines hidden as three rows is three rows of nothing; one fold is
    // the row the eye and the down arrow are both given.
    const doc = below('<!--', 'por quê', '-->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    expect(foldsIn(build(state), doc.length)).toHaveLength(1);
  });

  it('covers the comment from its first line to its last', () => {
    const doc = below('<!--', 'por quê', '-->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    expect(foldsIn(build(state), doc.length)).toEqual([
      { from: state.doc.line(3).from, to: state.doc.line(5).to },
    ]);
  });

  it('says what it stands for, where the comment was', () => {
    expect(drawn(below('<!-- prettier-ignore -->')).textContent).toBe('%% ...');
  });

  it("wears the editor's own fold class, so the theme draws it", () => {
    // Obsidian already styles what it collapses; a colour picked here would
    // be one more thing to keep right in every theme.
    const el = drawn(below('<!-- a -->'));
    expect(el.classList.contains('cm-foldPlaceholder')).toBe(true);
  });

  it('leaves the row to the editor rather than drawing one', () => {
    // The comment is replaced the way `**` is: the line under it is the
    // editor's own, so it has the box the down arrow needs without this
    // having to impersonate one.
    const doc = below('<!-- a -->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const specs: unknown[] = [];
    build(state).between(0, doc.length, (from, to, value) => {
      if (value.spec.widget) specs.push(value.spec.block);
    });
    expect(specs).toEqual([undefined]);
    expect(drawn(below('<!-- a -->')).tagName).toBe('SPAN');
  });

  it('hands its clicks back to the editor', () => {
    // Which is all a click has to do: the editor puts the cursor where it was
    // clicked, and the cursor arriving is what gives the comment back.
    expect(new CommentFold(1).ignoreEvent()).toBe(false);
  });

  it('says how much is folded when it is more than a line', () => {
    expect(drawn(below('<!--', 'por quê', '-->')).textContent).toBe(
      '%% 3 lines...',
    );
  });

  it('counts no lines for a comment written on one', () => {
    // The fold stands on the line it stands for; a count of one says nothing
    // that the fold sitting there does not already say.
    expect(drawn(below('<!-- a -->')).textContent).toBe('%% ...');
  });

  it('is the same fold as another drawing the same row', () => {
    // Without this the editor rebuilds the row on every keystroke elsewhere.
    expect(new CommentFold(1).eq(new CommentFold(1))).toBe(true);
  });

  it('is a different fold from one over a comment of another size', () => {
    expect(new CommentFold(1).eq(new CommentFold(3))).toBe(false);
  });
});

describe('source mode', () => {
  /** The decorations of a note the editor is drawing one way or the other. */
  function drawn(doc: string, live: boolean): number {
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [editorLivePreviewField.init(() => live)],
    });
    return foldsIn(build(state), doc.length).length;
  }

  it('hides the comment in live preview', () => {
    expect(drawn(below('<!-- a -->'), true)).toBe(1);
  });

  it('leaves it standing in source mode', () => {
    // Source mode is the note as it is written, markup and all.
    expect(drawn(below('<!-- a -->'), false)).toBe(0);
  });
});

describe('liveComments', () => {
  /** An editor drawing one view of a note or the other. */
  function editing(doc: string, live: boolean): EditorView {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [editorLivePreviewField.init(() => live), liveComments],
      }),
      parent: document.body,
    });
  }

  it('folds the note it is given as it is built', () => {
    const view = editing(below('<!-- prettier-ignore -->'), true);
    expect(
      foldsIn(view.state.field(liveComments).over, view.state.doc.length)
        .length,
    ).toBe(1);
    view.destroy();
  });

  it('draws the fold on the page', () => {
    const view = editing(below('<!-- prettier-ignore -->'), true);
    expect(view.dom.querySelector('.kcp-comment-fold')).not.toBeNull();
    view.destroy();
  });

  it('leaves the folds alone when nothing it reads changed', () => {
    const view = editing(below('<!-- a -->'), true);
    const before = view.state.field(liveComments);
    view.dispatch({});
    expect(view.state.field(liveComments)).toBe(before);
    view.destroy();
  });

  it('keeps the runs it read when only the cursor moved', () => {
    // Reading them costs a regex over every line of the note, and an arrow key
    // cannot move a comment — only which one the cursor is in.
    const doc = below('<!-- a -->');
    const view = editing(doc, true);
    const before = view.state.field(liveComments).runs;
    view.dispatch({ selection: { anchor: doc.length } });
    expect(view.state.field(liveComments).runs).toBe(before);
    view.destroy();
  });

  it('reads the note again when it is edited', () => {
    const view = editing(below('<!-- a -->'), true);
    const before = view.state.field(liveComments).runs;
    view.dispatch({ changes: { from: 0, insert: 'Outro. ' } });
    expect(view.state.field(liveComments).runs).not.toBe(before);
    view.destroy();
  });

  it('reads the note again when the cursor moves onto a comment', () => {
    const doc = below('<!-- a -->');
    const view = editing(doc, true);
    view.dispatch({ selection: { anchor: doc.length } });
    expect(
      foldsIn(view.state.field(liveComments).over, view.state.doc.length)
        .length,
    ).toBe(0);
    view.destroy();
  });

  it('folds a comment as soon as it is written', () => {
    const view = editing(below('Verso.'), true);
    expect(
      foldsIn(view.state.field(liveComments).over, view.state.doc.length)
        .length,
    ).toBe(0);
    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: '\n<!-- prettier-ignore -->',
      },
      selection: { anchor: 0 },
    });
    expect(
      foldsIn(view.state.field(liveComments).over, view.state.doc.length)
        .length,
    ).toBe(1);
    view.destroy();
  });

  it('draws nothing in an editor set to source mode', () => {
    const view = editing(below('<!-- a -->'), false);
    expect(
      foldsIn(view.state.field(liveComments).over, view.state.doc.length)
        .length,
    ).toBe(0);
    view.destroy();
  });
});
