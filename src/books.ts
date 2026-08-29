/**
 * The 66 books, in canonical order, with the names and abbreviations a reader
 * may type. Chapter files are named by the USFM code (`NVI-43-JHN-001`), which
 * is stable across versions and languages; everything a human writes — `João`,
 * `John`, `Jo`, `Jn`, `1Co` — is resolved to a book through this table.
 */
export type Lang = 'pt' | 'en';

export interface Book {
  /** USFM code, as written in chapter file names. */
  code: string;
  /** Book number (Genesis = 1), the key books are matched by across versions. */
  index: number;
  names: Record<Lang, string>;
  /**
   * Abbreviations that a prefix of the full name does not already cover:
   * `Gen` finds Genesis on its own, `Jz` would never find Juízes. Portuguese
   * two-letter forms (`Gn`, `Sl`, `Ap`) are all listed for that reason.
   */
  abbrs: Record<Lang, string[]>;
}

export const BOOKS: Book[] = [
  { code: 'GEN', index: 1, names: { pt: 'Gênesis', en: 'Genesis' }, abbrs: { pt: ['gn'], en: ['ge', 'gn'] } },
  { code: 'EXO', index: 2, names: { pt: 'Êxodo', en: 'Exodus' }, abbrs: { pt: ['ex'], en: ['ex', 'exod'] } },
  { code: 'LEV', index: 3, names: { pt: 'Levítico', en: 'Leviticus' }, abbrs: { pt: ['lv'], en: ['le', 'lv'] } },
  { code: 'NUM', index: 4, names: { pt: 'Números', en: 'Numbers' }, abbrs: { pt: ['nm'], en: ['nu', 'nm'] } },
  { code: 'DEU', index: 5, names: { pt: 'Deuteronômio', en: 'Deuteronomy' }, abbrs: { pt: ['dt'], en: ['de', 'dt', 'deut'] } },
  { code: 'JOS', index: 6, names: { pt: 'Josué', en: 'Joshua' }, abbrs: { pt: ['js'], en: ['jsh'] } },
  { code: 'JDG', index: 7, names: { pt: 'Juízes', en: 'Judges' }, abbrs: { pt: ['jz'], en: ['jdg', 'jg'] } },
  { code: 'RUT', index: 8, names: { pt: 'Rute', en: 'Ruth' }, abbrs: { pt: ['rt'], en: ['ru', 'rth'] } },
  { code: '1SA', index: 9, names: { pt: '1 Samuel', en: '1 Samuel' }, abbrs: { pt: ['1sm'], en: ['1s', '1sa', '1sam'] } },
  { code: '2SA', index: 10, names: { pt: '2 Samuel', en: '2 Samuel' }, abbrs: { pt: ['2sm'], en: ['2s', '2sa', '2sam'] } },
  { code: '1KI', index: 11, names: { pt: '1 Reis', en: '1 Kings' }, abbrs: { pt: ['1rs', '1re'], en: ['1k', '1ki', '1kgs'] } },
  { code: '2KI', index: 12, names: { pt: '2 Reis', en: '2 Kings' }, abbrs: { pt: ['2rs', '2re'], en: ['2k', '2ki', '2kgs'] } },
  { code: '1CH', index: 13, names: { pt: '1 Crônicas', en: '1 Chronicles' }, abbrs: { pt: ['1cr'], en: ['1ch', '1chr'] } },
  { code: '2CH', index: 14, names: { pt: '2 Crônicas', en: '2 Chronicles' }, abbrs: { pt: ['2cr'], en: ['2ch', '2chr'] } },
  { code: 'EZR', index: 15, names: { pt: 'Esdras', en: 'Ezra' }, abbrs: { pt: ['ed', 'esd'], en: [] } },
  { code: 'NEH', index: 16, names: { pt: 'Neemias', en: 'Nehemiah' }, abbrs: { pt: ['ne'], en: ['ne'] } },
  { code: 'EST', index: 17, names: { pt: 'Ester', en: 'Esther' }, abbrs: { pt: ['et'], en: ['es'] } },
  { code: 'JOB', index: 18, names: { pt: 'Jó', en: 'Job' }, abbrs: { pt: ['jó'], en: ['jb'] } },
  { code: 'PSA', index: 19, names: { pt: 'Salmos', en: 'Psalms' }, abbrs: { pt: ['sl', 'sal'], en: ['ps', 'psa', 'psm'] } },
  { code: 'PRO', index: 20, names: { pt: 'Provérbios', en: 'Proverbs' }, abbrs: { pt: ['pv'], en: ['pr'] } },
  { code: 'ECC', index: 21, names: { pt: 'Eclesiastes', en: 'Ecclesiastes' }, abbrs: { pt: ['ec'], en: ['ec', 'qoh'] } },
  { code: 'SNG', index: 22, names: { pt: 'Cânticos', en: 'Song of Solomon' }, abbrs: { pt: ['ct', 'cantares', 'canticos'], en: ['so', 'sos', 'song'] } },
  { code: 'ISA', index: 23, names: { pt: 'Isaías', en: 'Isaiah' }, abbrs: { pt: ['is'], en: ['is'] } },
  { code: 'JER', index: 24, names: { pt: 'Jeremias', en: 'Jeremiah' }, abbrs: { pt: ['jr'], en: ['je'] } },
  { code: 'LAM', index: 25, names: { pt: 'Lamentações de Jeremias', en: 'Lamentations' }, abbrs: { pt: ['lm', 'lam'], en: ['la'] } },
  { code: 'EZK', index: 26, names: { pt: 'Ezequiel', en: 'Ezekiel' }, abbrs: { pt: ['ez'], en: ['eze', 'ezk'] } },
  { code: 'DAN', index: 27, names: { pt: 'Daniel', en: 'Daniel' }, abbrs: { pt: ['dn'], en: ['da', 'dn'] } },
  { code: 'HOS', index: 28, names: { pt: 'Oseias', en: 'Hosea' }, abbrs: { pt: ['os'], en: ['ho'] } },
  { code: 'JOL', index: 29, names: { pt: 'Joel', en: 'Joel' }, abbrs: { pt: ['jl'], en: ['jl'] } },
  { code: 'AMO', index: 30, names: { pt: 'Amós', en: 'Amos' }, abbrs: { pt: ['am'], en: ['am'] } },
  { code: 'OBA', index: 31, names: { pt: 'Obadias', en: 'Obadiah' }, abbrs: { pt: ['ob', 'abd'], en: ['ob'] } },
  { code: 'JON', index: 32, names: { pt: 'Jonas', en: 'Jonah' }, abbrs: { pt: ['jn'], en: ['jnh'] } },
  { code: 'MIC', index: 33, names: { pt: 'Miqueias', en: 'Micah' }, abbrs: { pt: ['mq'], en: ['mi', 'mic'] } },
  { code: 'NAM', index: 34, names: { pt: 'Naum', en: 'Nahum' }, abbrs: { pt: ['na'], en: ['na'] } },
  { code: 'HAB', index: 35, names: { pt: 'Habacuque', en: 'Habakkuk' }, abbrs: { pt: ['hc'], en: ['hb'] } },
  { code: 'ZEP', index: 36, names: { pt: 'Sofonias', en: 'Zephaniah' }, abbrs: { pt: ['sf'], en: ['zep'] } },
  { code: 'HAG', index: 37, names: { pt: 'Ageu', en: 'Haggai' }, abbrs: { pt: ['ag'], en: ['hg', 'hag'] } },
  { code: 'ZEC', index: 38, names: { pt: 'Zacarias', en: 'Zechariah' }, abbrs: { pt: ['zc'], en: ['zec'] } },
  { code: 'MAL', index: 39, names: { pt: 'Malaquias', en: 'Malachi' }, abbrs: { pt: ['ml'], en: ['mal'] } },
  { code: 'MAT', index: 40, names: { pt: 'Mateus', en: 'Matthew' }, abbrs: { pt: ['mt'], en: ['mt', 'mat'] } },
  { code: 'MRK', index: 41, names: { pt: 'Marcos', en: 'Mark' }, abbrs: { pt: ['mc'], en: ['mk', 'mr'] } },
  { code: 'LUK', index: 42, names: { pt: 'Lucas', en: 'Luke' }, abbrs: { pt: ['lc'], en: ['lk', 'lu'] } },
  { code: 'JHN', index: 43, names: { pt: 'João', en: 'John' }, abbrs: { pt: ['jo'], en: ['jn', 'jhn'] } },
  { code: 'ACT', index: 44, names: { pt: 'Atos', en: 'Acts' }, abbrs: { pt: ['at'], en: ['ac'] } },
  { code: 'ROM', index: 45, names: { pt: 'Romanos', en: 'Romans' }, abbrs: { pt: ['rm'], en: ['ro'] } },
  { code: '1CO', index: 46, names: { pt: '1 Coríntios', en: '1 Corinthians' }, abbrs: { pt: ['1co'], en: ['1co'] } },
  { code: '2CO', index: 47, names: { pt: '2 Coríntios', en: '2 Corinthians' }, abbrs: { pt: ['2co'], en: ['2co'] } },
  { code: 'GAL', index: 48, names: { pt: 'Gálatas', en: 'Galatians' }, abbrs: { pt: ['gl'], en: ['ga'] } },
  { code: 'EPH', index: 49, names: { pt: 'Efésios', en: 'Ephesians' }, abbrs: { pt: ['ef'], en: ['ep', 'eph'] } },
  { code: 'PHP', index: 50, names: { pt: 'Filipenses', en: 'Philippians' }, abbrs: { pt: ['fp'], en: ['php', 'phil'] } },
  { code: 'COL', index: 51, names: { pt: 'Colossenses', en: 'Colossians' }, abbrs: { pt: ['cl'], en: [] } },
  { code: '1TH', index: 52, names: { pt: '1 Tessalonicenses', en: '1 Thessalonians' }, abbrs: { pt: ['1ts'], en: ['1th'] } },
  { code: '2TH', index: 53, names: { pt: '2 Tessalonicenses', en: '2 Thessalonians' }, abbrs: { pt: ['2ts'], en: ['2th'] } },
  { code: '1TI', index: 54, names: { pt: '1 Timóteo', en: '1 Timothy' }, abbrs: { pt: ['1tm'], en: ['1ti'] } },
  { code: '2TI', index: 55, names: { pt: '2 Timóteo', en: '2 Timothy' }, abbrs: { pt: ['2tm'], en: ['2ti'] } },
  { code: 'TIT', index: 56, names: { pt: 'Tito', en: 'Titus' }, abbrs: { pt: ['tt'], en: ['ti'] } },
  { code: 'PHM', index: 57, names: { pt: 'Filemom', en: 'Philemon' }, abbrs: { pt: ['fm', 'flm'], en: ['phm', 'phlm'] } },
  { code: 'HEB', index: 58, names: { pt: 'Hebreus', en: 'Hebrews' }, abbrs: { pt: ['hb'], en: ['heb'] } },
  { code: 'JAS', index: 59, names: { pt: 'Tiago', en: 'James' }, abbrs: { pt: ['tg'], en: ['jas', 'jm'] } },
  { code: '1PE', index: 60, names: { pt: '1 Pedro', en: '1 Peter' }, abbrs: { pt: ['1pe', '1pd'], en: ['1pe', '1pt'] } },
  { code: '2PE', index: 61, names: { pt: '2 Pedro', en: '2 Peter' }, abbrs: { pt: ['2pe', '2pd'], en: ['2pe', '2pt'] } },
  { code: '1JN', index: 62, names: { pt: '1 João', en: '1 John' }, abbrs: { pt: ['1jo'], en: ['1jn'] } },
  { code: '2JN', index: 63, names: { pt: '2 João', en: '2 John' }, abbrs: { pt: ['2jo'], en: ['2jn'] } },
  { code: '3JN', index: 64, names: { pt: '3 João', en: '3 John' }, abbrs: { pt: ['3jo'], en: ['3jn'] } },
  { code: 'JUD', index: 65, names: { pt: 'Judas', en: 'Jude' }, abbrs: { pt: ['jd'], en: ['jd'] } },
  { code: 'REV', index: 66, names: { pt: 'Apocalipse', en: 'Revelation' }, abbrs: { pt: ['ap'], en: ['re', 'rv'] } },
];

