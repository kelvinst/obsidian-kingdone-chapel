import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';

import { CODE_BLOCK, NOT_PROSE_SOURCE, touched, unquoted } from './source';

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

/** A line indented far enough to be a code block, fences or no fences. */
const INDENTED_CODE = /^(?: {4}|\t)/;

/**
 * What follows the end of a comment on the line that closes it, if anything.
 * Anything at all and the line is not folded: a line is folded for being a
 * comment whole, never for holding one — `text <!-- why -->` is text, and only
 * the comment inside it comes off, the way `**` comes off bold.
 */
const CLOSE = /-->(.*)$/;

/**
 * What a line holds that a comment written in it would only be shown by:
 * inline code above all — `` `<!-- x -->` `` is a note explaining a comment,
 * not a comment — and maths and links with it. Masked with the same
 * alternation `live.ts` and `softlink-live.ts` mask with, so the three agree
 * on what in a line is prose.
 *
 * A `%%…%%` comment is masked on top of that alternation, and only here: it
 * stays on the page because it is addressed to whoever writes the note, so
 * taking a piece out of it would leave the writer looking at a gap in
 * something of their own with nothing saying what was cut.
 */
const NOT_PROSE = new RegExp(`%%[^%\\n]*%%|${NOT_PROSE_SOURCE}`, 'g');

function mask(text: string): string {
  return text.replace(NOT_PROSE, (found) => '\uFFFC'.repeat(found.length));
}

/**
 * The comment nothing stands in for: taken off a line that goes on being a
 * line, as `**` is taken off bold. A fold would say something was there, and
 * a line with text on it already says the row is not empty.
 */
const GONE = Decoration.replace({});

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
 * A reader who has ever collapsed a list already knows what the fold means and
 * that clicking it brings the content back, and `.cm-foldPlaceholder` is
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
    /** How many lines are folded, which the fold says however many there are. */
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
    // An ellipsis alone says something was folded and not what. So the fold
    // opens the way the comment under it opens, with `<!--`, and trails off:
    // it says what it stands for in the note's own syntax rather than in
    // English, and there is nothing to learn about what `<!--` means that
    // whoever wrote the comment does not already know.
    //
    // The count is said whether it is one line or four. A fold that spoke up
    // only above one line would leave the reader working out which kind of
    // fold they were looking at before they could read it.
    const lines = this.lines === 1 ? '1 line' : `${this.lines} lines`;
    mark.textContent = `<!-- ${lines}...`;
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

/** A comment written inside a line, by where it lies. */
interface Span {
  from: number;
  to: number;
}

/** The comments a note holds: whole runs of lines, and spans inside a line. */
interface Comments {
  runs: Run[];
  inline: Span[];
}

/**
 * The comments `said` holds inside it from `at` on, onto `into`, and whether
 * the last of them opens and does not close on this line.
 *
 * An opener is looked for in the masked line, since one inside inline code
 * opens nothing. A closer is looked for in the line as written: once a comment
 * is open, backticks are only its text.
 */
function within(
  said: string,
  masked: string,
  at: number,
  offset: number,
  into: Span[],
): boolean {
  let from = masked.indexOf('<!--', at);
  while (from !== -1) {
    // From the second `-` on, so `<!-->` and `<!--->` — comments whole, with
    // nothing in them — close on themselves rather than running on to the
    // next `-->` and taking the note's own words between with them.
    const close = said.indexOf('-->', from + 2);
    if (close === -1) return true;
    into.push({ from: offset + from, to: offset + close + 3 });
    from = masked.indexOf('<!--', close + 3);
  }
  return false;
}

/**
 * The runs of lines that are a comment and nothing else, and the comments
 * written inside a line that is not one.
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
function blocks(state: EditorState): Comments {
  const found: Run[] = [];
  const inline: Span[] = [];
  // A comment opened inside a line that did not close on it. v1 leaves it
  // standing whole rather than taking half of one line and half of another
  // off: it is fiddlier, and a comment half on the page is worse than one
  // left showing. But it is still open, so nothing written inside it is read
  // as a comment of its own.
  let spilling = false;
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
        // A fence ends the paragraph a comment was opened in.
        spilling = false;
        continue;
      }
    }
    if (code) continue;

    const offset = line.to - said.length;
    const masked = mask(said);

    if (spilling) {
      // So does a blank line.
      if (said.trim() === '') {
        spilling = false;
        continue;
      }
      const close = said.indexOf('-->');
      if (close !== -1) {
        spilling = within(said, masked, close + 3, offset, inline);
      }
      continue;
    }

    if (!open) {
      if (!OPEN.test(said)) {
        // Four spaces or a tab is a code block, which is why `OPEN` stops at
        // three: what is written in one is being shown, comment or not. The
        // bound has to be carried here as well, or a line `OPEN` turned down
        // for being code would lose its comment to this instead.
        if (!INDENTED_CODE.test(said)) {
          spilling = within(said, masked, 0, offset, inline);
        }
        continue;
      }
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
    } else if (closed[1].trim() !== '') {
      // Not folded, but what the line holds is still read: a comment on one
      // line from its start, and on the closing line of several, whatever
      // follows the `-->` that closed them.
      const at = open.lines.length === 1 ? 0 : closed.index + 3;
      spilling = within(said, masked, at, offset, inline);
    }
    open = null;
  }

  return { runs: found, inline };
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
function drawn(state: EditorState, comments: Comments): DecorationSet {
  const hiding = state.field(editorLivePreviewField, false) ?? true;
  const into: Range<Decoration>[] = [];

  for (const block of comments.runs) {
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

  // The same answer to the cursor as a fold, and the same stand on source
  // mode. The runs above and these never cover one line both: a line that is
  // a comment whole is a run, and is never read for spans.
  for (const span of comments.inline) {
    if (!hiding || touched(state, span.from, span.to)) continue;
    into.push(GONE.range(span.from, span.to));
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

/** The comments the note holds, and what is drawn over them. */
interface Folds {
  comments: Comments;
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
    const comments = blocks(state);
    return { comments, over: drawn(state, comments) };
  },

  update(folds, tr) {
    // The note under them is the one thing that can move a run.
    if (tr.docChanged) {
      const comments = blocks(tr.state);
      return { comments, over: drawn(tr.state, comments) };
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
    return {
      comments: folds.comments,
      over: drawn(tr.state, folds.comments),
    };
  },

  provide: (field) => EditorView.decorations.from(field, (folds) => folds.over),
});
