import { describe, expect, it } from 'vitest';

import type { Lang } from './books';
import {
  BOOKS,
  CATEGORIES,
  TESTAMENTS,
  abbrLabel,
  bookName,
  bookNameAt,
  fold,
  langsFor,
  matchBooks,
  nameLang,
  plain,
  sectionName,
} from './books';

/** Codes of the books a query matched, best first. */
const codes = (query: string, limit?: number, langs?: Lang[]) =>
  matchBooks(query, limit, langs).map((m) => m.book.code);

describe('the book table', () => {
  it('holds the 66 books in canonical order', () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.map((b) => b.index)).toEqual(BOOKS.map((_, i) => i + 1));
  });

  it('names every book in every language it is read in', () => {
    for (const book of BOOKS) {
      for (const lang of langsFor('')) {
        expect(book.names[lang], `${book.code} in ${lang}`).toBeTruthy();
      }
    }
  });

  it('names each book by one USFM code', () => {
    expect(new Set(BOOKS.map((b) => b.code)).size).toBe(66);
  });

  it('writes its abbreviations in the reduced form queries are compared in', () => {
    for (const book of BOOKS) {
      for (const lang of langsFor('')) {
        for (const abbr of book.abbrs[lang]) {
          expect(plain(abbr), `${book.code} ${lang}`).toBe(abbr);
        }
      }
    }
  });
});

describe('plain', () => {
  it('drops case and punctuation but keeps the accents', () => {
    expect(plain('1 João.')).toBe('1joão');
    expect(plain('1JOÃO')).toBe('1joão');
  });

  it('composes an accent written as its own mark, so it survives', () => {
    expect(plain('Jó')).toBe('jó');
  });
});

describe('fold', () => {
  it('drops the accents as well', () => {
    expect(fold('1 João.')).toBe('1joao');
    expect(fold('Jó')).toBe('jo');
  });
});

describe('matchBooks', () => {
  it('finds a book by its name', () => {
    expect(codes('João')[0]).toBe('JHN');
  });

  it('finds a book by a name written without its accents', () => {
    expect(codes('joao')[0]).toBe('JHN');
  });

  it('finds a book by a prefix of its name', () => {
    expect(codes('Gene')[0]).toBe('GEN');
  });

  it('finds a book by an abbreviation', () => {
    expect(codes('1sm')[0]).toBe('1SA');
  });

  it('finds a book by its USFM code, in any language', () => {
    expect(codes('rev', 8, ['pt'])[0]).toBe('REV');
    expect(codes('jhn', 8, ['pt'])[0]).toBe('JHN');
  });

  it('offers the code back as a short form when the names had none to offer', () => {
    expect(matchBooks('rev')[0]).toMatchObject({ abbr: 'rev' });
  });

  it('prefers the abbreviation the reader actually typed', () => {
    expect(matchBooks('1sm')[0]).toMatchObject({ abbr: '1sm' });
    expect(matchBooks('João')[0]).toMatchObject({ abbr: null });
  });

  it('reads nothing as no book at all', () => {
    expect(matchBooks('')).toEqual([]);
    expect(matchBooks('  .  ')).toEqual([]);
  });

  it('answers with no more books than it was asked for', () => {
    expect(matchBooks('j', 3)).toHaveLength(3);
  });

  it('breaks ties on the canonical order', () => {
    // Every numbered book answers `1` by a prefix of its name, so nothing but
    // the canonical order is left to sort them by.
    const indexes = matchBooks('1', 8).map((m) => m.book.index);
    expect(indexes).toEqual(indexes.slice().sort((a, b) => a - b));
    expect(indexes.length).toBe(8);
  });

  describe('accents, which are all that separates Jo from Jó', () => {
    it('offers João first to a reader who left the accent off', () => {
      expect(codes('jo').slice(0, 2)).toEqual(['JHN', 'JOB']);
    });

    it('offers Jó first to a reader who wrote it', () => {
      expect(codes('jó').slice(0, 2)).toEqual(['JOB', 'JHN']);
    });
  });

  describe('languages', () => {
    it('offers both books when the same letters abbreviate one in each language', () => {
      expect(codes('jn', 8, ['pt', 'en']).slice(0, 2)).toEqual(['JON', 'JHN']);
    });

    it('offers only the book of the language asked for', () => {
      expect(codes('jn', 8, ['en'])[0]).toBe('JHN');
      expect(codes('jn', 8, ['pt'])[0]).toBe('JON');
    });

    it('says which language the reader wrote in, so the label can follow', () => {
      expect(matchBooks('John')[0]).toMatchObject({ lang: 'en' });
      expect(matchBooks('João')[0]).toMatchObject({ lang: 'pt' });
    });
  });
});

