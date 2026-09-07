import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, PluginValue, ViewUpdate } from '@codemirror/view';
import { RangeSet } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';

import { CODE_BLOCK, touched, unquoted } from './source';

/**
 * The HTML comments, out of the way while the note is being written.
 *
 * A note carries two kinds of comment and the reader sees neither: Obsidian's
 * own `%%…%%` and HTML's `<!--…-->`. That leaves the difference between them
 * free to be spent on who they are addressed to, and this is where it is
 * spent: `%%…%%` is a comment to whoever is writing the note and stays on the
 * page, `<!--…-->` is a comment to the machinery and comes off it. The
 * machinery is not hypothetical — `notes.ts` writes `<!-- prettier-ignore -->`
 * above every note callout and wraps a chapter's verses in `-start` / `-end`,
 * so a generated note is a note full of lines that say something to the
 * formatter and nothing to anyone reading.
 *
 * The line comes back the moment the cursor arrives, which is the moment it is
 * wanted: a line nobody can put their cursor into is a line nobody can edit or
 * delete.
 *
 * The vault did this with a CSS snippet on `.cm-comment`, paired with one on
 * `.cm-html-embed` — the token class for *any* inline HTML — so a line
 * carrying a `<sup>` disappeared along with the comments. CSS matches token
 * classes and cannot read the text under them, so the only place the question
 * "is this whole line a comment?" can be asked is here, over the source.
 */

/**
 * A line that opens a comment, with nothing of the note's own before it.
 *
 * Three spaces of indent at most, which is the bound CommonMark puts on an
 * HTML block: a fourth makes the line an indented code block, and a comment
 * written in one is a comment being shown — the reader is handed it as code,
 * and taking it off the page here would hide from whoever is writing the note
 * something whoever reads it can see. A tab indents such a block too, which is
 * the other thing a plain `\s*` would have let through.
 */
const OPEN = /^ {0,3}<!--/;

/**
 * What follows the end of a comment on the line that closes it, if anything.
 * Anything at all and the line stays: a line is hidden for being a comment
 * whole, never for holding one — `text <!-- why -->` is text.
 */
const CLOSE = /-->(.*)$/;

/** What is put over such a line, taken off the page by `styles.css`. */
const HIDDEN = Decoration.line({ class: 'kcp-comment-line' });

/**
 * And what stands for it in the set of ground no cursor walks on. It is never
 * drawn — `EditorView.atomicRanges` reads the bounds and nothing else.
 */
const SKIP = Decoration.replace({});

/**
 * The runs of lines that are a comment and nothing else.
 *
 * A comment is not one line's business the way a mark is: `<!--` on one line
 * and `-->` three below it is one comment covering four, and it hides and
 * comes back as one — a block half on the page is a block whose ends the
 * cursor cannot be seen to be between.
 *
 * Code is the one thing read past: a comment written inside a fence is one
 * being shown rather than one being addressed to anybody, and a note
 * explaining the note format would otherwise lose the lines it is explaining.
 */
function blocks(state: EditorState, bottom: number) {
  const found: { from: number; to: number; lines: number[] }[] = [];
  let code = false;
  let codeDepth = 0;
  let open: { from: number; lines: number[] } | null = null;

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    // Past the foot of what is on screen there is nothing left to decorate,
    // bar the block straddling it, which has to be closed before it is known
    // to be a block at all.
    if (line.from > bottom && !open) break;
    const said = unquoted(line.text);

    // A code block ends on a fence written as deep as the one that opened it.
    if (CODE_BLOCK.test(said) && !open) {
      const quoted = (
        line.text.slice(0, line.text.length - said.length).match(/>/g) ?? []
      ).length;
      if (!code || quoted === codeDepth) {
        code = !code;
        codeDepth = quoted;
        continue;
      }
    }
    if (code) continue;

    if (!open) {
      if (!OPEN.test(said)) continue;
      open = { from: line.from, lines: [] };
    }
    open.lines.push(line.from);

    const closed = CLOSE.exec(said);
    if (!closed) continue;
    // A comment whose closing line goes on to say something of the note's own
    // is a comment the note is holding, not a run of lines to take off it.
    if (closed[1].trim() === '') {
      found.push({ from: open.from, to: line.to, lines: open.lines });
    }
    open = null;
  }

  return found;
}

