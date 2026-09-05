// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { editorInfoField, editorLivePreviewField } from 'obsidian';

import {
  LiveSoftLinks,
  SoftLinkWidget,
  build,
  liveSoftLinks,
} from './softlink-live';

/** An app that knows one note. */
function stub() {
  return {
    metadataCache: {
      getFirstLinkpathDest: (path: string) =>
        path === 'Shedd-19-PSA-023' ? { path: `${path}.md` } : null,
    },
    workspace: { openLinkText: vi.fn(), trigger: vi.fn() },
  };
}

/**
 * Every decoration a note asks for, as `link:text` for one drawn in place of a
 * token and `raw:text` for one left standing.
 *
 * The cursor starts where an editor puts it, at the top of the note, so a note
 * whose first line is plain is a note read with the cursor out of the way.
 */
function read(doc: string, cursor = 0): string[] {
  const state = EditorState.create({ doc, selection: { anchor: cursor } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = build(
    state,
    [{ from: 0, to: doc.length }],
    stub() as any,
    'a.md',
  );
  const out: string[] = [];
  set.between(0, doc.length, (from, to, value) => {
    const widget = value.spec.widget as { link?: { text: string } } | undefined;
    out.push(
      widget ? `link:${widget.link!.text}` : `raw:${doc.slice(from, to)}`,
    );
  });
  return out;
}

/** A note whose first line keeps the cursor away from what is being read. */
function below(...lines: string[]): string {
  return ['Um verso.', '', ...lines].join('\n');
}

describe('build', () => {
  it('draws a token as a link', () => {
    expect(read(below('Veja ((Shedd-19-PSA-023|23)).'))).toEqual(['link:23']);
  });

  it('gives the token back when the cursor is inside it', () => {
    const doc = below('((Shedd-19-PSA-023|23))');
    expect(read(doc, doc.length - 4)).toEqual([]);
  });

  it('gives it back when the selection reaches into it', () => {
    const doc = below('((a|1))');
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length - 3, head: doc.length },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = build(
      state,
      [{ from: 0, to: doc.length }],
      stub() as any,
      'a.md',
    );
    let count = 0;
    set.between(0, doc.length, () => {
      count++;
    });
    expect(count).toBe(0);
  });

  it('draws every token on a line', () => {
    expect(read(below('((a|1)) e ((b|2))'))).toEqual(['link:1', 'link:2']);
  });

  it('leaves a token inside a fenced block alone', () => {
    expect(read(below('```', '((a|1))', '```'))).toEqual([]);
  });

  it('leaves a token inside inline code alone', () => {
    expect(read(below('Escreva `((a|1))` assim.'))).toEqual([]);
  });

  it('leaves a token inside a fence written inside a callout alone', () => {
    expect(read(below('> [!note]', '> ```', '> ((a|1))', '> ```'))).toEqual([]);
  });

  it('draws a token written three callouts deep', () => {
    expect(read(below('>>> ((a|1))'))).toEqual(['link:1']);
  });

  it('does not close a fence on a line quoted to a different depth', () => {
    // The inner fence line is a fence closing nothing — its quote depth does
    // not match the depth the block opened at — so the block stays open
    // through it and the token inside stays hidden. The correctly-quoted
    // fence after it is what actually closes the block.
    expect(read(below('> ```', '>> ```', '> ((a|1))', '> ```'))).toEqual([]);
  });

  it('reads nothing below what is on screen', () => {
    const doc = below('((a|1))');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = build(state, [{ from: 0, to: 5 }], stub() as any, 'a.md');
    let count = 0;
    set.between(0, doc.length, () => {
      count++;
    });
    expect(count).toBe(0);
  });

  it('still counts a fence opened above what is visible', () => {
    const doc = ['```', '((a|1))', '```'].join('\n');
    const state = EditorState.create({ doc, selection: { anchor: 0 } });
    // The fence opens on line 1, which is out of range — only line 2 (where
    // the token sits) and below is visible — but the block it opens still
    // holds, so the token stays hidden rather than being read as plain text.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = build(
      state,
      [{ from: 4, to: doc.length }],
      stub() as any,
      'a.md',
    );
    let count = 0;
    set.between(0, doc.length, () => {
      count++;
    });
    expect(count).toBe(0);
  });
});

