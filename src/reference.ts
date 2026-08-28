/**
 * Reading what a person typed after `@` as a Bible reference.
 *
 *   @Joao            the whole book
 *   @Joao 1          one chapter
 *   @Joao 1.1        one verse
 *   @Joao 1.1,2      two verses
 *   @Joao 1.1-3      the same as 1,2,3
 *   @ARA Joao 1.1    the same verse in a named version
 *
 * The text is still being typed, so half-written references (`@Joao 1.`,
 * `@Joao 1.1-`) have to parse into the most complete thing they can be.
 */

/** Verses one reference may expand to, so a typo cannot paste a whole chapter. */
const MAX_VERSES = 50;

export interface ParsedRef {
  /** Version named in the query, as typed, or null to use the default. */
  version: string | null;
  /** The book part, still as typed — resolving it needs the book table. */
  book: string;
  chapter: number | null;
  /** Verses asked for, in the order written, without duplicates. */
  verses: number[];
}

/**
 * Split `query` (everything after the `@`) into its parts. `isVersion` says
 * whether a leading word names a version, which is the only way to tell
 * `@ARA Joao` from a two-word book name.
 */
export function parseReference(query: string, isVersion: (word: string) => boolean): ParsedRef | null {
  // The chapter is the last bare number, so `1 Joao 1.1` splits after `Joao`.
  const m = query.match(/^\s*(.*?)\s+(\d+)\s*(?:[.:]\s*([\d,\s-]*))?\s*$/);
  let book = (m ? m[1] : query).trim();
  const chapter = m ? parseInt(m[2], 10) : null;
  const verses = m && m[3] !== undefined ? expandVerses(m[3]) : [];

  let version: string | null = null;
  const named = book.match(/^(\S+)\s+(.+)$/);
  if (named && isVersion(named[1])) {
    version = named[1];
    book = named[2];
  }

  return book ? { version, book, chapter, verses } : null;
}

/** `1,3-5` -> [1, 3, 4, 5]. An unfinished range (`3-`) is just its start. */
function expandVerses(spec: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (v: number) => {
    if (v > 0 && !seen.has(v) && out.length < MAX_VERSES) {
      seen.add(v);
      out.push(v);
    }
  };

  for (const part of spec.split(',')) {
    const range = part.trim().match(/^(\d+)\s*-\s*(\d*)$/);
    if (range) {
      const from = parseInt(range[1], 10);
      const to = range[2] ? parseInt(range[2], 10) : from;
      for (let v = from; v <= to && out.length < MAX_VERSES; v++) add(v);
      continue;
    }
    const single = part.trim().match(/^\d+$/);
    if (single) add(parseInt(single[0], 10));
  }
  return out;
}

/**
 * How a reference reads in a note. The first link carries the whole reference
 * and the rest only their verse number, joined the way they were typed and the
 * way they are written by hand: `João 1.1,2,3`.
 */
export function verseLabels(book: string, chapter: number | null, verses: number[]): string[] {
  if (chapter === null) return [book];
  if (!verses.length) return [`${book} ${chapter}`];
  return verses.map((v, i) => (i === 0 ? `${book} ${chapter}.${v}` : String(v)));
}
