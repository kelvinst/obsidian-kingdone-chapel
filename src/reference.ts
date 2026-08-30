/**
 * Reading what a person typed after `@` as a Bible reference.
 *
 *   @Joao            the whole book
 *   @Joao 1          one chapter
 *   @Joao 1.1        one verse
 *   @Joao 1.1,2      two verses
 *   @Joao 1.1-3      the same as 1,2,3
 *   @ARA Joao 1.1    the same verse in a named version
 *   @Joao 1.1 ARA    the same, with the version said last
 *   @Joao 1.1 -ara   the same, written the way the finished link reads it,
 *                    which may sit anywhere in the reference
 *   @1               numbers alone, read against the passage the note is about
 *   @1.1             a chapter and verse of the book that passage is in
 *   @ARA 1           the same passage in a named version, as do `@1 ARA`,
 *                    `@1 -ara`, and `@ARA` on its own
 *
 * The text is still being typed, so half-written references (`@Joao 1.`,
 * `@Joao 1.1-`) have to parse into the most complete thing they can be. A bare
 * version name only reads as one once it is written in full — `@Joao 1 n` is
 * still a book name as far as this knows — which is what the dash is for: it
 * says a version is being written before there is enough of it to recognise,
 * and what follows it is read as far as it goes.
 *
 * The dash writes a run of verses too, so the spaces around it are what tell
 * the two apart: a run is written closed up, `1.1-3`, and a dash with a space
 * on either side of it is not one. `@Joao 1.1 - 3` is therefore verse 1 in a
 * version called `3`, and not verses 1 to 3.
 */

/** Verses one reference may expand to, so a typo cannot paste a whole chapter. */
const MAX_VERSES = 50;

export interface ParsedRef {
  /** Version named in the query, as typed, or null to use the default. */
  version: string | null;
  /**
   * Whether `version` is only as much of a name as has been typed. A marked
   * version is: `-n` is every version starting with an n, and a dash with
   * nothing after it yet is all of them. A version written without the mark
   * had to be recognised in full to be read as one at all.
   */
  versionPrefix: boolean;
  /** The book part, still as typed — resolving it needs the book table. */
  book: string;
  chapter: number | null;
  /** Verses asked for, in the order written, without duplicates. */
  verses: number[];
}

/**
 * Take the version out of `query`, wherever it was written, and hand back what
 * is left to be read as the reference. Shared by both parses, since a version
 * is written the same way whether or not a book was written with it.
 */
function takeVersion(
  query: string,
  isVersion: (word: string) => boolean
): { version: string | null; versionPrefix: boolean; text: string } {
  // A marked version is taken out wherever it sits, before anything else reads
  // the query, so the rest is a plain reference again. Nothing marks its end,
  // so it is read as a beginning: as much of a version name as is there yet.
  //
  // The dash also writes a run of verses, and the space in front of it is what
  // separates the two: a run is written closed up (`1.1-3`), so a dash with a
  // space before it is a version every time — including the dash that has no
  // name after it yet, which is the beginning of every version there is.
  const marked = query.match(/(?:^|\s)-\s?([\p{L}\p{N}]*)(?=\s|$)/u);
  if (marked) {
    const at = marked.index ?? 0;
    const text = query.slice(0, at) + ' ' + query.slice(at + marked[0].length);
    return { version: marked[1], versionPrefix: true, text };
  }

  // An unmarked version may come after the reference, the way it is said out
  // loud (`Joao 1 NVI`). It comes off first, so the chapter is still the last
  // number of what is left.
  const trailing = query.match(/^\s*(.*\S)\s+(\S+)\s*$/);
  if (trailing && isVersion(trailing[2])) {
    return { version: trailing[2], versionPrefix: false, text: trailing[1] };
  }

  return { version: null, versionPrefix: false, text: query };
}

/**
 * Split `query` (everything after the `@`) into its parts. `isVersion` says
 * whether an outer word names a version, which is the only way to tell
 * `@ARA Joao` from a two-word book name, or `@Joao ARA` from one whose name
 * carries on. A marked version says so itself, and is not asked.
 */
export function parseReference(query: string, isVersion: (word: string) => boolean): ParsedRef | null {
  const taken = takeVersion(query, isVersion);
  const { versionPrefix, text } = taken;
  let version = taken.version;

  // The chapter is the last bare number, so `1 Joao 1.1` splits after `Joao`.
  const m = text.match(/^\s*(.*?)\s+(\d+)\s*(?:[.:]\s*([\d,\s-]*))?\s*$/);
  let book = (m ? m[1] : text).trim();
  const chapter = m ? parseInt(m[2], 10) : null;
  const verses = m && m[3] !== undefined ? expandVerses(m[3]) : [];
  if (verses === null) return null; // more verses than a reference may carry

  // Or before it (`NVI Joao 1`), which is the only way to tell a version from
  // the first word of a two-word book name.
  const named = version !== null ? null : book.match(/^(\S+)\s+(.+)$/);
  if (named && isVersion(named[1])) {
    version = named[1];
    book = named[2];
  }

  return book ? { version, versionPrefix, book, chapter, verses } : null;
}