const BY_CODE = new Map(BOOKS.map((b) => [b.code, b]));

/**
 * A typed book name reduced to its letters: `1 João`, `1João.` and `1JOÃO` all
 * become `1joão`. Accents survive — they are what tells `Jó` from `Jo`.
 *
 * Composed first, because an accent written as its own combining mark is not a
 * letter and would be dropped along with the punctuation: text pasted out of a
 * macOS file listing arrives that way, and `Jó` would arrive as `Jo`.
 */
export function plain(raw: string): string {
  return raw
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * The same, with accents dropped as well, because they are the first thing a
 * reader skips while typing: `joao` has to find `João`.
 */
export function fold(raw: string): string {
  return plain(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * How well a book answered a query — lower sorts first. Writing the accents
 * out wins over leaving them off, which is the whole of what separates `Jo`
 * (João) from `Jó` (Job) once both are folded down to `jo`.
 */
const enum Rank {
  Abbr = 0,
  FoldedAbbr = 1,
  Name = 2,
  FoldedName = 3,
  NamePrefix = 4,
  AbbrPrefix = 5,
}

export interface BookMatch {
  book: Book;
  /** Language the reader wrote it in, which the link label follows. */
  lang: Lang;
  rank: Rank;
  /**
   * The abbreviation the query matched, as the table writes it, or null when
   * the query was the book's name. A reader who typed one means the note to go
   * on saying it, so it is offered as a label of its own.
   */
  abbr: string | null;
}

const LANGS: Lang[] = ['pt', 'en'];

/**
 * Languages a query is read in, from the preferred one a reader may have set.
 *
 * Left unset, every language answers, which is how `@Jn` offers Jonas and John
 * at once — the same two letters abbreviate one book in Portuguese and another
 * in English. A reader who writes in one of them has no use for the other's
 * rows, and naming their language is what tells the two apart.
 *
 * A language this table does not hold is read as none of them. Settings are a
 * file in the vault, and one naming a language that was never here — typed by
 * hand, restored from a backup, left behind by another version of the plugin —
 * would otherwise index the table with a key it has no entry for, and every
 * book would answer a query by throwing.
 */
export function langsFor(preferred: Lang | ''): Lang[] {
  return LANGS.includes(preferred as Lang) ? [preferred as Lang] : LANGS;
}

/**
 * The one language a name is written in. Reading every language is a choice a
 * query can afford — it is answered by whichever book matched — but a book name
 * shown on its own has to settle on one, and that is the first read.
 */
export function nameLang(preferred: Lang | ''): Lang {
  return langsFor(preferred)[0];
}

/** How well a book answered a query, and which abbreviation got it there. */
type RankIn = Pick<BookMatch, 'rank' | 'abbr'>;

/** Best rank this book can offer for a query, or null when it cannot answer it. */
function rankIn(book: Book, lang: Lang, exact: string, folded: string): RankIn | null {
  const abbrs = book.abbrs[lang];
  const name = book.names[lang];
  const abbr = (test: (a: string) => boolean): string | null => abbrs.find(test) ?? null;

  const written = abbr((a) => plain(a) === exact);
  if (written) return { rank: Rank.Abbr, abbr: written };
  const unaccented = abbr((a) => fold(a) === folded);
  if (unaccented) return { rank: Rank.FoldedAbbr, abbr: unaccented };
  if (plain(name) === exact) return { rank: Rank.Name, abbr: null };
  if (fold(name) === folded) return { rank: Rank.FoldedName, abbr: null };
  if (fold(name).startsWith(folded)) return { rank: Rank.NamePrefix, abbr: null };
  const partial = abbr((a) => fold(a).startsWith(folded));
  if (partial) return { rank: Rank.AbbrPrefix, abbr: partial };
  return null;
}

/**
 * Books a reader could have meant by `query`, best first, read in `langs`.
 * Ties break on the canonical order, and the first language wins a tie against
 * the rest on the same book (`Gen` is one word in Portuguese and English, and
 * this plugin's own book names are Portuguese).
 */
export function matchBooks(query: string, limit = 8, langs: Lang[] = LANGS): BookMatch[] {
  const exact = plain(query);
  const folded = fold(query);
  if (!folded) return [];

  const matches: BookMatch[] = [];
  for (const book of BOOKS) {
    let best: BookMatch | null = null;
    for (const lang of langs) {
      const hit = rankIn(book, lang, exact, folded);
      if (hit && (!best || hit.rank < best.rank)) best = { book, lang, ...hit };
    }
    // The USFM code is what the files are named by, so accept it in any
    // language. It says nothing about which one to label the link in, so keep
    // whatever the names said, and fall back to the first one asked for. The
    // code is a short form like any other, so it stands in for the abbreviation
    // when the names offered none — lower cased, the way the table writes every
    // other one, so that `@Rev` is offered back as `Rev` and not as `REV`.
    if (fold(book.code) === folded) {
      best = {
        book,
        lang: best ? best.lang : langs[0],
        rank: Rank.Abbr,
        abbr: (best && best.abbr) || book.code.toLowerCase(),
      };
    }
    if (best) matches.push(best);
  }

  return matches.sort((a, b) => a.rank - b.rank || a.book.index - b.book.index).slice(0, limit);
}

/**
 * An abbreviation the way it is written in a note: `jn` -> `Jn`, `1sm` -> `1Sm`.
 * The table keeps them in lower case so they can be compared, and only the
 * first letter is raised — the rest is left to whatever the table said.
 */
export function abbrLabel(abbr: string): string {
  return abbr.replace(/\p{L}/u, (c) => c.toUpperCase());
}

/**
 * Name to show for a book code. A vault can hold books this plugin has never
 * heard of — an apocryphal one, or a version using its own codes — so fall
 * back to whatever the file name said rather than dropping the book.
 */
export function bookName(code: string, lang: Lang = 'pt'): string {
  const book = BY_CODE.get(code.toUpperCase());
  return book ? book.names[lang] : code;
}

const BY_INDEX = new Map(BOOKS.map((b) => [b.index, b]));

/**
 * Name to show for a book number, for the places that only have the number —
 * the index keys books by it, and the file name is what holds the code. A
 * vault may hold a book this table never heard of, so fall back to the number
 * itself rather than to nothing.
 */
export function bookNameAt(index: number, lang: Lang = 'pt'): string {
  const book = BY_INDEX.get(index);
  return book ? book.names[lang] : String(index);
}

/**
 * A run of consecutive books read together — a testament, or one of the
 * divisions inside it. The books are numbered in canonical order, so every
 * division any of them belongs to is a range, and a book's section is found by
 * the number alone.
 */
export interface Section {
  /** First and last book number the section covers, both included. */
  from: number;
  to: number;
  names: Record<Lang, string>;
}

export const TESTAMENTS: Section[] = [
  { from: 1, to: 39, names: { pt: 'Antigo Testamento', en: 'Old Testament' } },
  { from: 40, to: 66, names: { pt: 'Novo Testamento', en: 'New Testament' } },
];

/**
 * The divisions inside the testaments, as a Bible's own contents page draws
 * them. Two of them hold a single book — Atos and Apocalipse — which is how
 * the division is normally written, and leaving either out would put the book
 * under a heading it does not belong to.
 */
export const CATEGORIES: Section[] = [
  { from: 1, to: 5, names: { pt: 'Pentateuco', en: 'Pentateuch' } },
  { from: 6, to: 17, names: { pt: 'Históricos', en: 'Historical' } },
  { from: 18, to: 22, names: { pt: 'Poéticos', en: 'Poetic' } },
  { from: 23, to: 27, names: { pt: 'Profetas Maiores', en: 'Major Prophets' } },
  { from: 28, to: 39, names: { pt: 'Profetas Menores', en: 'Minor Prophets' } },
  { from: 40, to: 43, names: { pt: 'Evangelhos', en: 'Gospels' } },
  { from: 44, to: 44, names: { pt: 'Histórico', en: 'History' } },
  { from: 45, to: 57, names: { pt: 'Cartas Paulinas', en: 'Pauline Epistles' } },
  { from: 58, to: 65, names: { pt: 'Cartas Gerais', en: 'General Epistles' } },
  { from: 66, to: 66, names: { pt: 'Profecia', en: 'Prophecy' } },
];

/** Where a book outside every section is filed, so none is left without a heading. */
const OTHER: Record<Lang, string> = { pt: 'Outros', en: 'Other' };

/**
 * The heading a book falls under. A vault may hold books this table never
 * heard of — an apocryphal one, or a version numbering its own way — and they
 * are gathered under a heading of their own rather than left loose.
 */
export function sectionName(sections: Section[], index: number, lang: Lang = 'pt'): string {
  const found = sections.find((s) => index >= s.from && index <= s.to);
  return found ? found.names[lang] : OTHER[lang];
}
