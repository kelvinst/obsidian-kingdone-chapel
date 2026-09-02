/**
 * The `~sub~`, `^sup^` and `!!small!!` syntax: three marks Obsidian has no
 * Markdown for, and a `!!!` fence for a block of the last of them.
 *
 * Notes want all three often enough — a verse number beside a word, a footnote
 * marker of one's own, an aside said more quietly than the sentence around it —
 * and without a syntax each has to be written as a raw tag in the middle of the
 * prose. A CSS snippet cannot add one: nothing marks the passage, so there is
 * nothing for a rule to select.
 *
 * The sub and sup delimiters are the ones Pandoc and markdown-it use, so a note
 * carrying them still reads as intended outside this vault; neither ecosystem
 * has a small, and an exclamation is free of Markdown, only ever meaning
 * anything in front of a bracket. All three are free of Obsidian too:
 * strikethrough takes two tildes, and a lone caret means something only at the
 * end of a line, where it names a block.
 *
 * A run reaches as far as bold and italic do, and stops where they stop: across
 * a soft line break, through the middle of a link or an emphasis, but never out
 * of the paragraph it started in. An aside of several paragraphs is what the
 * fence is for — three exclamations on a line of their own, opening and closing
 * a block of them the way three backticks are the block form of one.
 *
 * Here is only the reading of it, against plain text and knowing nothing of
 * where that text came from. `marks.ts` reads a rendered note this way and
 * `live.ts` an editor, and what each does with a run is its own.
 */

/** What a run is marked as, one per capturing group of `RUN`, in that order. */
export interface Mark {
  tag: string;
  cls: string;
}

export const MARKS: Mark[] = [
  { tag: 'sub', cls: 'kcp-sub' },
  { tag: 'sup', cls: 'kcp-sup' },
  { tag: 'span', cls: 'kcp-small' },
];

/**
 * One run of any of the three kinds, its text in the group that matched.
 *
 * All three are read the same way. Neither end of a run may be a space, which
 * is what keeps a delimiter written as itself — `a ~ b ~ c` — from opening one;
 * and a run may not hold its own delimiter, which is what closes `~um~ e ~dois~`
 * twice rather than once. The tilde is barred from touching another tilde
 * besides, so `~~riscado~~` stays strikethrough.
 *
 * A small is the exception to holding its own delimiter: prose is full of single
 * exclamations, so only a doubled one closes a run. Neither end of one may touch
 * a third, which is what keeps a fence line from being read as an inline run.
 *
 * Nothing in any of them is written as `.`, which would not match the newline a
 * soft line break joins as.
 */
const RUN =
  /(?<!~)~([^~\s](?:[^~]*?[^~\s])?)~(?!~)|\^([^^\s](?:[^^]*?[^^\s])?)\^|!!(?![\s!])((?:(?!!!)[\s\S])*?[^\s])!!(?!!)/g;

/** Where one run sits, delimiters and all, and what it is marked as. */
export interface Run {
  /** The opening delimiter's first character. */
  from: number;
  /** Past the closing delimiter's last. */
  to: number;
  /** The text between the delimiters. */
  contentFrom: number;
  contentTo: number;
  mark: Mark;
}

/**
 * Every run in `text`, in the order they were written, counted from `offset`.
 *
 * The text handed over is one block's worth and no more. Nothing here knows
 * where a paragraph ends, so a caller that lets two of them through will get a
 * run spanning both.
 */
export function runsIn(text: string, offset = 0): Run[] {
  const out: Run[] = [];
  RUN.lastIndex = 0;
  let match = RUN.exec(text);
  while (match) {
    const group = match[1] !== undefined ? 1 : match[2] !== undefined ? 2 : 3;
    // Both delimiters are the same width, whichever kind of run this is.
    const delimiter = (match[0].length - match[group].length) / 2;
    const from = offset + match.index;
    const to = from + match[0].length;
    out.push({
      from,
      to,
      contentFrom: from + delimiter,
      contentTo: to - delimiter,
      mark: MARKS[group - 1],
    });
    match = RUN.exec(text);
  }
  return out;
}

/** A line of its own holding nothing but the fence. */
const FENCE = /^!!!$/;

/** Whether `line` is a fence, whatever it is padded with. */
export function isFence(line: string): boolean {
  return FENCE.test(line.trim());
}

/** The lines a fence opens and closes on, in the order they were written. */
function readFences(source: string): [number, number][] {
  const out: [number, number][] = [];
  const lines = source.split('\n');
  let open: number | null = null;
  for (let line = 0; line < lines.length; line++) {
    if (!isFence(lines[line])) continue;
    if (open === null) open = line;
    else {
      out.push([open, line]);
      open = null;
    }
  }
  // A fence left open closes nothing, and its line stays as it was written.
  return out;
}

/**
 * The fences of the note last asked about.
 *
 * Reading view renders a section at a time, so every block of a note asks this
 * same question of the same source, one after another. Reading it once is the
 * difference between walking a chapter's lines once and walking them per verse.
 */
let lastSource = '';
let lastFences: [number, number][] = [];

export function fencesOf(source: string): [number, number][] {
  if (source !== lastSource) {
    lastSource = source;
    lastFences = readFences(source);
  }
  return lastFences;
}
