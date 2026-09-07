// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorLivePreviewField } from 'obsidian';

import { EditorSelection } from '@codemirror/state';

import { LiveComments, build, liveComments, skipped } from './comment-live';

/**
 * The lines a note has taken off it, by their text.
 *
 * The cursor starts where an editor puts it, at the top of the note, so a note
 * whose first line is plain is a note read with the cursor out of the way.
 */
function hidden(
  doc: string,
  cursor = 0,
  visible: { from: number; to: number }[] = [{ from: 0, to: doc.length }],
): string[] {
  const state = EditorState.create({ doc, selection: { anchor: cursor } });
  const set = build(state, visible);
  const out: string[] = [];
  set.between(0, doc.length, (from) => {
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
    expect(build(state, [{ from: 0, to: doc.length }]).size).toBe(0);
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

  it('takes a quoted comment off the page, markers and all', () => {
    expect(hidden(below('> [!note]', '> <!-- prettier-ignore -->'))).toEqual([
      '> <!-- prettier-ignore -->',
    ]);
  });

  it('reads nothing below what is on screen', () => {
    const doc = below('<!-- a -->');
    expect(hidden(doc, 0, [{ from: 0, to: 5 }])).toEqual([]);
  });

  it('reads nothing when nothing is visible at all', () => {
    // No visible ranges is a viewport of nothing rather than one of
    // everything, so the bottom it computes is before the very first line.
    expect(hidden(below('<!-- a -->'), 0, [])).toEqual([]);
  });

  it('skips a comment sitting in the gap between two visible ranges', () => {
    const doc = below('<!-- a -->', '<!-- skip -->', '<!-- c -->');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    const first = state.doc.line(3);
    const last = state.doc.line(5);
    expect(
      hidden(doc, 0, [
        { from: first.from, to: first.to },
        { from: last.from, to: last.to },
      ]),
    ).toEqual(['<!-- a -->', '<!-- c -->']);
  });

  it('still counts a fence opened above what is visible', () => {
    const doc = ['```', '<!-- a -->', '```'].join('\n');
    expect(hidden(doc, 0, [{ from: 4, to: doc.length }])).toEqual([]);
  });
});

describe('skipped', () => {
  /** The spans no cursor walks on, as `from-to`. */
  function ground(
    doc: string,
    cursor = 0,
    visible: { from: number; to: number }[] = [{ from: 0, to: doc.length }],
  ): string[] {
    const state = EditorState.create({ doc, selection: { anchor: cursor } });
    const out: string[] = [];
    skipped(state, visible).between(0, doc.length, (from, to) => {
      out.push(`${from}-${to}`);
    });
    return out;
  }

  it('takes in the newline on either side of the comment', () => {
    // The line above ends at 9 and the line below opens at 21, so stepping
    // from one to the other is a single press across one span.
    const doc = ['Um verso.', '<!-- a -->', 'Fim.'].join('\n');
    expect(ground(doc)).toEqual(['9-21']);
  });

  it('stops at the head of a note the comment opens', () => {
    const doc = ['<!-- a -->', 'Fim.'].join('\n');
    expect(ground(doc, doc.length)).toEqual(['0-11']);
  });

  it('stops at the foot of a note the comment closes', () => {
    const doc = ['Um verso.', '<!-- a -->'].join('\n');
    expect(ground(doc)).toEqual([`9-${doc.length}`]);
  });

  it('walks the whole of a comment written over several lines', () => {
    const doc = ['Um verso.', '<!--', 'por quê', '-->', 'Fim.'].join('\n');
    expect(ground(doc)).toEqual([`9-${doc.indexOf('Fim.')}`]);
  });

  it('is ground the cursor walks on again once it is standing there', () => {
    const doc = ['Um verso.', '<!-- a -->', 'Fim.'].join('\n');
    expect(ground(doc, doc.indexOf('<!--') + 2)).toEqual([]);
  });

  it('leaves source mode alone', () => {
    const doc = ['Um verso.', '<!-- a -->'].join('\n');
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [editorLivePreviewField.init(() => false)],
    });
    expect(skipped(state, [{ from: 0, to: doc.length }]).size).toBe(0);
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
    return build(state, [{ from: 0, to: doc.length }]).size;
  }

  it('hides the comment in live preview', () => {
    expect(drawn(below('<!-- a -->'), true)).toBe(1);
  });

  it('leaves it standing in source mode', () => {
    // Source mode is the note as it is written, markup and all.
    expect(drawn(below('<!-- a -->'), false)).toBe(0);
  });
});

