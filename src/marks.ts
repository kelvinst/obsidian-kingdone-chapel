import { runsIn } from './syntax';
import type { Mark } from './syntax';

/**
 * The three marks in a rendered note.
 *
 * `syntax.ts` reads the runs; here they are cut into the rendered page. The
 * delimiters are dropped rather than hidden: reading view is finished text,
 * with no cursor that could ever want them back.
 */

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
  /**
   * The same text with a link's label blanked out, which is what the runs are
   * read from.
   *
   * A link's label is not always only a label: one written without an alias
   * shows its target, and a target carries the caret of a block anchor. A row
   * of two of them would otherwise read as one long superscript — the tail of
   * the first link, the punctuation between them, and the head of the second.
   *
   * The stand-in is as long as what it replaces, so a run's place in the text
   * is its place here too, and the pieces are gathered either way: a run may
   * still cover a link and mark it, it just cannot be opened or closed inside
   * one.
   */
  masked: string;
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

/**
 * Gather `el`'s text into `block`, painting any block-level child on its own.
 *
 * `linked` says the text being gathered is a link's label, which is kept out of
 * what the runs are read from.
 */
function gather(el: HTMLElement, block: Block, linked = false) {
  // A live child list would be walked into the fragments painting leaves behind.
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      block.pieces.push({ node: text, at: block.text.length });
      block.text += text.data;
      block.masked += linked ? OPAQUE.repeat(text.data.length) : text.data;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const child = node as HTMLElement;
    if (verbatim(child)) {
      block.text += OPAQUE;
      block.masked += OPAQUE;
    } else if (child.tagName === 'BR') {
      block.text += '\n';
      block.masked += '\n';
    } else if (INLINE.has(child.tagName)) {
      gather(child, block, linked || child.tagName === 'A');
    } else {
      // A block of its own: whatever was being gathered ends here.
      paint(block);
      block.text = '';
      block.masked = '';
      block.pieces = [];
      renderMarks(child);
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

/** Whether any of the block's pieces holds part of `from`-`to`. */
function covered(block: Block, from: number, to: number): boolean {
  return block.pieces.some(
    (piece) => piece.at < to && piece.at + piece.node.data.length > from,
  );
}

/**
 * `value`'s `from`-`to` as marks and the plain text between them, taking the
 * ops from `cursor` on and leaving it past the last one used.
 *
 * A mark may hold another — a formula inside an aside — so the ops are a tree
 * rather than a list, and one that opens inside another is built inside it. The
 * ops of a run written inside another follow it, and each is enclosed by it, so
 * the mark being built simply takes whatever it reaches over.
 */
function fill(
  doc: Document,
  value: string,
  ops: Op[],
  cursor: { at: number },
  from: number,
  to: number,
): DocumentFragment {
  const out = doc.createDocumentFragment();
  let at = from;
  while (cursor.at < ops.length && ops[cursor.at].from < to) {
    const op = ops[cursor.at++];
    if (op.from > at) {
      out.appendChild(doc.createTextNode(value.slice(at, op.from)));
    }
    if (op.mark) {
      const mark = doc.createElement(op.mark.tag);
      // Its own class as well as the tag, so the plugin's styling stays off a
      // `<sub>` or `<sup>` a note writes by hand.
      mark.className = op.mark.cls;
      mark.appendChild(fill(doc, value, ops, cursor, op.from, op.to));
      out.appendChild(mark);
    }
    at = op.to;
  }
  if (at < to) out.appendChild(doc.createTextNode(value.slice(at, to)));
  return out;
}

/** Rebuild one text node as its marks and the plain text between them. */
function rewrite(node: Text, ops: Op[]) {
  // In the order they are written, and where two open together the wider
  // first, so a mark is built before whatever it holds.
  ops.sort((a, b) => a.from - b.from || b.to - a.to);
  node.replaceWith(
    fill(node.ownerDocument, node.data, ops, { at: 0 }, 0, node.data.length),
  );
}

/** Mark every run in the text gathered so far, across the nodes it came from. */
function paint(block: Block) {
  if (!block.pieces.length) return;

  const ops = new Map<Text, Op[]>();
  for (const run of runsIn(block.masked)) {
    // A run whose whole content is a stand-in — an aside of nothing but code —
    // has no text of its own to mark, and dropping its delimiters would take
    // them off the page with nothing to show for them.
    if (!covered(block, run.contentFrom, run.contentTo)) continue;
    note(block, run.from, run.contentFrom, null, ops);
    note(block, run.contentFrom, run.contentTo, run.mark, ops);
    note(block, run.contentTo, run.to, null, ops);
  }

  for (const [node, list] of ops) rewrite(node, list);
}

/**
 * Mark every run under `el`, as a markdown post-processor.
 *
 * A run is read against a whole block rather than one text node, so it holds
 * together across a soft line break and through the middle of an emphasis or a
 * link. What it becomes is one mark per node it touches — two halves of a
 * `<sub>` either side of a `<br>` read as the one the note wrote.
 */
export function renderMarks(el: HTMLElement) {
  const block: Block = { text: '', masked: '', pieces: [] };
  gather(el, block);
  paint(block);
}
