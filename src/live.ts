import { Decoration, ViewPlugin } from '@codemirror/view';
import type {
  DecorationSet,
  EditorView,
  PluginValue,
  ViewUpdate,
} from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';

import { runsIn } from './syntax';

/**
 * The three marks while the note is being edited.
 *
 * A markdown post-processor never runs in live preview — what is on screen
 * there is the source itself, drawn by CodeMirror — so `marks.ts` leaves the
 * editor showing every delimiter raw. This draws them the way Obsidian draws
 * its own bold and italic: the run is styled where it stands, and its
 * delimiters are hidden until the cursor is inside the run, which is the moment
 * they are wanted back.
 *
 * What is a rewritten node in reading view is a decoration here, over the
 * source. The reading of the syntax is the same either way, and lives in
 * `syntax.ts`.
 */

/**
 * A stretch of source with nothing of the note's own to show for it: code, or
 * maths, both of which a run may reach across but neither of which it may be
 * read out of.
 */
const OPAQUE = '￼';

/**
 * And one that does show something, only not what the source says: a link,
 * which stands on the page as its label. A run may hold one and mark it — an
 * aside that is only a reference is still an aside — it just cannot be opened
 * or closed inside the target.
 */
const LABEL = '\uFFFD';

/**
 * What the source holds that the reader never sees as prose.
 *
 * Code and maths are one half of it, and links the other: a link carries its
 * target as well as its label, and a target is full of delimiters the note
 * never wrote. A block anchor is a caret — `[[NVI-43-JHN-001#^nvi-jhn-1-1|Jo
 * 1.1]]` — so a line naming two of them would otherwise read as one long
 * superscript, and so would a verse between two lines ending in block ids.
 *
 * Maths is held to Obsidian's own rule, that a dollar opening or closing it
 * touches what it delimits. Two dollars written as money would otherwise pair
 * off and blank out everything between them, `,,Custa $5,, e $6` losing the
 * exclamations that close the aside along with the rest.
 */
const NOT_PROSE =
  /`[^`\n]*`|\$(?![\s$])[^$\n]*[^\s$]\$|!?\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\([^)\n]*\)|\^[\w-]+(?=[ \t]*$)/gm;

/** A line opening or closing a code block. */
const CODE_BLOCK = /^\s*(?:```|~~~)/;

/**
 * A line that begins a block of its own: a list item, a heading, a quote, a
 * table row, a rule.
 *
 * The editor is handed a whole note and has to find the bound on a run itself,
 * where reading view is handed one rendered block at a time and gets it for
 * free. A blank line is not the only thing that ends a block: two list items
 * are two blocks with no blank line between them, and so are a heading and the
 * paragraph under it. Without this a run would reach from one into the next —
 * marking text the reader will see unmarked, and swallowing the second item's
 * own bullet along the way.
 *
 * A quote is not among them. Its marker repeats on every line of the one
 * paragraph rather than opening a block, so a quoted aside written over two
 * lines is one run, exactly as it is when the note is read. A callout is
 * written as a quote but is among them: its title is drawn apart from the body
 * under it, and `[!note]` is what says so.
 *
 * A table row is not among them either, not by the look of its first
 * character: a pipe only starts a row of a table that exists, and whether one
 * does is a question `DELIMITER_ROW` answers.
 */
const NEW_BLOCK = /^\s*(?:[-*+] |\d+[.)] |#{1,6} |---|\[!|=+\s*$)/;

/**
 * And one that is a block all by itself. A heading is a line, not a paragraph:
 * what follows it starts afresh without a blank line to say so, and the same
 * goes for a callout's title and for the rule of equals or dashes underlining
 * a heading written the other way.
 */
