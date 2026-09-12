/**
 * Keeping a soft link on one line when Prettier formats a note.
 *
 * Prettier's markdown printer knows a wikilink and prints it whole, letting the
 * line run past the width rather than breaking inside it. `((...))` is this
 * plugin's own syntax, which the printer has never heard of, so it is plain
 * prose to it and every space inside an alias is a break opportunity like any
 * other — a link split across two lines, which is a link that no longer
 * resolves.
 *
 * The printer's `preprocess` splits each sentence into `word` and `whitespace`
 * children, each carrying the text it stands for and nothing else: no position,
 * no span into the source. That is the place to work. Joining the values gives
 * the sentence back as text, every link in it covers a run of those children,
 * and a run replaced by one `word` is a link the printer has nowhere to break.
 *
 * Doing the same a step earlier, on the parsed tree, is what this avoids: a node
 * synthesized there has to carry a position, and a position spanning a line
 * break drags its container's line prefix — a list's indent, a quote's `>` —
 * into what the printer slices out. That costs characters on every format.
 */

import { softLinksIn } from './softlink';

/** A child of a sentence, as the printer's `preprocess` leaves it. */
export interface InlineNode {
  type: string;
  value?: string;
  children?: InlineNode[];
  [key: string]: unknown;
}

/** What a child stands for in the sentence's text, which only a word has. */
function textOf(node: InlineNode): string {
  return node.value ?? '';
}

/**
 * One sentence's children, every soft link in it merged into a single word.
 *
 * A link covers whatever run of children its text falls in, and the whole of
 * each: a link glued to the punctuation around it — `(((a|Sl 1.1))).` — is one
 * word already, and a link the printer split across three is three. Merging the
 * run rather than the exact span is what keeps the merged word's text equal to
 * the text it replaced, which is the whole correctness argument.
 *
 * The array itself comes back where no link was found, so a caller can tell a
 * sentence that was left alone from one that was rebuilt.
 */
export function gluedSentence(children: InlineNode[]): InlineNode[] {
  const text = children.map(textOf).join('');
  // A link already broken by an earlier format run has a `\n` where a space
  // used to be — `softLinksIn` bars `\n` from a token on purpose, so it would
  // never find that link again. Searching the text with every newline stood
  // in for by a space finds it once more, and since the two are both one
  // character the swap costs nothing: every offset below still lands on the
  // same child it would have without it.
  const links = softLinksIn(text.replace(/\n/g, ' '));
  if (links.length === 0) return children;

  const out: InlineNode[] = [];
  let at = 0;
  let i = 0;
  while (i < children.length) {
    const from = at;
    const to = at + textOf(children[i]).length;
    const link = links.find((one) => one.from < to && one.to > from);
    if (!link) {
      out.push(children[i]);
      at = to;
      i++;
      continue;
    }
    // Every child the link reaches into, taken whole.
    let end = at;
    let j = i;
    while (j < children.length && end < link.to) {
      end += textOf(children[j]).length;
      j++;
    }
    const merged = children.slice(i, j);
    // A soft link opens on `(` and closes on `)`, both non-space, so
    // `splitText` always puts them in a `word` node: the run's first and
    // last children are words whatever falls between them.
    out.push({
      ...merged[0],
      type: 'word',
      // A `\n` a merged child still carries is the same soft break, rejoined
      // as the space markdown already reads it as — nothing about the
      // rendered prose changes, only the link's text becomes matchable again.
      value: merged.map(textOf).join('').replace(/\n/g, ' '),
      hasTrailingPunctuation:
        merged[merged.length - 1].hasTrailingPunctuation ?? false,
    });
    at = end;
    i = j;
  }
  return out;
}

/** The same tree, every sentence in it glued. */
export function glueSoftLinks<T>(node: T): T {
  const inline = node as InlineNode;
  if (!Array.isArray(inline.children)) return node;
  if (inline.type === 'sentence') {
    inline.children = gluedSentence(inline.children);
    return node;
  }
  inline.children = inline.children.map((child) => glueSoftLinks(child));
  return node;
}
