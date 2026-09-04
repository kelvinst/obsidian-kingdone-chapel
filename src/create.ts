/**
 * Writing a new version out of one the vault already holds.
 *
 * A study Bible, a commentary, a set of notes on the text — each of them is a
 * version whose chapters answer a translation's chapters one for one, and none
 * of them is worth typing out by hand: a translation is upwards of a thousand
 * files, and every one of the new ones is the same shape.
 *
 * So the translation is the template. Its folders are copied as it lays them
 * out, its file names are copied with the new code in front, and each chapter
 * opens as an embed of every verse the translation has, each carrying a block
 * id of the new version's own so that the writing put beside it can be linked
 * to like any other verse.
 *
 * What is here is only the shape of it. Reading the translation and writing
 * the files is the vault's work, and is done where the vault is.
 */

/**
 * `rel`, with `from` swapped for `to` wherever a path segment is named after
 * the version rather than after what it holds.
 *
 * A version lays its folders out however it likes — by testament, by book, or
 * not at all — and only some of those names carry the version: `ARA-41-MRK`
 * does, `5-NT-Gospels` does not. Matching the code and the dash after it tells
 * them apart, and leaves everything a version chose to call its own alone.
 *
 * Matched without case, the way the file names are read: a version folder and
 * the files inside it do not have to agree on it.
 */
export function renameSegments(rel: string, from: string, to: string): string {
  const wanted = from.toLowerCase();
  return rel
    .split('/')
    .map((segment) => {
      const head = segment.slice(0, from.length).toLowerCase();
      if (head !== wanted) return segment;
      const rest = segment.slice(from.length);
      return rest === '' || rest.startsWith('-') ? to + rest : segment;
    })
    .join('/');
}

/**
 * The block id a verse of the new version carries: the version, the book, the
 * chapter and the verse, which is what `@` references and the sidebar read a
 * verse's anchor as.
 *
 * Built rather than copied from the translation's own. The two read the same
 * where the translation names its ids this way, and where it names them some
 * other way the new version is still named the one way everything here knows
 * how to look up.
 */
export function verseId(
  code: string,
  book: string,
  chapter: number,
  verse: number,
): string {
  return `${code.toLowerCase()}-${book.toLowerCase()}-${chapter}-${verse}`;
}

/** One verse of the translation, as the chapter being written quotes it. */
export interface Quoted {
  verse: number;
  /** Block id the verse carries in the translation. */
  anchor: string;
}

/**
 * A chapter of the new version, as it is first written.
 *
 * The translation is embedded rather than copied, so the new version carries
 * none of its text and stays a set of notes about it. Each embed is followed
 * by its own block id on the next line down, with a blank line before the one
 * after: the id belongs to the block above it, so writing between the two is
 * writing inside the verse, which is the whole point of the file.
 *
 * Every embed is marked `flat`, which is what this vault's stylesheet reads to
 * draw an embed no bar and no indent of its own. A version made of embeds is
 * framed twice over otherwise — once by whatever quotes one of its verses, and
 * once by the translation inside it — and the marker is an ordinary link
 * alias, so a note written this way still opens anywhere.
 */
export function chapterNote(
  title: string,
  source: string,
  sourceLabel: string,
  verses: Quoted[],
  code: string,
  book: string,
  chapter: number,
): string {
  const head = `# ${title}\n\n## [[${source}|${sourceLabel}]]\n`;
  const body = verses
    .map(
      (v) =>
        `![[${source}#^${v.anchor}|flat]]\n` +
        `^${verseId(code, book, chapter, v.verse)}\n`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

/**
 * The note that says the new folder is a version, what to call it, what to
 * list it under, and which translation it was written from. `bible` is what
 * declares it; the rest describe it, and a version naming no heading leaves
 * the key out rather than writing it empty, which is the same answer and reads
 * as one.
 *
 * `complete` is written outright rather than left to where the folder lands. A
 * generated version has a file for every chapter its translation has — that is
 * what generating it did — so it is a whole Bible wherever it is filed, and
 * saying so is what lets `@` link to it from the moment it is written.
 *
 * `translation` is what it was written from. Nothing reads it back yet: it is
 * there so the vault says where its chapters came from, which is the question
 * anyone opening a folder full of embeds asks first, and it is what a run that
 * regenerates the version would have to be told otherwise.
 *
 * Every one of them is quoted. They are words a reader typed into a form, and
 * a name reading `Bíblia Shedd: edição revista` written bare is not YAML at
 * all — the frontmatter fails to parse, and a folder whose frontmatter does
 * not parse is not a version, which is a hard thing to see once a thousand
 * chapter files have been written into it. One beginning `#` fails quieter
 * still, read as a comment and leaving the key empty.
 */
export function declaringNote(
  code: string,
  name: string,
  group: string,
  translation: string,
): string {
  const heading = group ? `group: ${quoted(group)}\n` : '';
  return (
    `---\nbible: true\ncomplete: true\ntranslation: ${quoted(translation)}\n` +
    `${heading}code: ${quoted(code)}\nname: ${quoted(name)}\n---\n`
  );
}

/**
 * A value written into frontmatter, as a YAML double-quoted scalar.
 *
 * A double-quoted scalar escapes the way a JSON string does — backslash, the
 * quote itself, the control characters — so `JSON.stringify` writes one, and
 * writes it for whatever a reader typed rather than for the characters someone
 * thought to look for.
 */
function quoted(value: string): string {
  return JSON.stringify(value);
}