const ONE_LINE = /^\s*(?:#{1,6} |---|\[!|=+\s*$)/;

/** A line that may be a table row, if a table is what it belongs to. */
const TABLE_ROW = /^\s*\|/;

/**
 * The row of dashes under a table's header, which is what makes it a table.
 *
 * A pipe is ordinary punctuation until one of these follows it. Without the
 * check, `| a | b | mesmo` — a line of prose that happens to open with a pipe,
 * or one lazily continuing the paragraph above it — was cut into cells the
 * reader never sees, a run spanning the pipe marked when the note is read and
 * lost while it is written.
 *
 * A pipe of its own is wanted as well as the dashes: a row of dashes alone is
 * the rule under a heading written the other way, and the line above one is
 * that heading, not a header. `TABLE_ROW` asks the header to open on a pipe,
 * so the row vouching for it carries one too.
 */
const DELIMITER_ROW = /^(?=.*\|)[\s:|-]*-[\s:|-]*$/;

/** What a line says once its quote markers are taken off. */
function unquoted(text: string): string {
  return text.replace(/^(\s*>)+\s?/, '');
}

/**
 * Blank out what is not prose, keeping every other character where it was.
 *
 * The stand-in is as long as what it replaces, so a run's place in the source
 * is still its place after masking — and being a character no delimiter can be
 * read from, `,,rode `ls` agora,,` stays one aside, and `,,Refs: [[Sl 26.4]].,,`
 * one aside holding a link, without either being read for delimiters.
 */
function mask(text: string): string {
  return text.replace(NOT_PROSE, (found) =>
    (found[0] === '`' || found[0] === '$' ? OPAQUE : LABEL).repeat(
      found.length,
    ),
  );
}

/** Whether a run's content is anything of the note's own, or only stand-ins. */
function prose(text: string): boolean {
  return text.split(OPAQUE).join('') !== '';
}

/** Whether anything is selected, or the cursor sits, within `from`-`to`. */
function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/**
 * The line a run of a kind lends its size to, when it covers one whole.
 *
 * A span at four fifths of the size does not shrink the line it sits in: the
 * height of the line is struck from the size of the line itself, and the editor
 * draws one line per line of the source. A note whose aside runs over three of
 * them is small text at full-size spacing, which is the one thing an aside is
 * not. Where a whole line is inside the run, the line takes the size and the
 * spacing follows. Only the small does this; a raised digit belongs on a line
 * of ordinary height.
 */
const LINES: Record<string, Decoration> = {
  'kcp-small': Decoration.line({ class: 'kcp-small-line' }),
};

/**
 * Mark every run of one block of prose, if any of it is on screen.
 *
 * `hiding` is live preview, where a delimiter is taken off the page until the
 * cursor asks for it. Source mode shows a note as it is written and keeps them.
 */
function markBlock(
  state: EditorState,
  from: number,
  to: number,
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  // A note is drawn a screenful at a time; the rest of it is not worth reading.
  if (!visible.some((range) => range.from <= to && range.to >= from)) return;

  const masked = mask(state.doc.sliceString(from, to));
  for (const run of runsIn(masked, from)) {
    // A run whose whole content is code has nothing of its own to mark, and
    // reading view leaves it as the note wrote it. Do the same here.
    if (!prose(masked.slice(run.contentFrom - from, run.contentTo - from))) {
      continue;
    }
    into.push(
      Decoration.mark({ class: run.mark.cls }).range(
        run.contentFrom,
        run.contentTo,
      ),
    );
    const line = LINES[run.mark.cls];
    if (line) {
      const first = state.doc.lineAt(run.from);
      const last = state.doc.lineAt(run.to);
      for (let number = first.number; number <= last.number; number++) {
        const covered = state.doc.line(number);
        // A line the run only reaches into keeps its height, the rest of it
        // being ordinary text that would be shrunk along with the aside.
        if (covered.from >= run.from && covered.to <= run.to) {
          into.push(line.range(covered.from));
        }
      }
    }

    // Inside the run, the delimiters are what is being edited.
    if (!hiding || touched(state, run.from, run.to)) continue;
    into.push(Decoration.replace({}).range(run.from, run.contentFrom));
    into.push(Decoration.replace({}).range(run.contentTo, run.to));
  }
}

/**
 * Mark each cell of a table row on its own.
 *
 * A row is one line but not one block: every cell of it is drawn in a box of
 * its own, and a run opened in one has no business closing in the next, with
 * the pipe between them marked along the way. The pipes are what bound them,
 * bar one written `\\|`, which is a pipe the cell holds rather than its end.
 */
function markCells(
  state: EditorState,
  line: { from: number; to: number; text: string },
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  let at = line.from;
  for (let index = 0; index < line.text.length; index++) {
    if (line.text[index] !== '|' || line.text[index - 1] === '\\') continue;
    const pipe = line.from + index;
    if (pipe > at) markBlock(state, at, pipe, visible, hiding, into);
    at = pipe + 1;
  }
  // What follows the last pipe, a row being free to leave the closing one off.
  if (at < line.to) markBlock(state, at, line.to, visible, hiding, into);
}

/**
 * Every decoration the marks ask for, over what `visible` covers.
 *
 * Runs are read a block at a time, a block being a run of lines with no blank
 * one among them, and none of it code — the same bound reading view gets for
 * free by being handed one rendered block at a time, and what keeps a run
 * inside its paragraph.
 */
export function build(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): DecorationSet {
  // Source mode is the note as it is written, markup and all: Obsidian draws
  // the bold of `**forte**` there and leaves both pairs of asterisks standing,
  // and a mark of the plugin's own has no business being quieter about it.
  // Absent, as in a state built by hand, take it for live preview.
  const hiding = state.field(editorLivePreviewField, false) ?? true;
  const into: Range<Decoration>[] = [];
  let code = false;
  let table = false;
  let tableDepth = 0;
  let depth = 0;
  let codeDepth = 0;
  let from: number | null = null;
  let to = 0;
  // Past the foot of what is on screen, a line can still be read — the block
  // straddling the bottom has to be finished for a run to close in it — but
  // once that block is closed there is nothing below it worth walking.
  const bottom = visible.length ? visible[visible.length - 1].to : -1;

  const close = () => {
    if (from !== null) markBlock(state, from, to, visible, hiding, into);
    from = null;
  };

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    if (line.from > bottom && from === null) break;
    // What a quote is quoting: everything a line says once its markers are
    // taken off, and the markers themselves. A quote holds whole blocks of its
    // own — code, lists, headings, tables, blank lines — and none of them
    // would be recognised through the markers standing in front of them.
    const said = unquoted(line.text);
    const prefix = line.text.slice(0, line.text.length - said.length);
    // How deep in quotes the line is written, which is all the markers say
    // that matters: whether one is spaced `> ` or `>` is nobody's business.
    const quoted = (prefix.match(/>/g) ?? []).length;

    // A code block ends on a fence written as deep as the one that opened it.
    // A quoted fence closes a quoted block; the same line inside an unquoted
    // one is part of what that block holds, and closes nothing.
    if (CODE_BLOCK.test(said) && (!code || quoted === codeDepth)) {
      code = !code;
      codeDepth = quoted;
      table = false;
      close();
      continue;
    }
    if (code) {
      close();
      continue;
    }

    // A quote's own blank line is written with its markers and nothing else.
    if (!said.trim()) {
      table = false;
      close();
      continue;
    }
    // A quote interrupts the paragraph above it, and so does a quote written
    // inside one. Only going deeper ends a block: a line shallower than the one
    // before it is that paragraph still being written, which Markdown reads as
    // part of the quote it started in.
    if (quoted > depth) close();
    depth = quoted;

    if (NEW_BLOCK.test(said)) close();

    // A table opens on a row the dashes vouch for, and every row after it is
    // one until something that is not a row ends it — every row written as
    // deep as the header was, a quote holding a table of its own or none.
    const row =
      TABLE_ROW.test(said) &&
      ((table && quoted === tableDepth) ||
        (number < state.doc.lines &&
          DELIMITER_ROW.test(unquoted(state.doc.line(number + 1).text))));
    if (row) {
      table = true;
      tableDepth = quoted;
      close();
      markCells(state, line, visible, hiding, into);
      continue;
    }
    table = false;

    if (from === null) from = line.from;
    to = line.to;
    if (ONE_LINE.test(said)) close();
  }
  close();

  return Decoration.set(into, true);
}

/** What the editor is given: the decorations, kept up with what it shows. */
export class LiveMarks implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = build(view.state, view.visibleRanges);
  }

  update(update: ViewUpdate) {
    // The selection among them: a run reveals its delimiters when the cursor
    // arrives, and hides them again when it leaves. And the view the editor is
    // drawing, which decides whether a delimiter is taken off the page at all —
    // switching to source mode moves neither the note nor the cursor, and the
    // marks would otherwise stay as live preview left them.
    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      update.state.field(editorLivePreviewField, false) !==
        update.startState.field(editorLivePreviewField, false)
    ) {
      this.decorations = build(update.view.state, update.view.visibleRanges);
    }
  }
}

export const liveMarks = ViewPlugin.fromClass(LiveMarks, {
  decorations: (marks) => marks.decorations,
});
