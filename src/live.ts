import { Decoration, ViewPlugin } from '@codemirror/view';
import type {
  DecorationSet,
  EditorView,
  PluginValue,
  ViewUpdate,
} from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';

import { fencesOf, runsIn } from './syntax';

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
 * source, and the fence is a line rather than a section. The reading of the
 * syntax is the same either way, and lives in `syntax.ts`.
 */

/** A stretch of source no run may be read out of: code, or maths. */
const OPAQUE = '￼';

/** Inline code and inline maths, neither of which is prose. */
const NOT_PROSE = /`[^`\n]*`|\$[^$\n]*\$/g;

/** A line opening or closing a code block. */
const CODE_BLOCK = /^\s*(?:```|~~~)/;

/**
 * Blank out what is not prose, keeping every other character where it was.
 *
 * The stand-in is as long as what it replaces, so a run's place in the source
 * is still its place after masking — and being a character no delimiter can be
 * read from, `!!rode `ls` agora!!` stays one aside without the code inside it
 * being read for delimiters.
 */
function mask(text: string): string {
  return text.replace(NOT_PROSE, (found) => OPAQUE.repeat(found.length));
}

/** Whether anything is selected, or the cursor sits, within `from`-`to`. */
function touched(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** What a fence makes of the line at `at`, counting from zero. */
function fenced(
  fences: [number, number][],
  at: number,
): 'edge' | 'inside' | null {
  for (const [open, close] of fences) {
    if (at === open || at === close) return 'edge';
    if (at > open && at < close) return 'inside';
  }
  return null;
}

/** The line a fence is written on, which is no part of what the note says. */
const HIDDEN = Decoration.line({ class: 'kcp-fence' });
/** And a line between a pair of them. */
const SMALL_LINE = Decoration.line({ class: 'kcp-small' });

/** Mark every run of one block of prose, if any of it is on screen. */
function markBlock(
  state: EditorState,
  from: number,
  to: number,
  visible: readonly { from: number; to: number }[],
  into: Range<Decoration>[],
) {
  // A note is drawn a screenful at a time; the rest of it is not worth reading.
  if (!visible.some((range) => range.from <= to && range.to >= from)) return;

  for (const run of runsIn(mask(state.doc.sliceString(from, to)), from)) {
    into.push(
      Decoration.mark({ class: run.mark.cls }).range(
        run.contentFrom,
        run.contentTo,
      ),
    );
    // Inside the run, the delimiters are what is being edited.
    if (touched(state, run.from, run.to)) continue;
    into.push(Decoration.replace({}).range(run.from, run.contentFrom));
    into.push(Decoration.replace({}).range(run.contentTo, run.to));
  }
}

/**
 * Every decoration the marks ask for, over what `visible` covers.
 *
 * Runs are read a block at a time, a block being a run of lines with no blank
 * one among them — the same bound reading view gets for free by being handed
 * one rendered block at a time, and what keeps a run inside its paragraph.
 */
export function build(
  state: EditorState,
  visible: readonly { from: number; to: number }[],
): DecorationSet {
  const fences = fencesOf(state.doc.toString());
  const into: Range<Decoration>[] = [];
  let code = false;
  let from: number | null = null;
  let to = 0;

  const close = () => {
    if (from !== null) markBlock(state, from, to, visible, into);
    from = null;
  };

  for (let number = 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number);
    if (CODE_BLOCK.test(line.text)) {
      code = !code;
      close();
      continue;
    }
    if (code) {
      close();
      continue;
    }

    const role = fenced(fences, number - 1);
    if (role === 'edge') {
      close();
      // On the line, the fence is being written, and has to be readable.
      if (!touched(state, line.from, line.to))
        into.push(HIDDEN.range(line.from));
      continue;
    }
    if (role === 'inside') into.push(SMALL_LINE.range(line.from));

    if (!line.text.trim()) {
      close();
      continue;
    }
    if (from === null) from = line.from;
    to = line.to;
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
    // arrives, and hides them again when it leaves.
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = build(update.view.state, update.view.visibleRanges);
    }
  }
}

export const liveMarks = ViewPlugin.fromClass(LiveMarks, {
  decorations: (marks) => marks.decorations,
});
