import type { MarkdownPostProcessorContext } from 'obsidian';

/**
 * The `~sub~`, `^sup^` and `!!small!!` syntax: three marks Obsidian has no
 * Markdown for, and a `!!!` fence for a block of the last of them.
 *
 * Notes want all three often enough — a verse number beside a word, a footnote
 * marker of one's own, an aside said more quietly than the sentence around it —
 * and without a syntax each has to be written as a raw tag in the middle of the
 * prose. A CSS snippet cannot add one: nothing in the rendered output marks the
 * passage, so there is nothing for a rule to select. The marking is what this
 * does.
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
 * The delimiters are dropped rather than hidden: reading view is finished text,
 * with no cursor that could ever want them back.
 */

/** What a run is marked as, one per capturing group of `RUN`, in that order. */
interface Mark {
  tag: string;
  cls: string;
}

const MARKS: Mark[] = [
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

/**
 * What stands in the gathered text for a stretch that is not prose. It is a
 * character a run may reach across but can never be closed on, so `--a `x` b--`
 * is still one aside without the code inside it being read for delimiters.
 */
const OPAQUE = '￼';

/**
 * The elements a paragraph's text flows through. Anything else — another
 * paragraph, a list, a table cell — is a block of its own, and a run stops at
 * it the way bold and italic do.
 */
const INLINE = new Set([
  'A',
  'ABBR',
  'B',
  'BDI',
  'BDO',
  'BR',
  'CITE',
  'CODE',
  'DATA',
  'DEL',
  'DFN',
  'EM',
  'I',
  'IMG',
  'INS',
  'KBD',
  'LABEL',
  'MARK',
  'Q',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
  'VAR',
  'WBR',
]);

/** Where one text node's text sits in the block gathered around it. */
interface Piece {
  node: Text;
  at: number;
}

/** A block's text, and the nodes it was gathered from. */
interface Block {
  text: string;
  pieces: Piece[];
}

/** What one stretch of a text node becomes: a mark, or nothing at all. */
interface Op {
  from: number;
  to: number;
  mark: Mark | null;
}

/**
 * Elements whose text is not prose and must be left exactly as written: code,
 * inline and fenced alike, and rendered maths, where `^` is an exponent and a
 * `~` is the author's own.
 */
function verbatim(el: Element): boolean {
  return (
    el.tagName === 'CODE' ||
    el.tagName === 'PRE' ||
    el.classList.contains('math')
  );
}

/** Gather `el`'s text into `block`, painting any block-level child on its own. */
function gather(el: HTMLElement, block: Block) {
  // A live child list would be walked into the fragments painting leaves behind.
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      block.pieces.push({ node: text, at: block.text.length });
      block.text += text.data;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const child = node as HTMLElement;
    if (verbatim(child)) block.text += OPAQUE;
    else if (child.tagName === 'BR') block.text += '\n';
    else if (INLINE.has(child.tagName)) gather(child, block);
    else {
      // A block of its own: whatever was being gathered ends here.
      paint(block);
      block.text = '';
      block.pieces = [];
      markInline(child);
    }
  }
}

/** Note `from`-`to` of the block's text, on each node it covers. */
function note(
  block: Block,
  from: number,
  to: number,
  mark: Mark | null,
  ops: Map<Text, Op[]>,
) {
  for (const piece of block.pieces) {
    const end = piece.at + piece.node.data.length;
    if (end <= from || piece.at >= to) continue;
    const list = ops.get(piece.node) ?? [];
    list.push({
      from: Math.max(from, piece.at) - piece.at,
      to: Math.min(to, end) - piece.at,
      mark,
    });
    ops.set(piece.node, list);
  }
}

/** Rebuild one text node as its marks and the plain text between them. */
function rewrite(node: Text, ops: Op[]) {
  const value = node.data;
  const doc = node.ownerDocument;
  const out = doc.createDocumentFragment();
  let at = 0;
  for (const op of ops) {
    if (op.from > at)
      out.appendChild(doc.createTextNode(value.slice(at, op.from)));
    if (op.mark) {
      const mark = doc.createElement(op.mark.tag);
      // Its own class as well as the tag, so the plugin's styling stays off a
      // `<sub>` or `<sup>` a note writes by hand.
      mark.className = op.mark.cls;
      mark.textContent = value.slice(op.from, op.to);
      out.appendChild(mark);
    }
    at = op.to;
  }
  if (at < value.length) out.appendChild(doc.createTextNode(value.slice(at)));
  node.replaceWith(out);
}

/** Mark every run in the text gathered so far, across the nodes it came from. */
function paint(block: Block) {
  if (!block.pieces.length) return;

  const ops = new Map<Text, Op[]>();
  RUN.lastIndex = 0;
  let match = RUN.exec(block.text);
  while (match) {
    const group = match[1] !== undefined ? 1 : match[2] !== undefined ? 2 : 3;
    const start = match.index;
    const end = start + match[0].length;
    // Both delimiters are the same width, whichever kind of run this is.
    const delimiter = (match[0].length - match[group].length) / 2;
    note(block, start, start + delimiter, null, ops);
    note(block, start + delimiter, end - delimiter, MARKS[group - 1], ops);
    note(block, end - delimiter, end, null, ops);
    match = RUN.exec(block.text);
  }

  for (const [node, list] of ops) rewrite(node, list);
}

/**
 * Mark every run under `el`.
 *
 * A run is read against a whole block rather than one text node, so it holds
 * together across a soft line break and through the middle of an emphasis or a
 * link. What it becomes is one mark per node it touches — two halves of a
 * `<sub>` either side of a `<br>` read as the one the note wrote.
 */
function markInline(el: HTMLElement) {
  const block: Block = { text: '', pieces: [] };
  gather(el, block);
  paint(block);
}

/** A line of its own holding nothing but the fence. */
const FENCE = /^!!!$/;

/** The lines a fence opens and closes on, in the order they were written. */
function readFences(source: string): [number, number][] {
  const out: [number, number][] = [];
  const lines = source.split('\n');
  let open: number | null = null;
  for (let line = 0; line < lines.length; line++) {
    if (!FENCE.test(lines[line].trim())) continue;
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

function fencesOf(source: string): [number, number][] {
  if (source !== lastSource) {
    lastSource = source;
    lastFences = readFences(source);
  }
  return lastFences;
}

/** Empty `el`, the fence line itself being no part of what the note says. */
function hide(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Mark every run under `el`, as a markdown post-processor.
 *
 * The fence cannot be paired here: the two ends of one are separate sections of
 * the note, and reading view hands them over in separate calls. So each call
 * decides alone, asking the note's source where the fences are and where the
 * lines it was given fall — a fence line is emptied, and everything between a
 * pair is marked small as a whole, paragraphs and all.
 */
export function renderMarks(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) {
  // No source to read means no section to place: an embed, a canvas, a card of
  // the plugin's own. The inline marks still stand on their own.
  const info = ctx.getSectionInfo(el);
  if (info) {
    for (const [open, close] of fencesOf(info.text)) {
      if (info.lineStart === open || info.lineStart === close) {
        hide(el);
        return;
      }
      if (info.lineStart > open && info.lineEnd < close) {
        el.classList.add('kcp-small');
        break;
      }
    }
  }
  markInline(el);
}
