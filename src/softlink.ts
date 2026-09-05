/**
 * The `((nota|rótulo))` syntax: a link the note draws and the vault does not
 * count.
 *
 * A book note indexes every chapter of its book — Salmos alone writes 150 of
 * them, and 307 links counting the lists that repeat one — and Obsidian draws
 * a graph edge for every `[[wikilink]]` it finds. One note fans out into 150
 * edges and the graph is unreadable. What is wanted is the navigation without
 * the relationship: a click that opens the chapter, and nothing entering
 * `resolvedLinks` on the way.
 *
 * So the token is written in something Obsidian's own scanner cannot read as a
 * link, and turned into one only at the moment it is drawn. That means the
 * links are invisible everywhere the link cache is read, not only in the graph:
 * no backlink, no outgoing link, no count, no dataview `file.outlinks`. That is
 * the whole point of them, and `README.md` says so where a reader will find it.
 *
 * `((...))` is the delimiter because the alternatives fail: `[[[...]]]` holds
 * `[[`, so the edge is drawn anyway; `[...]` is dataview's inline field syntax,
 * and dataview is installed here; `{{...}}` is Templater's, which is not
 * installed but would be a standing worry. Roam writes block references
 * `((uid))`, which is a different app and only a coincidence of naming.
 *
 * Here is only the reading of it, against plain text and knowing nothing of
 * where that text came from. `softlink-read.ts` reads a rendered note this way
 * and `softlink-live.ts` an editor.
 */

/** One link the note draws itself. */
export interface SoftLink {
  /** The opening delimiter's first character. */
  from: number;
  /** Past the closing delimiter's last. */
  to: number;
  /** Target and any anchor, as `openLinkText` wants it. */
  path: string;
  /** What the page shows: the display text, or the whole link text. */
  text: string;
}

/**
 * One token, its target in the first group and any display text in the second.
 *
 * The target is one run of characters with no space among them, which is what
 * keeps ordinary prose out: a parenthetical is a sentence, and a sentence has
 * spaces in it, so `((veja o salmo) e o resto)` is left as the note wrote it.
 * Parentheses are barred from both parts for the same reason — a nested
 * parenthetical closes on `) ` rather than `))` and never matches at all — and
 * brackets with them, so a wikilink written inside a token is not a token, and
 * the edge it would draw is never in question.
 *
 * The display may hold spaces, being prose: `Sl 103.10` is what such a link is
 * usually called. It may not be blank, an empty label leaving nothing on the
 * page to click.
 *
 * The trimming of the display's surrounding spaces happens after the match, in
 * `softLinksIn`, not here. A pattern that trims itself needs a lazy quantifier
 * around the spaces to know where they end, and a lazy quantifier next to
 * `[ \t]*` gives the engine a run it can split however many ways — every one of
 * them tried before it gives up on an unterminated token, which made an
 * unclosed `((a|` followed by a long run of spaces take seconds to fail on.
 * Matching the whole run greedily and trimming the string afterward keeps the
 * same result in linear time.
 *
 * Nothing is written as `.`, which would match the newline between two lines and
 * let a token reach out of the one it opened in.
 */
const LINK = /\(\(([^\s()[\]|\n]+)(?:\|([^()[\]|\n]*))?\)\)/g;

/**
 * Every link in `text`, in the order they were written, counted from `offset`.
 *
 * The text handed over may be a whole note: a token is one line's business and
 * cannot reach past it, so nothing here needs to know where a block ends.
 */
export function softLinksIn(text: string, offset = 0): SoftLink[] {
  const found: SoftLink[] = [];
  LINK.lastIndex = 0;
  let match = LINK.exec(text);
  while (match) {
    const path = match[1];
    const display = match[2]?.trim();
    // A token written `((a|))` says it wants a label and gives none — and so
    // does one written `((a|  ))`, the spaces trimmed away leaving nothing.
    // Reading it as an unaliased link would put the file name on the page
    // instead, which is not what was asked for either; it is left as the note
    // wrote it.
    if (display !== '') {
      const from = offset + match.index;
      found.push({
        from,
        to: from + match[0].length,
        path,
        text: display === undefined ? path : display,
      });
    }
    match = LINK.exec(text);
  }
  return found;
}
