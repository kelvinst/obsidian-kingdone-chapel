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
 *   @1               numbers alone, read against the passage the note is about
 *   @1.1             a chapter and a verse of the book that passage is in
 *   @ARA 1           the same in a named version, as do `@1 ARA`, `@1 -ara`
 *                    and `@ARA` on its own
 *   @1               numbers alone, read against the passage the note is about
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
/**
 * Take the version out of `query`, wherever it was written, and hand back what
 * is left to be read as the reference. Both parses share it, a version being
 * written the same way whether or not a book was written with it.
 */
function takeVersion(
  query: string,
  isVersion: (word: string) => boolean,
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
    // A match always says where it was found. The fallback is for the type,
    // which allows for the `exec` of a sticky regexp that this never is.
    /* v8 ignore next */
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

export function parseReference(
  query: string,
  isVersion: (word: string) => boolean,
): ParsedRef | null {
  const taken = takeVersion(query, isVersion);
  const { versionPrefix, text } = taken;
  let version = taken.version;

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
  const named = version !== null ? null : book.match(/^(\S+)\s+(.+)$/);
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

/** A reference written without a book, for one to be carried into it. */
export interface BooklessRef {
  /** Chapter written in it, or null when it names verses alone. */
  chapter: number | null;
  /** Verses asked for, in the order written, without duplicates. */
  verses: number[];
}

/**
 * A reference written as numbers alone — `3.1`, `3.1-4`, `9`, `9,10` — which
 * is how the second reference of a pair is written when the first already said
 * which book they are both in: `Jn 2.9; 3.1`. There is no book in it to read,
 * only the numbers, and the caller supplies the passage they are counted from.
 *
 * A number with a chapter in front of it (`3.1`) names its own chapter, and
 * bare numbers (`9,10`) are verses of whatever chapter is carried in. Anything
 * carrying a letter is not one of these and comes back null, to be read by
 * `parseReference` the way it always was; so does a spec asking for more
 * verses than a reference may carry, for the reason `expandRun` gives.
 */
export function parseBookless(query: string): BooklessRef | null {
  const text = query.trim();
  if (!text || !/^[\d\s.,:-]+$/.test(text)) return null;

  // Half-written, `3.` is still chapter three — the verse is only being typed.
  const m = text.match(/^(\d+)\s*[.:]\s*([\d,\s-]*)$/);
  if (m) {
    const verses = expandRun(m[2], MAX_VERSES);
    return verses === null ? null : { chapter: parseInt(m[1], 10), verses };
  }

  const verses = expandRun(text, MAX_VERSES);
  return verses && verses.length ? { chapter: null, verses } : null;
}

/**
 * A carried reference written as the numbers alone, the way it was typed:
 * `3.1,2` keeps its chapter, `9,10` stays verses of the chapter it was counted
 * from, and a chapter still missing its verse is the number itself. The book
 * is left out of all of them — the reference before the semicolon said it.
 */
export function booklessLabels(
  bookless: BooklessRef,
  chapter: number,
): string[] {
  if (!bookless.verses.length) return [String(chapter)];
  if (bookless.chapter === null) return bookless.verses.map(String);
  return bookless.verses.map((v, i) =>
    i === 0 ? `${chapter}.${v}` : String(v),
  );
}

/**
 * A carried run of verses as one label, the way the passage link reads it:
 * `1-3` where the verses are counted in the chapter being carried, `3.1-3`
 * where the carried reference named a chapter of its own. The book is left out
 * of both — the reference before the semicolon said it.
 */
export function booklessPassageLabel(
  bookless: BooklessRef,
  chapter: number,
): string {
  const spec = verseSpec(bookless.verses);
  return bookless.chapter === null ? spec : `${chapter}.${spec}`;
}

/**
 * A reference written with no book in it, for the note's own passage to fill.
 * `parseBookless` above reads the same shape against the link before a
 * semicolon; this one reads it against what the note is already about, so it
 * carries a version too, and its numbers are still to be read either way.
 */
export interface ParsedContextRef {
  /** Version named in the query, as typed, or null to keep the note's own. */
  version: string | null;
  /** Whether `version` is only as much of a name as has been typed, as above. */
  versionPrefix: boolean;
  /** Chapter written in front of the numbers (`1.1`), or null when none was. */
  chapter: number | null;
  /**
   * Verses of that chapter; with no chapter, verses or chapters alike, for the
   * caller to read both ways. Null when the run reaches past what a reference
   * may carry, which is a reference this could read and will not, rather than
   * one it could never read.
   */
  numbers: number[] | null;
}

/**
 * Read a query that names no book, for a note that already says which passage
 * it is about: `@1`, `@1-3`, `@1.1`, and any of those in a version the reader
 * named — `@ARA 1`, `@1 ARA`, `@1 -ara`, or `@ARA` on its own, which asks for
 * the note's own passage in another version.
 *
 * Null when the query is not one of these at all, leaving it to be read as a
 * book. The numbers are measured against the verse cap, the wider of the two;
 * read as chapters they have `fitsChapters` to answer to.
 */
export function parseContextRef(
  query: string,
  isVersion: (word: string) => boolean,
): ParsedContextRef | null {
  const taken = takeVersion(query, isVersion);
  let rest = taken.text.trim();
  let version = taken.version;

  // A version leads a reference too (`ARA Joao 1`), and with no book behind it
  // to be the rest of a name, a lone word naming a version is only ever that.
  const lead = version === null ? rest.match(/^(\S+)(?:\s+([\s\S]*))?$/) : null;
  if (lead && isVersion(lead[1])) {
    version = lead[1];
    rest = (lead[2] || '').trim();
  }

  // A chapter written in front of the numbers says they are its verses. Only
  // one chapter may be: verses hang off a single chapter, so `1-3.2` is no
  // more readable here than it is with a book in front of it, and is read as
  // no reference at all.
  const spec = rest.match(/^(\d+)\s*[.:]\s*([\d,\s-]*)$/);
  const chapter = spec ? parseInt(spec[1], 10) : null;
  // No book has a chapter 0 to write verses of — `expandRun` drops the number
  // wherever else it is written, and a chapter said outright answers to the
  // same rule rather than linking a file the version will never carry.
  if (chapter !== null && chapter <= 0) return null;
  let numbers: number[] | null;
  if (spec) numbers = expandRun(spec[2], MAX_VERSES);
  else if (!rest) numbers = [];
  else if (NUMBERS.test(rest)) numbers = expandRun(rest, MAX_VERSES);
  // Anything carrying a letter is a book being written, not this.
  else return null;

  // And nothing was written that the note's own passage does not already say.
  if (version === null && chapter === null && numbers && !numbers.length) {
    return null;
  }
  return { version, versionPrefix: taken.versionPrefix, chapter, numbers };
}

/** A query written as numbers alone, whatever they come to. */
const NUMBERS = /^[\d\s,-]+$/;

/** Whether a run is short enough to be read as chapters as well as verses. */
export function fitsChapters(numbers: number[]): boolean {
  return numbers.length <= MAX_CHAPTERS;
}

/**
 * A run of numbers written the short way it is read: `[1, 2, 3, 5]` -> `1-3,5`.
 * Only a run of three or more is worth closing up — `1,2` is as short written
 * out as it is with a dash through it, and it is how it would be said.
 *
 * The numbers are left in the order they were asked for, so a run is only one
 * where it was written as one: `3,1` stays as it was typed.
 */
export function numberRuns(numbers: number[]): string {
  const parts: string[] = [];
  for (let at = 0; at < numbers.length;) {
    let end = at;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) {
      end++;
    }
    if (end - at >= 2) {
      parts.push(`${numbers[at]}-${numbers[end]}`);
      at = end + 1;
      continue;
    }
    parts.push(String(numbers[at]));
    at++;
  }
  return parts.join(',');
}

/**
 * The whole reference on one line, as short as it is written by hand:
 * `João 1.1-3 - NVI`. This is what a row says it points at, where the label it
 * writes cannot — `referenceLabels` spells the same reference across one label
 * per link, because that is how many links there are.
 */
export function shortReference(
  book: string,
  chapters: number[],
  verses: number[],
  version: string | null = null,
): string {
  const said = version ? ` - ${version}` : '';
  if (!chapters.length) return `${book}${said}`;
  // Verses never span chapters, so there is the one chapter number to say.
  if (verses.length) {
    return `${book} ${chapters[0]}.${numberRuns(verses)}${said}`;
  }
  return `${book} ${numberRuns(chapters)}${said}`;
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

/**
 * Verses written back the way they were asked for: `47-56`, `1,3-5`. Runs of
 * consecutive verses close back up into the dash they were probably typed as,
 * and everything else stays a list, in the order it was written — a reference
 * to `1.5,1` reads `5,1`, because that is what it says.
 */
export function verseSpec(verses: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < verses.length;) {
    let end = i;
    while (end + 1 < verses.length && verses[end + 1] === verses[end] + 1)
      end++;
    // Two verses in a row are a pair, not a run: `1-2` says nothing `1,2` does
    // not, and is a word longer to read.
    parts.push(
      end > i + 1
        ? `${verses[i]}-${verses[end]}`
        : verses.slice(i, end + 1).join(','),
    );
    i = end + 1;
  }
  return parts.join(',');
}

/**
 * A whole passage as one label: `Mateus 26.47-56 - NVI`. This is what a run of
 * verses reads as when it is one link rather than a link per verse, and the
 * version sits where `referenceLabels` puts it — at the very end, belonging to
 * the reference rather than to its last verse.
 */
export function passageLabel(
  book: string,
  chapter: number,
  verses: number[],
  version: string | null = null,
): string {
  const label = `${book} ${chapter}.${verseSpec(verses)}`;
  return version ? `${label} - ${version}` : label;
}

/**
 * As much of `raw` as a block id can carry: accents folded into the letters
 * they sit on, everything else a dash, and no dash left hanging off an end.
 */
function slug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A name reduced to something a block id can carry, for the names that reduce
 * to nothing. It stands for one name and no other, which is all the id needs
 * of it — it is never read back, only told apart.
 */
function nameTag(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Block id of the quote a passage link points at, in the shape the verse
 * anchors already use: `nvi-mat-26-47-56`. It is built from the passage alone,
 * so the same passage referenced twice in a note finds the quote already
 * there instead of writing a second one — whichever name the book was written
 * under either time.
 *
 * A block id carries letters, numbers and dashes and nothing else, and a
 * version is named by a folder, which may be called anything at all. So
 * everything a block id cannot hold — the commas between verses, and the
 * spaces, dots, brackets and accents a version like `ARA (2009)` brings with
 * it — comes through as a dash rather than as a link that resolves to nothing.
 *
 * A name written in no Latin letters at all would come through as nothing,
 * which would leave every version in such a vault sharing the one id — and a
 * passage quoted in one of them read as the other's. `nameTag` stands in for
 * the name there, so that the id still says which version it belongs to.
 */
export function passageId(
  version: string,
  code: string,
  chapter: number,
  verses: number[],
): string {
  const named = slug(version);
  return `${named || nameTag(version)}-${slug(code)}-${chapter}-${slug(verseSpec(verses))}`;
}
