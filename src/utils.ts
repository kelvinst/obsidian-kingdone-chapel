/** A chapter file name, split into its parts. */
export interface ChapterName {
  version: string;
  /** Book number, without leading zeros (Genesis = 1). */
  bookIndex: number;
  book: string;
  chapter: number;
}

/**
 * Parse a chapter file name: `<VERSION>-<NN>-<Book>-<CCC>`.
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

/** `<NN>-<Book>-<CCC>` — the part of a chapter name after the version. */
function splitBook(rest: string): Omit<ChapterName, 'version'> | null {
  const m = rest.match(/^(\d+)-(.+)-(\d+)$/);
  if (!m) return null;
  return { bookIndex: parseInt(m[1], 10), book: m[2], chapter: parseInt(m[3], 10) };
}

/** Key a chapter is indexed and looked up by, across versions. */
export function chapterKey(bookIndex: number, chapter: number): string {
  return `${bookIndex}:${chapter}`;
}