/**
 * `1,3-5` -> [1, 3, 4, 5], written closed up. A dash with a space in front of
 * it has been read as a version by now and never reaches here; one with a
 * space after it is not a run either, so that the two are told apart by the
 * same rule read from either side. An unfinished range (`3-`) is just its
 * start, and so is one written backwards (`5-1`) — a reference reaching for no
 * verse at all would be read below as a reference to the whole chapter.
 *
 * A reference asking for more than `MAX_VERSES` comes back as null rather than
 * as its first fifty: a passage quietly cut short says something other than
 * what was typed, and there is nothing in the finished links to show it was.
 */
function expandVerses(spec: string): number[] | null {
  const out: number[] = [];
  const seen = new Set<number>();
  /** False once the reference has outgrown the cap. */
  const add = (v: number): boolean => {
    if (v <= 0 || seen.has(v)) return true;
    seen.add(v);
    out.push(v);
    return out.length <= MAX_VERSES;
  };

  for (const part of spec.split(',')) {
    const range = part.trim().match(/^(\d+)-(\d*)$/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = range[2] ? parseInt(range[2], 10) : from;
      for (let v = from; v <= Math.max(from, to); v++) if (!add(v)) return null;
      continue;
    }
    const single = part.trim().match(/^\d+$/);
    if (single && !add(parseInt(single[0], 10))) return null;
  }
  return out;
}

/**
 * A reference written as numbers alone (`1`, `1,2,3`, `1-3`), for a note that
 * already says which passage it is about. There is no book in it to read, only
 * the numbers, which the caller reads against that passage.
 *
 * Anything carrying a letter is not one of these and comes back null, leaving
 * the query to be read as a book. A spec asking for more than a reference may
 * carry comes back null as well, for the reason given above.
 */
function parseNumbers(query: string): number[] | null {
  if (!/^[\d\s,-]+$/.test(query)) return null;
  return expandVerses(query);
}

/** A reference written with no book in it, for the note's own passage to fill. */
export interface ParsedBookless {
  /** Version named in the query, as typed, or null to keep the note's own. */
  version: string | null;
  /** Whether `version` is only as much of a name as has been typed, as above. */
  versionPrefix: boolean;
  /** Chapter written in front of the numbers (`1.1`), or null when none was. */
  chapter: number | null;
  /** Verses of that chapter; with no chapter, verses or chapters alike. */
  numbers: number[];
}

/**
 * Read `query` as a reference the note's own passage completes: `1`, `1.1`,
 * `ARA 1`, `1 ARA`, `1 -ara`, or a version on its own. Everything a reference
 * needs and does not say here is taken from that passage by the caller.
 *
 * Anything else — a book, named or half-typed — comes back null and is read in
 * full by `parseReference` instead, as does a spec asking for more verses than
 * a reference may carry.
 */
export function parseBookless(
  query: string,
  isVersion: (word: string) => boolean
): ParsedBookless | null {
  const taken = takeVersion(query, isVersion);
  let rest = taken.text.trim();
  let version = taken.version;

  // A version leads a reference too (`ARA Joao 1`), and with no book behind it
  // to be the rest of a name, a lone word that names a version is only ever
  // that: `@ARA` asks for the note's own passage in ARA.
  const lead = version === null ? rest.match(/^(\S+)(?:\s+([\s\S]*))?$/) : null;
  if (lead && isVersion(lead[1])) {
    version = lead[1];
    rest = (lead[2] || '').trim();
  }

  // A chapter written in front of the numbers says they are its verses; with
  // none there they are verses or chapters both, and stay numbers for the
  // caller to read either way.
  const spec = rest.match(/^(\d+)\s*[.:]\s*([\d,\s-]*)$/);
  const chapter = spec ? parseInt(spec[1], 10) : null;
  const numbers = spec ? expandVerses(spec[2]) : rest ? parseNumbers(rest) : [];
  if (numbers === null) return null;

  // Nothing was written that the note's passage does not already say.
  if (version === null && chapter === null && !numbers.length) return null;
  return { version, versionPrefix: taken.versionPrefix, chapter, numbers };
}

/**
 * How a reference reads in a note. The first link carries the whole reference
 * and the rest only their verse number, joined the way they were typed and the
 * way they are written by hand: `João 1.1,2,3`.
 *
 * A `version` is named at the very end, after the last verse, which is where
 * it is said and where it reads as belonging to the whole reference rather
 * than to the verse it happens to sit against: `João 1.1,2,3 - NVI`.
 */
export function verseLabels(
  book: string,
  chapter: number | null,
  verses: number[],
  version: string | null = null,
): string[] {
  const labels =
    chapter === null
      ? [book]
      : !verses.length
        ? [`${book} ${chapter}`]
        : verses.map((v, i) => (i === 0 ? `${book} ${chapter}.${v}` : String(v)));

  return nameVersion(labels, version);
}

/**
 * Say `version` at the end of a reference already labelled, for the rows that
 * write their labels themselves. It goes after the last of them, where it
 * reads as belonging to the whole reference; with no labels to end there is
 * nowhere to say it, and nothing is said.
 */
export function nameVersion(labels: string[], version: string | null): string[] {
  if (version && labels.length) labels[labels.length - 1] += ` - ${version}`;
  return labels;
}