describe('source mode', () => {
  /** The decorations of a note the editor is drawing one way or the other. */
  function read(doc: string, live: boolean): string[] {
    const state = EditorState.create({
      doc,
      selection: { anchor: 0 },
      extensions: [editorLivePreviewField.init(() => live)],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = build(
      state,
      [{ from: 0, to: doc.length }],
      stub() as any,
      'a.md',
    );
    const out: string[] = [];
    set.between(0, doc.length, (from, to, value) => {
      const widget = value.spec.widget as
        { link?: { text: string } } | undefined;
      out.push(
        widget ? `link:${widget.link!.text}` : `raw:${doc.slice(from, to)}`,
      );
    });
    return out;
  }

  it('draws the link in live preview', () => {
    expect(read(below('((a|1))'), true)).toEqual(['link:1']);
  });

  it('leaves the token on the page in source mode', () => {
    expect(read(below('((a|1))'), false)).toEqual([]);
  });
});

describe('SoftLinkWidget', () => {
  const link = { from: 0, to: 7, path: 'Shedd-19-PSA-023', text: '23' };

  it('toDOM builds the anchor linkEl builds', () => {
    const widget = new SoftLinkWidget(link, stub() as never, 'a.md');
    const view = { dom: { ownerDocument: document } } as unknown as EditorView;
    const el = widget.toDOM(view);
    expect(el.tagName).toBe('A');
    expect(el.className).toBe('internal-link');
    expect(el.textContent).toBe('23');

    const app = stub();
    const clicking = new SoftLinkWidget(link, app as never, 'a.md');
    const clickEl = clicking.toDOM(view);
    clickEl.dispatchEvent(new MouseEvent('click'));
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'Shedd-19-PSA-023',
      'a.md',
      false,
    );
  });

  it("ignoreEvent returns false, so a click is the link's business", () => {
    const widget = new SoftLinkWidget(link, stub() as never, 'a.md');
    expect(widget.ignoreEvent()).toBe(false);
  });

  describe('eq', () => {
    const app = stub() as never;

    it('is equal to another widget for the same link in the same note', () => {
      const a = new SoftLinkWidget(link, app, 'a.md');
      const b = new SoftLinkWidget({ ...link }, app, 'a.md');
      expect(a.eq(b)).toBe(true);
    });

    it('is not equal when the path differs', () => {
      const a = new SoftLinkWidget(link, app, 'a.md');
      const b = new SoftLinkWidget({ ...link, path: 'Other' }, app, 'a.md');
      expect(a.eq(b)).toBe(false);
    });

    it('is not equal when the text differs', () => {
      const a = new SoftLinkWidget(link, app, 'a.md');
      const b = new SoftLinkWidget({ ...link, text: 'other' }, app, 'a.md');
      expect(a.eq(b)).toBe(false);
    });

    it('is not equal when the source note differs', () => {
      const a = new SoftLinkWidget(link, app, 'a.md');
      const b = new SoftLinkWidget(link, app, 'b.md');
      expect(a.eq(b)).toBe(false);
    });
  });
});

describe('LiveSoftLinks', () => {
  /** Enough of an editor to be decorated: what it holds and what it shows. */
  function view(doc: string): EditorView {
    const state = EditorState.create({ doc });
    return {
      state,
      visibleRanges: [{ from: 0, to: doc.length }],
    } as unknown as EditorView;
  }

  it('decorates what the editor opened on', () => {
    const links = new LiveSoftLinks(view(below('((a|1))')), stub() as never);
    expect(links.decorations.size).toBe(1);
  });

  it('reads the editor again when the note changes', () => {
    const links = new LiveSoftLinks(view(below('((a|1))')), stub() as never);
    const next = view(below('((a|1)) e ((b|2))'));
    links.update({
      docChanged: true,
      selectionSet: false,
      viewportChanged: false,
      view: next,
    } as never);
    expect(links.decorations.size).toBe(2);
  });

  it('resolves the note from the vault root when there is no file', () => {
    const links = new LiveSoftLinks(view(below('((a|1))')), stub() as never);
    expect(links.path()).toBe('');
  });

  it('leaves the decorations alone when nothing that matters moved', () => {
    const links = new LiveSoftLinks(view(below('((a|1))')), stub() as never);
    const before = links.decorations;
    const still = view(below('((a|1)) e ((b|2))'));
    links.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: still.state,
      state: still.state,
      view: still,
    } as never);
    expect(links.decorations).toBe(before);
  });

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

  it('reads the editor again when it is switched to source mode', () => {
    const doc = below('((a|1))');
    const preview = drawing(doc, true);
    const links = new LiveSoftLinks(preview, stub() as never);
    expect(links.decorations.size).toBe(1);

    const source = drawing(doc, false);
    links.update({
      docChanged: false,
      selectionSet: false,
      viewportChanged: false,
      startState: preview.state,
      state: source.state,
      view: source,
    } as never);
    expect(links.decorations.size).toBe(0);
  });
});

describe('liveSoftLinks', () => {
  it('returns an extension the editor accepts', () => {
    const app = stub() as never;
    const extension = liveSoftLinks(app);
    const view = new EditorView({
      state: EditorState.create({
        doc: below('((a|1))'),
        extensions: [extension],
      }),
      parent: document.body,
    });
    expect(view.dom.querySelector('.internal-link')?.textContent).toBe('1');
    view.destroy();
  });

  it("resolves the note's path from editorInfoField when the editor has a file", () => {
    const app = stub();
    const extension = liveSoftLinks(app as never);
    const doc = below('((a|1))');
    const view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [
          extension,
          editorInfoField.init(
            () => ({ file: { path: 'Notes/a.md' } }) as never,
          ),
        ],
      }),
      parent: document.body,
    });
    view.dom.querySelector('a')?.dispatchEvent(new MouseEvent('click'));
    expect(app.workspace.openLinkText).toHaveBeenCalledWith(
      'a',
      'Notes/a.md',
      false,
    );
    view.destroy();
  });
});