describe('LiveComments', () => {
  /** An editor drawing one view of a note or the other. */
  function drawing(doc: string, live: boolean): EditorView {
    const state = EditorState.create({
      doc,
      extensions: [editorLivePreviewField.init(() => live)],
    });
    return {
      state,
      visibleRanges: [{ from: 0, to: doc.length }],
    } as unknown as EditorView;
  }

  it('reads the note when it is built', () => {
    expect(
      new LiveComments(drawing(below('<!-- a -->'), true)).decorations.size,
    ).toBe(1);
  });

  it('leaves the decorations alone when nothing it reads changed', () => {
    const view = drawing(below('<!-- a -->'), true);
    const comments = new LiveComments(view);
    const before = comments.decorations;
    comments.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: view.state,
      state: view.state,
      view,
    } as never);
    expect(comments.decorations).toBe(before);
  });

  it('reads the note again when the cursor moves', () => {
    const doc = below('<!-- a -->');
    const view = drawing(doc, true);
    const comments = new LiveComments(view);
    const onIt = {
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: [editorLivePreviewField.init(() => true)],
      }),
      visibleRanges: [{ from: 0, to: doc.length }],
    } as unknown as EditorView;
    comments.update({
      docChanged: false,
      selectionSet: true,
      viewportChanged: false,
      startState: view.state,
      state: onIt.state,
      view: onIt,
    } as never);
    expect(comments.decorations.size).toBe(0);
  });

  it('reads the editor again when it is switched to source mode', () => {
    const doc = below('<!-- a -->');
    const preview = drawing(doc, true);
    const comments = new LiveComments(preview);
    expect(comments.decorations.size).toBe(1);

    const source = drawing(doc, false);
    comments.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: preview.state,
      state: source.state,
      view: source,
    } as never);
    expect(comments.decorations.size).toBe(0);
  });
});

describe('liveComments', () => {
  it('steps a right arrow over the comment, as a down arrow steps over it', () => {
    // A hidden line has no box, so vertical motion passes it by; horizontal
    // motion counts positions rather than pixels and would otherwise drop the
    // cursor into a line nothing is drawing.
    const doc = ['Um verso.', '<!-- a -->', 'Fim.'].join('\n');
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [liveComments] }),
      parent: document.body,
    });
    const above = view.state.doc.line(1);
    const below = view.state.doc.line(3);
    view.dispatch({ selection: EditorSelection.cursor(above.to) });
    expect(view.moveByChar(view.state.selection.main, true).head).toBe(
      below.from,
    );
    view.destroy();
  });

  it('steps a left arrow back over it the same way', () => {
    const doc = ['Um verso.', '<!-- a -->', 'Fim.'].join('\n');
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [liveComments] }),
      parent: document.body,
    });
    const above = view.state.doc.line(1);
    const below = view.state.doc.line(3);
    view.dispatch({ selection: EditorSelection.cursor(below.from) });
    expect(view.moveByChar(view.state.selection.main, false).head).toBe(
      above.to,
    );
    view.destroy();
  });

  it('walks an editor that never had the plugin on flat ground', () => {
    // The facet is asked for its ranges by whatever editor is holding it, and
    // one that never loaded the plugin has no comments to step over. The
    // fallback is what says so rather than throwing at the reader.
    const doc = ['Um verso.', '<!-- a -->', 'Fim.'].join('\n');
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [liveComments] }),
      parent: document.body,
    });
    const bare = new EditorView({
      state: EditorState.create({ doc }),
      parent: document.body,
    });
    const asked = view.state
      .facet(EditorView.atomicRanges)
      .map((ranges) => ranges(bare).size);
    expect(asked).toContain(0);
    view.destroy();
    bare.destroy();
  });

  it('returns an extension the editor accepts', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: below('<!-- prettier-ignore -->'),
        extensions: [liveComments],
      }),
      parent: document.body,
    });
    expect(view.dom.querySelector('.kcp-comment-line')).not.toBeNull();
    view.destroy();
  });
});
