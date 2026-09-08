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
 * What keeps the row a row is that the comment is replaced the way Obsidian
 * replaces the `**` around bold text: an ordinary replacement over the text,
 * leaving the line it was written on to the editor. A block widget was tried
 * instead and drew its own row, `cm-line` and all — which worked, and meant
 * impersonating a line, and meant a quoted comment's row was no part of the
 * callout it was written in. A replacement over the text alone needs none of
 * that: the line is the editor's, so it has the box the down arrow lands on
 * and the markers a callout is held together by, and both for free.
 */
export class CommentFold extends WidgetType {
  constructor(
    /** How many lines are folded, which the fold says when it is more than one. */
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
    const mark = view.dom.ownerDocument.createElement('span');
    mark.className = 'cm-foldPlaceholder kcp-comment-fold';
    // An ellipsis alone says something was folded and not what, and every
    // fold in a note looks the same as the next. So the fold says what it
    // stands for. The count comes with it where there is more than one line
    // under the fold, which is the only thing the ellipsis cannot say by
    // standing where it stands; a count of one would say nothing more.
    mark.textContent =
      this.lines > 1 ? `… ${this.lines}-line comment` : '… comment';
    return mark;
  }

  /**
   * A click is the editor's business, which is all it has to be: the editor
   * puts the cursor where the fold was clicked, and the cursor arriving is
   * what `build` reads to give the comment back. Nothing here has to know
   * where it stands.
   */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * The size a comment's lines are drawn at: an aside's, which is what a comment
 * is — something written beside the note rather than in it.
 *
 * Taken on the line rather than on the ellipsis, because the height of a line
 * is struck from the size of the line and a span cannot shrink the one it sits
 * in. `live.ts` shrinks the lines of a `,,so,,` aside for the same reason and
 * with the same class, so the plugin has one small rather than two.
 *
 * And taken whether or not the comment is folded. Only the taking off the page
 * answers to the cursor: a line that changed height as the cursor arrived
 * would move the note under whoever came to read it, and the comment is an
 * aside while it is being written as much as after.
 */
const SMALL = Decoration.line({ class: 'kcp-small-line' });

/** A run of lines that is a comment and nothing else, by where it lies. */
interface Run {
  /** Where the run's first line begins, quote markers and all. */
  from: number;
  /**
   * Where the comment's own text begins, past those markers. A quoted comment
   * is taken off from the `<!--` on and the `>` before it is left standing,
   * because the `>` is what holds the callout together.
   */
  opens: number;
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
  let open: {
    from: number;
    opens: number;
    lines: number[];
    quoted: boolean;
  } | null = null;

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
      open = {
        from: line.from,
        opens: line.to - said.length,
        lines: [],
        quoted: false,
      };
    }
    open.lines.push(line.from);
    if (said !== line.text) open.quoted = true;

    const closed = CLOSE.exec(said);
    if (!closed) continue;
    // A comment whose closing line goes on to say something of the note's own
    // is a comment the note is holding, not a run of lines to take off it.
    //
    // And a comment written over several quoted lines is left standing. One
    // replacement over the run swallows the line breaks inside it, and with
    // them the `>` opening every line but the first — the callout would lose
    // the lines it is held together by. Quoted and on one line there is no
    // break to swallow, so the markers stay where they were written. Taking
    // the several-line case off wants a replacement per line, which is
    // okc-1lz.
    if (closed[1].trim() === '' && !(open.quoted && open.lines.length > 1)) {
      found.push({
        from: open.from,
        opens: open.opens,
        to: line.to,
        lines: open.lines,
      });
    }
    open = null;
  }

  return found;
}

/**
 * What `runs` are drawn by: the size on every line of them, and a fold over
 * each the cursor is not in.
 *
 * Source mode is the note as it is written, markup and all — the same stand
 * `live.ts` takes on a delimiter, and taken here in the same place: it decides
 * what comes off the page, never what size the lines are drawn at. An aside
 * written `,,so,,` is small in both views and shows its commas in one, and a
 * comment is an aside in both views too — a note that reflowed around its
 * comments on every toggle would be a note moving under whoever toggled.
 * Absent, as in a state built by hand, take it for live preview.
 */
function drawn(state: EditorState, runs: readonly Run[]): DecorationSet {
  const hiding = state.field(editorLivePreviewField, false) ?? true;
  const into: Range<Decoration>[] = [];

  for (const block of runs) {
    for (const from of block.lines) into.push(SMALL.range(from));
    // Inside the comment, the comment is what is being edited.
    if (!hiding || touched(state, block.from, block.to)) continue;
    // One replacement over the whole run: a comment written over several lines
    // is one comment and folds to one ellipsis. Not a block one — the line the
    // comment was written on is the editor's own, and stays a row of its own
    // for the cursor to reach without anything here drawing it.
    into.push(
      Decoration.replace({
        widget: new CommentFold(block.lines.length),
      }).range(block.opens, block.to),
    );
  }

  return Decoration.set(into, true);
}

/**
 * A fold over every comment in the note that the cursor is not in.
 *
 * The whole note is read, not the screenful of it on show. A replacement
 * reaching across a line break may only come from the state, never from a view
 * plugin, and the state is not told where the viewport is — so the viewport
 * bound the hiding carried while it was a line decoration goes with it, and
 * what is left to bound is how often the reading is done rather than how much
 * of it.
 */
export function build(state: EditorState): DecorationSet {
  return drawn(state, blocks(state));
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
 * a comment written over several lines is replaced across the line breaks
 * between them, and CodeMirror refuses a replacement like that from a plugin,
 * since a plugin is rebuilt from what is on screen and a replaced line break
 * changes what "on screen" means. `codeFolding()` is a state field for the
 * same reason.
 *
 * The runs are kept beside the folds because reading them costs a regex over
 * every line of the note and only the note can change them. A cursor moved is
 * the commonest transaction there is — every arrow key is one — and it can
 * only change which run the cursor is in, never where the runs are, so it
 * redraws the folds over the runs already read rather than reading the note
 * again to find them unchanged. Switching between the two views is the same:
 * it changes what is drawn over the runs, never the runs.
 */
export const liveComments = StateField.define<Folds>({
  create(state) {
    const runs = blocks(state);
    return { runs, over: drawn(state, runs) };
  },

  update(folds, tr) {
    // The note under them is the one thing that can move a run.
    if (tr.docChanged) {
      const runs = blocks(tr.state);
      return { runs, over: drawn(tr.state, runs) };
    }
    // The selection among them: a comment comes back when the cursor arrives
    // and goes again when it leaves. And the view the editor is drawing —
    // switching to source mode moves neither the note nor the cursor, and the
    // comments would otherwise stay as live preview left them.
    if (
      tr.startState.selection.eq(tr.state.selection) &&
      tr.startState.field(editorLivePreviewField, false) ===
        tr.state.field(editorLivePreviewField, false)
    ) {
      return folds;
    }
    return { runs: folds.runs, over: drawn(tr.state, folds.runs) };
  },

  provide: (field) => EditorView.decorations.from(field, (folds) => folds.over),
});
