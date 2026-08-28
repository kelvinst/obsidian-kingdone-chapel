/** A chapter file name, split into its parts. */
export interface ChapterName {
  version: string;
  /** Book number, without leading zeros (Genesis = 1). */
  bookIndex: number;
  /** Book code, as written in the file name. */
  book: string;
  chapter: number;
}

/**
 * Parse a chapter file name: `<VERSION>-<NN>-<CODE>-<CCC>`, where `CODE` is
 * the book's USFM code (`GEN`, `1SA`, `REV`). See `bookName` to display it.
 *
 * Folders are never part of it, so every version is free to organise its books
 * however it likes (flat, by testament, by category...). When `version` is
 * given (the version folder the file lives in), the name must start with it:
 * chapter files always carry their version, so anything else is an ordinary
 * note that happens to live under a version folder, and is not a chapter.
 */
export function parseChapterName(basename: string, version?: string): ChapterName | null {
  if (version) {
    const prefix = version.toLowerCase() + '-';
    if (!basename.toLowerCase().startsWith(prefix)) return null;
    const rest = splitBook(basename.slice(prefix.length));
    return rest ? { version, ...rest } : null;
  }

  const m = basename.match(/^(.+?)-(\d+)-(.+)-(\d+)$/);
  if (!m) return null;
  return {
    version: m[1],
    bookIndex: parseInt(m[2], 10),
    book: m[3],
    chapter: parseInt(m[4], 10),
  };
}

/** `<NN>-<CODE>-<CCC>` — the part of a chapter name after the version. */
function splitBook(rest: string): Omit<ChapterName, 'version'> | null {
  const m = rest.match(/^(\d+)-(.+)-(\d+)$/);
  if (!m) return null;
  return { bookIndex: parseInt(m[1], 10), book: m[2], chapter: parseInt(m[3], 10) };
}

/** Key a chapter is indexed and looked up by, across versions. */
export function chapterKey(bookIndex: number, chapter: number): string {
  return `${bookIndex}:${chapter}`;
}

/**
 * Parse a book index file name: `<VERSION>-<NN>-<Name>` — the note that lists a
 * book's chapters (`NVI-43-Joao`). It is named after the book, not its USFM
 * code, and carries no chapter, which is what tells it apart from a chapter
 * file; try `parseChapterName` first.
 */
export function parseBookName(basename: string, version: string): number | null {
  const prefix = version.toLowerCase() + '-';
  if (!basename.toLowerCase().startsWith(prefix)) return null;
  const m = basename.slice(prefix.length).match(/^(\d+)-(.+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/** A verse line of a chapter file, split into its number and its text. */
export interface VerseLine {
  verse: number;
  text: string;
}

/** The block id closing a verse line: `^nvi-gen-1-1`, ending in chapter and verse. */
const BLOCK_ID = /\s*\^([A-Za-z0-9-]+)\s*$/;
/** How a verse line opens: an ordered list item now, a bolded number in older chapters. */
const VERSE_MARKER = /^\s*(?:\*\*(\d+)\*\*|(\d+)\.)\s*/;
/** The verse a block id names, in the number it ends on. */
const VERSE_ID = /-(\d+)$/;

/**
 * Read a verse line, taking its number from the block id that closes it.
 *
 * The number a line opens with is presentation, and there are two ways to
 * write it — `1. No princípio` now, `**1** No princípio` in older chapters —
 * neither of which can be trusted: a version that merges verses labels the
 * whole run with the first of them, and a Markdown list renumbers itself from
 * its opening item regardless. The block id is the verse's own name, and it
 * ends in the chapter and verse it belongs to. Fall back to the written number
 * only for a chapter that carries no ids at all.
 */
export function parseVerseLine(line: string): VerseLine | null {
  const id = line.match(BLOCK_ID);
  const marker = line.match(VERSE_MARKER);

  // Only an id ending in a number names a verse. A block id that ends anywhere
  // else belongs to something other than a verse, and one left mid-edit, ending
  // on the dash itself, names nothing at all — both fall back to what the line
  // writes rather than being read as a number.
  const named = id && VERSE_ID.exec(id[1]);
  const verse = named ? Number(named[1]) : marker ? Number(marker[1] || marker[2]) : NaN;
  if (!Number.isInteger(verse)) return null;

  // The id sits at the end of the line, so drop it before the opening marker
  // shifts everything left.
  let text = id ? line.slice(0, line.length - id[0].length) : line;
  if (marker) text = text.slice(marker[0].length);
  return { verse, text: text.trim() };
}
