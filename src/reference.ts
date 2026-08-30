/**
 * Reading what a person typed after `@` as a Bible reference.
 *
 *   @Joao            the whole book
 *   @Joao 1          one chapter
 *   @Joao 1,3        two chapters
 *   @Joao 1-3        the same as 1,2,3
 *   @Joao 1.1        one verse
 *   @Joao 1.1,2      two verses
 *   @Joao 1.1-3      the same as 1,2,3
 *   @ARA Joao 1.1    the same verse in a named version
 *   @Joao 1.1 ARA    the same, with the version said last
 *   @Joao 1.1 -ara   the same, written the way the finished link reads it,
 *                    which may sit anywhere in the reference
 *
 * The text is still being typed, so half-written references (`@Joao 1.`,
 * `@Joao 1-`, `@Joao 1.1-`) have to parse into the most complete thing they
 * can be. A bare
 * version name only reads as one once it is written in full — `@Joao 1 n` is
 * still a book name as far as this knows — which is what the dash is for: it
 * says a version is being written before there is enough of it to recognise,
 * and what follows it is read as far as it goes.
 *
 * The dash writes a run of chapters and a run of verses too, so the spaces
 * around it are what tell those from a version: a run is written closed up,
 * `1-3` and `1.1-3`, and a dash with a space on either side of it is not one.
 * `@Joao 1.1 - 3` is therefore verse 1 in a version called `3`, and not verses
 * 1 to 3; `@Joao 1 - 3` is chapter 1 in that same version, and not chapters 1
 * to 3.
 */

/** Verses one reference may expand to, so a typo cannot paste a whole chapter. */
const MAX_VERSES = 50;

/**
 * And chapters, so one cannot paste a whole book. The cap sits far below the
 * 150 of the longest book on purpose: a run that long is asking for the book,
 * and `@Joao` already says that in fewer keystrokes than it took to mistype.
 */
const MAX_CHAPTERS = 25;

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
  /** Chapters asked for, in the order written, without duplicates. None of
   *  them is the whole book. */
  chapters: number[];
  /** Verses asked for, in the order written, without duplicates. */
  verses: number[];
}

/**
 * Split `query` (everything after the `@`) into its parts. `isVersion` says
 * whether an outer word names a version, which is the only way to tell
 * `@ARA Joao` from a two-word book name, or `@Joao ARA` from one whose name
 * carries on. A marked version says so itself, and is not asked.
 */
export function parseReference(
  query: string,
  isVersion: (word: string) => boolean,
): ParsedRef | null {
  let text = query;
  let version: string | null = null;
  let versionPrefix = false;

  // A marked version is taken out wherever it sits, before anything else reads
  // the query, so the rest is a plain reference again. Nothing marks its end,
  // so it is read as a beginning: as much of a version name as is there yet.
  //
  // The dash also writes a run of verses, and the space in front of it is what
  // separates the two: a run is written closed up (`1.1-3`), so a dash with a
  // space before it is a version every time — including the dash that has no
  // name after it yet, which is the beginning of every version there is.
  const marked = text.match(/(?:^|\s)-\s?([\p{L}\p{N}]*)(?=\s|$)/u);
  if (marked) {
    // A match always says where it was found. The fallback is for the type,
    // which allows for the `exec` of a sticky regexp that this never is.
    /* v8 ignore next */
    const at = marked.index ?? 0;
    version = marked[1];
    versionPrefix = true;
    text = text.slice(0, at) + ' ' + text.slice(at + marked[0].length);
  }

  // An unmarked version may come after the reference, the way it is said out
  // loud (`Joao 1 NVI`). It comes off first, so the chapter is still the last
  // number of what is left.
  const trailing = marked ? null : text.match(/^\s*(.*\S)\s+(\S+)\s*$/);
  if (trailing && isVersion(trailing[2])) {
    version = trailing[2];
    text = trailing[1];
  }

  // The chapter is the last bare number, so `1 Joao 1.1` splits after `Joao`.
  // A run of them is still that one number, with commas and dashes hanging off
  // it and written closed up the way a run of verses is — which is what leaves
  // a dash with room around it free to go on marking a version, and what keeps
  // `Joao 1 2` the book `Joao 1`, chapter 2.
  const m = text.match(
    /^\s*(.*?)\s+(\d+(?:[,-]\d*)*)\s*(?:[.:]\s*([\d,\s-]*))?\s*$/,
  );
  let book = (m ? m[1] : text).trim();
  const chapters = m ? expandRun(m[2], MAX_CHAPTERS) : [];
  const verses = m && m[3] !== undefined ? expandRun(m[3], MAX_VERSES) : [];
  // longer than a reference may carry
  if (chapters === null || verses === null) return null;
  // A verse belongs to one chapter, and `Joao 1-3.2` hands it three. Reading
  // it as the three whole chapters would quietly drop the verse that was
  // typed, and picking a chapter for it would be a guess, so read nothing —
  // the run alone was there a keystroke ago and is there again on backspace.
  if (chapters.length > 1 && verses.length) return null;

  // Or before it (`NVI Joao 1`), which is the only way to tell a version from
  // the first word of a two-word book name.
  const named =
    marked || version !== null ? null : book.match(/^(\S+)\s+(.+)$/);
  if (named && isVersion(named[1])) {
    version = named[1];
    book = named[2];
  }

  return book ? { version, versionPrefix, book, chapters, verses } : null;
}

/**
 * `1,3-5` -> [1, 3, 4, 5], written closed up. A dash with a space in front of
 * it has been read as a version by now and never reaches here; one with a
 * space after it is not a run either, so that the two are told apart by the
 * same rule read from either side. An unfinished range (`3-`) is just its
 * start, and so is one written backwards (`5-1`) — a run reaching for nothing
 * at all is read as the wider thing it sits in: no verse is the whole chapter,
 * and no chapter the whole book.
 *
 * A reference asking for more than `max` comes back as null rather than as its
 * first `max`: a passage quietly cut short says something other than what was
 * typed, and there is nothing in the finished links to show it was.
 */
function expandRun(spec: string, max: number): number[] | null {
  const out: number[] = [];
  const seen = new Set<number>();
  /** False once the reference has outgrown the cap. */
  const add = (v: number): boolean => {
    if (v <= 0 || seen.has(v)) return true;
    seen.add(v);
    out.push(v);
    return out.length <= max;
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
 * How a reference reads in a note, one label per link. The first carries the
 * whole reference and the rest only their own number, joined the way they were
 * typed and the way they are written by hand: `João 1.1,2,3` for a run of
 * verses, `João 1,2,3` for a run of chapters.
 *
 * A `version` is named at the very end, after the last of them, which is where
 * it is said and where it reads as belonging to the whole reference rather
 * than to the one it happens to sit against: `João 1.1,2,3 - NVI`.
 */
export function referenceLabels(
  book: string,
  chapters: number[],
  verses: number[],
  version: string | null = null,
): string[] {
  const labels = !chapters.length
    ? [book]
    : !verses.length
      ? chapters.map((c, i) => (i === 0 ? `${book} ${c}` : String(c)))
      : // Verses never span chapters, so there is one chapter number to say
        // and it rides along with the book on the first of them.
        verses.map((v, i) =>
          i === 0 ? `${book} ${chapters[0]}.${v}` : String(v),
        );

  if (version) labels[labels.length - 1] += ` - ${version}`;
  return labels;
}
