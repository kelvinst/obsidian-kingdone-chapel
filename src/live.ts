import { Decoration, ViewPlugin } from '@codemirror/view';
import type {
  DecorationSet,
  EditorView,
  PluginValue,
  ViewUpdate,
} from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNodeRef } from '@lezer/common';
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
 *
 * Where a run's block begins and ends is not: reading view is handed one
 * rendered block at a time and gets the bound for free, and the editor used
 * to guess it from the raw lines — a run of characters that look like a list
 * marker, a heading, a quote, a fence. Every kind of block Markdown has was
 * another guess to get right, and a quote or a code block or a table nested
 * inside another multiplied the guessing. Obsidian is already parsing the
 * note for its own syntax highlighting, and `syntaxTree` is the same parse:
 * asking it where a paragraph starts and ends is asking the one thing that
 * also decides where reading view's `<p>` starts and ends, rather than
 * reimplementing Markdown's block grammar one regex at a time.
 */

/**
 * A stretch of source with nothing of the note's own to show for it: code, or
 * maths, both of which a run may reach across but neither of which it may be
 * read out of. Also what a quote's own marker becomes, wherever it repeats
 * inside a run's block — see `proseText`.
 */
const OPAQUE = '￼';

/**
 * And one that does show something, only not what the source says: a link,
 * which stands on the page as its label. A run may hold one and mark it — an
 * aside that is only a reference is still an aside — it just cannot be opened
 * or closed inside the target.
 */
const LABEL = '�';

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
 * off and blank out everything between them, `!!Custa $5!! e $6` losing the
 * exclamations that close the aside along with the rest.
 */
