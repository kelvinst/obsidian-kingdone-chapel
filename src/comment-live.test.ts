// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
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
  const set = build(state);
  const out: string[] = [];
  set.between(0, doc.length, (from, to) => {
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    for (let n = first; n <= last; n++) out.push(state.doc.line(n).text);
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
    expect(build(state).size).toBe(0);
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

  it('leaves a comment written inside a callout standing', () => {
    // The fold is a block, and a block in the middle of a callout is no part
    // of the quote: the callout would be broken in two around a row that is
    // none of its own. Reaching it wants okc-1lz's shape instead.
    expect(hidden(below('> [!note]', '> <!-- prettier-ignore -->'))).toEqual(
      [],
    );
  });

  it('leaves a comment only some of whose lines are quoted standing', () => {
    // One line of it inside a quote is enough to put a block where a block
    // cannot go.
    expect(hidden(below('<!--', '> por quê', '-->'))).toEqual([]);
  });
});

describe('the fold', () => {
  /** The widget a note's one folded comment is drawn by. */
  function fold(doc: string): CommentFold {
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const set = build(state);
    let found: CommentFold | null = null;
    set.between(0, doc.length, (from, to, value) => {
      found = value.spec.widget as CommentFold;
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
    expect(build(state).size).toBe(1);
  });

  it('covers the comment from its first line to its last', () => {
    const doc = below('<!--', 'por quê', '-->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const set = build(state);
    const at: number[] = [];
    set.between(0, doc.length, (from, to) => {
      at.push(from, to);
    });
    expect(at).toEqual([state.doc.line(3).from, state.doc.line(5).to]);
  });

  it('draws an ellipsis where the comment was', () => {
    expect(
      drawn(below('<!-- prettier-ignore -->')).querySelector(
        '.cm-foldPlaceholder',
      )?.textContent,
    ).toBe('…');
  });

  it("wears the editor's own fold class, so the theme draws it", () => {
    // Obsidian already styles what it collapses; a colour picked here would
    // be one more thing to keep right in every theme.
    const el = drawn(below('<!-- a -->'));
    expect(el.querySelector('.cm-foldPlaceholder')).not.toBeNull();
  });

  it('stands as a line of its own, not as something hung off one', () => {
    // A list's ellipsis hangs off its parent row; a comment has no parent, and
    // an ellipsis with no row of its own leaves the down arrow nothing to
    // land on — which is the whole complaint.
    expect(drawn(below('<!-- a -->')).classList.contains('cm-line')).toBe(true);
  });

  it('says how much is folded when it is more than a line', () => {
    expect(drawn(below('<!--', 'por quê', '-->')).textContent).toContain(
      '3 lines',
    );
  });

  it('says no count for a comment written on one line', () => {
    // The row itself says where it is; a count of one says nothing more.
    expect(drawn(below('<!-- a -->')).textContent).toBe('…');
  });

  it('puts the cursor into the comment when it is clicked', () => {
    // Clicking a fold opens it, the way clicking one opens a list — and the
    // cursor arriving is what `build` already reads to give the comment back.
    const doc = below('<!-- a -->');
    const at = doc.indexOf('<!--');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const set = build(state);
    let widget: CommentFold | null = null;
    set.between(0, doc.length, (from, to, value) => {
      widget = value.spec.widget as CommentFold;
    });
    const sent: unknown[] = [];
    let focused = false;
    const el = widget!.toDOM({
      dom: document.body,
      dispatch: (spec: unknown) => sent.push(spec),
      posAtDOM: () => at,
      focus: () => {
        focused = true;
      },
    } as never);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(sent).toEqual([{ selection: { anchor: at } }]);
    expect(focused).toBe(true);
  });

  /** What the fold does with a press: whether it answered it, and how. */
  function pressed(init: MouseEventInit): {
    sent: unknown[];
    prevented: boolean;
  } {
    const doc = below('<!-- a -->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const set = build(state);
    let widget: CommentFold | null = null;
    set.between(0, doc.length, (from, to, value) => {
      widget = value.spec.widget as CommentFold;
    });
    const sent: unknown[] = [];
    const el = widget!.toDOM({
      dom: document.body,
      dispatch: (spec: unknown) => sent.push(spec),
      posAtDOM: () => 0,
      focus: () => {},
    } as never);
    const press = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(press);
    return { sent, prevented: press.defaultPrevented };
  }

  it('is opened by the primary button alone', () => {
    // A right press is on its way to a context menu, not to the comment.
    expect(pressed({ button: 2 })).toEqual({ sent: [], prevented: false });
  });

  it('is not opened by a ctrl-click', () => {
    // Which is how a context menu is asked for on macOS, wearing the primary
    // button as it goes.
    expect(pressed({ button: 0, ctrlKey: true })).toEqual({
      sent: [],
      prevented: false,
    });
  });

  it('asks the editor where it is rather than remembering', () => {
    // A row the editor keeps and moves is a row whose remembered position
    // would be the one it was drawn at, not the one it now stands at.
    const doc = below('<!-- a -->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const set = build(state);
    let widget: CommentFold | null = null;
    set.between(0, doc.length, (from, to, value) => {
      widget = value.spec.widget as CommentFold;
    });
    let asked: unknown = null;
    const el = widget!.toDOM({
      dom: document.body,
      dispatch: () => {},
      posAtDOM: (node: unknown) => {
        asked = node;
        return 0;
      },
      focus: () => {},
    } as never);
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(asked).toBe(el);
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
    return build(state).size;
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
    expect(view.state.field(liveComments).over.size).toBe(1);
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
    expect(view.state.field(liveComments).over.size).toBe(0);
    view.destroy();
  });

  it('folds a comment as soon as it is written', () => {
    const view = editing(below('Verso.'), true);
    expect(view.state.field(liveComments).over.size).toBe(0);
    view.dispatch({
      changes: {
        from: view.state.doc.length,
        insert: '\n<!-- prettier-ignore -->',
      },
      selection: { anchor: 0 },
    });
    expect(view.state.field(liveComments).over.size).toBe(1);
    view.destroy();
  });

  it('draws nothing in an editor set to source mode', () => {
    const view = editing(below('<!-- a -->'), false);
    expect(view.state.field(liveComments).over.size).toBe(0);
    view.destroy();
  });
});