/**
 * The comments actually coming off the page: what `blocks` found, once the
 * cursor and the viewport have had their say.
 */
function taken(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): { from: number; to: number; lines: number[] }[] {
  // Source mode is the note as it is written, markup and all — the same stand
  // `live.ts` takes on a delimiter. Absent, as in a state built by hand, take
  // it for live preview.
  if (!(state.field(editorLivePreviewField, false) ?? true)) return [];

  const bottom = visible.length ? visible[visible.length - 1].to : -1;
  return blocks(state, bottom).filter(
    (block) =>
      // Inside the comment, the comment is what is being edited.
      !touched(state, block.from, block.to) &&
      // A note is drawn a screenful at a time; the rest of it is not worth
      // decorating.
      visible.some((range) => range.from <= block.to && range.to >= block.from),
  );
}

/** Every comment line on screen that the cursor is not in. */
export function build(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): DecorationSet {
  const into: Range<Decoration>[] = [];
  for (const block of taken(state, visible)) {
    for (const from of block.lines) into.push(HIDDEN.range(from));
  }
  return Decoration.set(into, true);
}

/**
 * The same comments, as ground the cursor does not walk on.
 *
 * A line with no box on the page is a line vertical motion steps over —
 * there is no geometry to land in — so the down arrow, and vim's `j` and `gj`,
 * all pass a hidden comment by. Horizontal motion does not: it counts
 * positions in the document rather than pixels on the screen, so a right
 * arrow at the end of the line above would drop the cursor into a line
 * nothing is drawing, where it sits invisible until it is moved again.
 *
 * Handing these to `EditorView.atomicRanges` settles the disagreement the one
 * way that is honest: the comment is ground no motion walks on, and a right
 * arrow steps over it exactly as a down arrow does. What is off the page is
 * off the page, whichever key is asking.
 *
 * The newline on either side is inside the range on purpose. A range that
 * stopped at the comment's own ends would let the cursor land on them — the
 * boundary of an atomic range is a position, not a hole — and the point is to
 * step from the line above to the line below in one press.
 */
export function skipped(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): RangeSet<Decoration> {
  return RangeSet.of(
    taken(state, visible).map((block) =>
      SKIP.range(
        Math.max(0, block.from - 1),
        Math.min(state.doc.length, block.to + 1),
      ),
    ),
    true,
  );
}

/** What the editor is given: the decorations, kept up with what it shows. */
export class LiveComments implements PluginValue {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;

  constructor(view: EditorView) {
    this.decorations = build(view.state, view.visibleRanges);
    this.atomic = skipped(view.state, view.visibleRanges);
  }

  update(update: ViewUpdate) {
    // The selection among them: a comment comes back when the cursor arrives
    // and goes again when it leaves. And the view the editor is drawing —
    // switching to source mode moves neither the note nor the cursor, and the
    // comments would otherwise stay as live preview left them.
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.state.field(editorLivePreviewField, false) !==
        update.startState.field(editorLivePreviewField, false)
    ) {
      this.decorations = build(update.view.state, update.view.visibleRanges);
      this.atomic = skipped(update.view.state, update.view.visibleRanges);
    }
  }
}

export const liveComments = ViewPlugin.fromClass(LiveComments, {
  decorations: (comments) => comments.decorations,
  // What is off the page is ground no motion walks on, so the editor is told
  // where it is as well as what it looks like.
  provide: (plugin) =>
    EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.atomic ?? Decoration.none,
    ),
});