const NOT_PROSE =
  /`[^`\n]*`|\$(?![\s$])[^$\n]*[^\s$]\$|!?\[\[[^\]\n]*\]\]|\[[^\]\n]*\]\([^)\n]*\)|\^[\w-]+(?=[ \t]*$)/gm;

/**
 * An embed, which is a block of its own wherever it is written.
 *
 * Reading view draws an embed's content in a frame, and the text either side of
 * it is no part of one paragraph with it: a run opened before an embed is
 * finished before it, whatever the note wrote after. Marked `flat` or not —
 * the frame is a matter of styling, and the content is a block either way.
 * `[[wikilink]]` on its own is not one of these: only the `!` in front of it
 * says the note is embedding the target rather than only naming it.
 */
const EMBED = /!\[\[[^\]\n]*\]\]/g;

/**
 * A callout's title line: `[!note]`, followed by whatever the note wrote after
 * it. A callout is written as an ordinary quote, and the grammar reads it as
 * one — its title and the paragraph under it are one lazy-continued paragraph,
 * exactly as an aside quoted over two lines is. But a callout draws its title
 * apart from the body under it, which the grammar has no way to know; this is
 * the one place `build` still reads the note's own syntax rather than asking
 * the tree.
 */
const CALLOUT_TITLE = /^\[!\w+\]/;

/**
 * The block types a run is read out of: a paragraph, a heading of either
 * kind, a table cell. Every other block a run stops at without being one
 * itself — a list item, a table row, a quote — is walked into rather than
 * read, on the way to the paragraphs it holds.
 */
const PROSE = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'TableCell',
]);

/**
 * What a run may never be read out of, whole: code and raw HTML, at the block
 * level as `verbatim` is at the element level in `marks.ts`. Left standing,
 * not walked into — nothing inside one is a block of its own to find.
 */
const SKIP = new Set(['FencedCode', 'CodeBlock', 'HTMLBlock', 'CommentBlock']);

/**
 * Blank out what is not prose, keeping every other character where it was.
 *
 * The stand-in is as long as what it replaces, so a run's place in the source
 * is still its place after masking — and being a character no delimiter can be
 * read from, `!!rode `ls` agora!!` stays one aside, and `!!Refs: [[Sl 26.4]].!!`
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
 * Read `text` for runs and decorate them — the same work reading view's
 * post-processor does over a rendered node, done here over a slice of source
 * already cleared of everything that is not prose. `from` is that slice's
 * place in the document, which `text` is the same length as.
 *
 * `hiding` is live preview, where a delimiter is taken off the page until the
 * cursor asks for it. Source mode shows a note as it is written and keeps them.
 */
function markRun(
  state: EditorState,
  from: number,
  text: string,
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  const to = from + text.length;
  // A note is drawn a screenful at a time; the rest of it is not worth reading.
  if (!visible.some((range) => range.from <= to && range.to >= from)) return;

  const masked = mask(text);
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
 * `[from, to)` as prose: its own text, with a quote's marker blanked out
 * wherever it repeats inside the span.
 *
 * A block nested in a quote is one node covering every line of it, markers
 * and all — the marker is not cut out of the range, only marked apart as its
 * own small node in the middle of the paragraph's. Left in, `> a\n> b` would
 * read its second `>` as part of the prose; blanked the same way code and
 * links already are, a quote read over several lines is one span of it,
 * however deep the quote nests.
 */
function proseText(state: EditorState, from: number, to: number): string {
  let text = state.doc.sliceString(from, to);
  syntaxTree(state).iterate({
    from,
    to,
    enter(node: SyntaxNodeRef) {
      if (node.name !== 'QuoteMark') return;
      const start = Math.max(node.from, from) - from;
      const end = Math.min(node.to, to) - from;
      text =
        text.slice(0, start) + OPAQUE.repeat(end - start) + text.slice(end);
    },
  });
  return text;
}

/**
 * `markRun` over the stretches of `text` lying either side of the embeds
 * written in it, `from` being where `text` sits in the document.
 *
 * An embed found here is read out of prose the marker is still standing in,
 * not yet masked — masking would blank its own `![[` and `]]` along with a
 * plain link's, and there would be nothing left to split on.
 */
function markAround(
  state: EditorState,
  from: number,
  text: string,
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  let at = 0;
  EMBED.lastIndex = 0;
  for (let found = EMBED.exec(text); found; found = EMBED.exec(text)) {
    if (found.index > at) {
      markRun(
        state,
        from + at,
        text.slice(at, found.index),
        visible,
        hiding,
        into,
      );
    }
    at = found.index + found[0].length;
  }
  // And what follows the last of them, an embed being free to end the block.
  if (at < text.length)
    markRun(state, from + at, text.slice(at), visible, hiding, into);
}

/** `markAround` a block found to hold prose, `[from, to)` in the document. */
function handleProse(
  state: EditorState,
  from: number,
  to: number,
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  markAround(state, from, proseText(state, from, to), visible, hiding, into);
}

/**
 * `handleProse` a block the tree found, splitting a callout's title off first.
 *
 * The tree reads a callout as an ordinary quote, its title and the body under
 * it one paragraph — the split only Obsidian's own reading of `[!note]` asks
 * for, and the one thing here that is not simply asking the tree where a
 * block lies.
 */
function markNode(
  state: EditorState,
  node: SyntaxNodeRef,
  visible: readonly { from: number; to: number }[],
  hiding: boolean,
  into: Range<Decoration>[],
) {
  if (node.name === 'Paragraph') {
    const first = state.doc.lineAt(node.from);
    const title = first.text.slice(node.from - first.from);
    if (CALLOUT_TITLE.test(title) && node.to > first.to) {
      handleProse(state, node.from, first.to, visible, hiding, into);
      const body = state.doc.line(first.number + 1);
      handleProse(state, body.from, node.to, visible, hiding, into);
      return;
    }
  }
  handleProse(state, node.from, node.to, visible, hiding, into);
}

/**
 * Every decoration the marks ask for, over what `visible` covers.
 *
 * The tree is walked once, over the outer bound of what is on screen: a block
 * that is prose is read for its runs and not descended into further: it holds
 * no block of its own. Anything else — a quote, a list, a list item, a table
 * and its rows — holds nothing to mark by itself and is walked into, on the
 * way to whatever prose it is holding. Code and raw HTML hold nothing to be
 * walked into at all.
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
  const from = visible.length ? visible[0].from : 0;
  const to = visible.length ? visible[visible.length - 1].to : 0;

  syntaxTree(state).iterate({
    from,
    to,
    enter(node: SyntaxNodeRef) {
      if (SKIP.has(node.name)) return false;
      if (PROSE.has(node.name)) {
        markNode(state, node, visible, hiding, into);
        return false;
      }
      return true;
    },
  });

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