describe('langsFor', () => {
  it('reads every language when none was chosen', () => {
    expect(langsFor('')).toEqual(['pt', 'en']);
  });

  it('reads only the language that was chosen', () => {
    expect(langsFor('en')).toEqual(['en']);
    expect(langsFor('pt')).toEqual(['pt']);
  });

  it('reads a language this table never had as none of them', () => {
    expect(langsFor('de' as never)).toEqual(['pt', 'en']);
  });
});

describe('nameLang', () => {
  it('writes in the chosen language', () => {
    expect(nameLang('en')).toBe('en');
  });

  it('writes in the first language when none was chosen', () => {
    expect(nameLang('')).toBe('pt');
    expect(nameLang('de' as never)).toBe('pt');
  });
});

describe('abbrLabel', () => {
  it('raises the first letter', () => {
    expect(abbrLabel('jn')).toBe('Jn');
  });

  it('raises the first letter of a numbered book, not its number', () => {
    expect(abbrLabel('1sm')).toBe('1Sm');
  });
});

describe('bookName', () => {
  it('names a book in Portuguese by default', () => {
    expect(bookName('JHN')).toBe('João');
  });

  it('names a book in the language asked for', () => {
    expect(bookName('JHN', 'en')).toBe('John');
  });

  it('matches a code whatever case it was written in', () => {
    expect(bookName('jhn')).toBe('João');
  });

  it('falls back to the code for a book it has never heard of', () => {
    expect(bookName('ENO')).toBe('ENO');
  });
});

describe('bookNameAt', () => {
  it('names a book by the number the index keys it under', () => {
    expect(bookNameAt(43)).toBe('João');
  });

  it('names it in the language asked for', () => {
    expect(bookNameAt(43, 'en')).toBe('John');
  });

  it('falls back to the number for a book it has never heard of', () => {
    expect(bookNameAt(67)).toBe('67');
  });
});

describe('the sections', () => {
  it('run from the first book to the last with no gap and no overlap', () => {
    for (const sections of [TESTAMENTS, CATEGORIES]) {
      expect(sections[0].from).toBe(1);
      expect(sections[sections.length - 1].to).toBe(66);
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].from, `after ${sections[i - 1].names.en}`).toBe(
          sections[i - 1].to + 1,
        );
      }
    }
  });

  it('name every division in every language a book is read in', () => {
    for (const section of [...TESTAMENTS, ...CATEGORIES]) {
      for (const lang of langsFor('')) {
        expect(
          section.names[lang],
          `${section.from}-${section.to} in ${lang}`,
        ).toBeTruthy();
      }
    }
  });
});

describe('sectionName', () => {
  it('names the testament a book falls in', () => {
    expect(sectionName(TESTAMENTS, 39)).toBe('Antigo Testamento');
    expect(sectionName(TESTAMENTS, 40)).toBe('Novo Testamento');
  });

  it('names the division a book falls in', () => {
    expect(sectionName(CATEGORIES, 1)).toBe('Lei');
    expect(sectionName(CATEGORIES, 43)).toBe('Evangelhos');
  });

  it('names a division holding a single book, rather than filing it next door', () => {
    expect(sectionName(CATEGORIES, 44)).toBe('Histórico');
    expect(sectionName(CATEGORIES, 66)).toBe('Profecia');
  });

  it('names it in the language asked for', () => {
    expect(sectionName(CATEGORIES, 1, 'en')).toBe('Law');
  });

  it('gathers a book outside every section under a heading of its own', () => {
    expect(sectionName(CATEGORIES, 67)).toBe('Outros');
    expect(sectionName(CATEGORIES, 67, 'en')).toBe('Other');
  });
});
