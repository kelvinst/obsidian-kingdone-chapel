import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField } from '@codemirror/state';
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

/**
 * The row a folded comment leaves behind: an ellipsis, and nothing else.
 *
 * `display: none` over the comment's lines was tried first and cost more than
 * it saved. A hidden line has no box, and vertical motion is geometric, so the
 * down arrow — and vim's `j` and `gj` — stepped straight over it; a click
 * could not land on it either, and nothing on the page said there was
 * anything there to reach for. A comment nobody can see and nobody can move to
 * is a comment nobody can edit or delete.
 *
 * So the comment is folded rather than hidden, which is what was being asked
 * for all along: the row stays and an ellipsis stands in for what is no longer
 * shown, exactly as Obsidian draws a list item whose children are collapsed.
 * A reader who has ever collapsed a list already knows what the ellipsis means
 * and that clicking it brings the content back, and `.cm-foldPlaceholder` is
 * the class the theme styles, so the fold stays right in whatever theme the
 * vault is wearing rather than carrying a colour picked here.
 *
 * The one place it must differ from a list's fold: a list hangs its ellipsis
 * off the parent row, and a comment has no parent — nothing owns it and the
 * line above it is no part of it. So the ellipsis takes the comment's own row,
 * `cm-line` and all. That is not cosmetic; a fold with no row of its own is
 * `display: none` again, stepped over by the same arrow for the same reason.
 */
export class CommentFold extends WidgetType {
  constructor(
    /** How many lines are folded, which the row says when it is more than one. */
    readonly lines: number,
  ) {
    super();
  }

  /**
   * Two folds are the same where they draw the same row. Where the comment
   * stands is deliberately no part of that: a fold that carried its position
   * would differ from itself after every keystroke above it, and the editor
   * would rebuild every row below the caret on each one. Nothing here needs
   * the position anyway — the row asks the editor where it ended up when it
   * is clicked.
   */
  eq(other: CommentFold): boolean {
    return other.lines === this.lines;
  }

  toDOM(view: EditorView): HTMLElement {
    const row = view.dom.ownerDocument.createElement('div');
    row.className = 'cm-line kcp-comment-fold';

    const mark = row.ownerDocument.createElement('span');
    mark.className = 'cm-foldPlaceholder';
    // A count of one says nothing the row does not already say by standing
    // there; over several lines it is the only thing that says how much is
    // folded away under the one row.
    mark.textContent = this.lines > 1 ? `… ${this.lines} lines` : '…';
    row.append(mark);

    // Clicking a fold opens it, the way clicking one opens a list — and the
    // cursor arriving is what `build` already reads to give the comment back.
    // The selection is set here rather than left to the editor because the
    // editor has nowhere to put it: the comment's own positions are under a
    // replacing decoration, which is what `WidgetType`'s default
    // `ignoreEvent` is for — the row is the fold's business, not the editor's.
    // On `mousedown` rather than `click`, so no drag-select starts on a row
    // that has no text to select. Where the comment is is asked of the editor
    // at the moment of the click rather than held here, because a row whose
    // fold is `eq` to the one before it is a row the editor keeps and moves
    // rather than draws again.
    row.addEventListener('mousedown', (event) => {
      // The primary button alone. A right press is on its way to a context
      // menu, which is opened from `mousedown` on some platforms and would be
      // swallowed by the `preventDefault` below, and a comment that unfolds
      // under the pointer before the menu is even up is a comment answering a
      // question nobody asked.
      if (event.button !== 0) return;
      event.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(row) } });
      view.focus();
    });

    return row;
  }
}

/** A run of lines that is a comment and nothing else, by where it lies. */
interface Run {
  from: number;
  to: number;
  lines: number[];
}

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
function blocks(state: EditorState): Run[] {
  const found: Run[] = [];
  let code = false;
  let codeDepth = 0;
  let open: { from: number; lines: number[] } | null = null;

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
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
 * The runs the note has, or none of them where the editor is in source mode.
 *
 * Source mode is the note as it is written, markup and all — the same stand
 * `live.ts` takes on a delimiter. Absent, as in a state built by hand, take it
 * for live preview.
 */
function read(state: EditorState): Run[] {
  return (state.field(editorLivePreviewField, false) ?? true)
    ? blocks(state)
    : [];
}

/** A fold over each of `runs` that the cursor is not in. */
function drawn(state: EditorState, runs: readonly Run[]): DecorationSet {
  const into: Range<Decoration>[] = [];

  for (const block of runs) {
    // Inside the comment, the comment is what is being edited.
    if (touched(state, block.from, block.to)) continue;
    // One decoration over the whole run, block and all: a comment written over
    // several lines is one comment and folds to one row, and `block: true` is
    // what makes that row a row — the same shape CodeMirror's own
    // `codeFolding()` gives its placeholder.
    into.push(
      Decoration.replace({
        block: true,
        widget: new CommentFold(block.lines.length),
      }).range(block.from, block.to),
    );
  }

  return Decoration.set(into, true);
}

/**
 * A fold over every comment in the note that the cursor is not in.
 *
 * The whole note is read, not the screenful of it on show. A block decoration
 * may only reach the editor from the state, never from a view plugin, and the
 * state is not told where the viewport is — so the viewport bound the hiding
 * carried while it was a line decoration goes with it, and what is left to
 * bound is how often the reading is done rather than how much of it.
 */
export function build(state: EditorState): DecorationSet {
  return drawn(state, read(state));
}

/** The runs the note holds, and the folds standing over them. */
interface Folds {
  runs: Run[];
  over: DecorationSet;
}

/**
 * What the editor is given: the folds, kept up with the note under them.
 *
 * A state field rather than the view plugin the other live extensions are —
 * CodeMirror refuses a block decoration handed to it by a plugin, since a
 * plugin is rebuilt from what is on screen and a block changes what "on
 * screen" means. `codeFolding()` is a state field for the same reason.
 *
 * The runs are kept beside the folds because reading them costs a regex over
 * every line of the note and only the note can change them. A cursor moved is
 * the commonest transaction there is — every arrow key is one — and it can
 * only change which run the cursor is in, never where the runs are, so it
 * redraws the folds over the runs already read rather than reading the note
 * again to find them unchanged.
 */
export const liveComments = StateField.define<Folds>({
  create(state) {
    const runs = read(state);
    return { runs, over: drawn(state, runs) };
  },

  update(folds, tr) {
    // The note under them, and the view the editor is drawing it in —
    // switching to source mode moves neither the note nor the cursor, and the
    // comments would otherwise stay as live preview left them. Either one can
    // move a run, so either one is read for afresh.
    if (
      tr.docChanged ||
      tr.startState.field(editorLivePreviewField, false) !==
        tr.state.field(editorLivePreviewField, false)
    ) {
      const runs = read(tr.state);
      return { runs, over: drawn(tr.state, runs) };
    }
    // And the selection among them: a comment comes back when the cursor
    // arrives and goes again when it leaves.
    if (tr.startState.selection.eq(tr.state.selection)) return folds;
    return { runs: folds.runs, over: drawn(tr.state, folds.runs) };
  },

  provide: (field) => EditorView.decorations.from(field, (folds) => folds.over),
});
