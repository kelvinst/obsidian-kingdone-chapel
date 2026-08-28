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
 * Book code -> display name. Chapter files are named by the USFM code
 * (`NVI-01-GEN-001`), which is stable across versions and languages but not
 * something to show a reader. The folder holding the chapters carries a
 * readable name, but reading it would tie the location to the vault layout,
 * which every version is free to choose. Keep the mapping here instead.
 */
const BOOK_NAMES: Record<string, string> = {
  GEN: 'Gênesis',
  EXO: 'Êxodo',
  LEV: 'Levítico',
  NUM: 'Números',
  DEU: 'Deuteronômio',
  JOS: 'Josué',
  JDG: 'Juízes',
  RUT: 'Rute',
  '1SA': '1 Samuel',
  '2SA': '2 Samuel',
  '1KI': '1 Reis',
  '2KI': '2 Reis',
  '1CH': '1 Crônicas',
  '2CH': '2 Crônicas',
  EZR: 'Esdras',
  NEH: 'Neemias',
  EST: 'Ester',
  JOB: 'Jó',
  PSA: 'Salmos',
  PRO: 'Provérbios',
  ECC: 'Eclesiastes',
  SNG: 'Cânticos',
  ISA: 'Isaías',
  JER: 'Jeremias',
  LAM: 'Lamentações de Jeremias',
  EZK: 'Ezequiel',
  DAN: 'Daniel',
  HOS: 'Oseias',
  JOL: 'Joel',
  AMO: 'Amós',
  OBA: 'Obadias',
  JON: 'Jonas',
  MIC: 'Miqueias',
  NAM: 'Naum',
  HAB: 'Habacuque',
  ZEP: 'Sofonias',
  HAG: 'Ageu',
  ZEC: 'Zacarias',
  MAL: 'Malaquias',
  MAT: 'Mateus',
  MRK: 'Marcos',
  LUK: 'Lucas',
  JHN: 'João',
  ACT: 'Atos',
  ROM: 'Romanos',
  '1CO': '1 Coríntios',
  '2CO': '2 Coríntios',
  GAL: 'Gálatas',
  EPH: 'Efésios',
  PHP: 'Filipenses',
  COL: 'Colossenses',
  '1TH': '1 Tessalonicenses',
  '2TH': '2 Tessalonicenses',
  '1TI': '1 Timóteo',
  '2TI': '2 Timóteo',
  TIT: 'Tito',
  PHM: 'Filemom',
  HEB: 'Hebreus',
  JAS: 'Tiago',
  '1PE': '1 Pedro',
  '2PE': '2 Pedro',
  '1JN': '1 João',
  '2JN': '2 João',
  '3JN': '3 João',
  JUD: 'Judas',
  REV: 'Apocalipse',
};

/**
 * Name to show for a book code. A vault can hold books this plugin has never
 * heard of — an apocryphal one, or a version using its own codes — so fall
 * back to whatever the file name said rather than dropping the book.
 */
export function bookName(code: string): string {
  return BOOK_NAMES[code.toUpperCase()] ?? code;
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

  const named = id ? Number(id[1].slice(id[1].lastIndexOf('-') + 1)) : NaN;
  const written = marker ? Number(marker[1] || marker[2]) : NaN;
  const verse = Number.isInteger(named) ? named : written;
  if (!Number.isInteger(verse)) return null;

  // The id sits at the end of the line, so drop it before the opening marker
  // shifts everything left.
  let text = id ? line.slice(0, line.length - id[0].length) : line;
  if (marker) text = text.slice(marker[0].length);
  return { verse, text: text.trim() };
}
