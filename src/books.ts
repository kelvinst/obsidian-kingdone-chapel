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
 */
export function plain(raw: string): string {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
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
}

const LANGS: Lang[] = ['pt', 'en'];

/** Best rank this book can offer for a query, or null when it cannot answer it. */
function rankIn(book: Book, lang: Lang, exact: string, folded: string): Rank | null {
  const abbrs = book.abbrs[lang];
  const name = book.names[lang];
  if (abbrs.some((a) => plain(a) === exact)) return Rank.Abbr;
  if (abbrs.some((a) => fold(a) === folded)) return Rank.FoldedAbbr;
  if (plain(name) === exact) return Rank.Name;
  if (fold(name) === folded) return Rank.FoldedName;
  if (fold(name).startsWith(folded)) return Rank.NamePrefix;
  if (abbrs.some((a) => fold(a).startsWith(folded))) return Rank.AbbrPrefix;
  return null;
}

/**
 * Books a reader could have meant by `query`, best first. Ties break on the
 * canonical order, and Portuguese wins a tie against English on the same book
 * (`Gen` is one word in both, and this plugin's own book names are Portuguese).
 */
export function matchBooks(query: string, limit = 8): BookMatch[] {
  const exact = plain(query);
  const folded = fold(query);
  if (!folded) return [];

  const matches: BookMatch[] = [];
  for (const book of BOOKS) {
    let best: BookMatch | null = null;
    for (const lang of LANGS) {
      const rank = rankIn(book, lang, exact, folded);
      if (rank !== null && (!best || rank < best.rank)) best = { book, lang, rank };
    }
    // The USFM code is what the files are named by, so accept it in any
    // language. It says nothing about which one to label the link in, so keep
    // whatever the names said, and fall back to Portuguese.
    if (fold(book.code) === folded) {
      best = { book, lang: best ? best.lang : 'pt', rank: Rank.Abbr };
    }
    if (best) matches.push(best);
  }

  return matches.sort((a, b) => a.rank - b.rank || a.book.index - b.book.index).slice(0, limit);
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
