import { describe, expect, it } from 'vitest';

import {
  chapterKey,
  parseBookName,
  parseChapterName,
  parseVerseLine,
} from './utils';

describe('parseChapterName', () => {
  it('splits a chapter file name', () => {
    expect(parseChapterName('NVI-43-JHN-001')).toEqual({
      version: 'NVI',
      bookIndex: 43,
      book: 'JHN',
      chapter: 1,
    });
  });

  it('drops the leading zeros of the book number and the chapter', () => {
    expect(parseChapterName('ACF-09-1SA-017')).toMatchObject({
      bookIndex: 9,
      chapter: 17,
    });
  });

  it('keeps a book code that starts with a number whole', () => {
    expect(parseChapterName('ACF-09-1SA-017')).toMatchObject({ book: '1SA' });
  });

  it('reads any name that is not a chapter as none', () => {
    expect(parseChapterName('Notes')).toBeNull();
    expect(parseChapterName('NVI-43-JHN')).toBeNull();
  });

  describe('inside a version folder', () => {
    it('takes the version from the folder rather than from the name', () => {
      expect(parseChapterName('NVI-43-JHN-001', 'NVI')).toEqual({
        version: 'NVI',
        bookIndex: 43,
        book: 'JHN',
        chapter: 1,
      });
    });

    it('matches the version whatever case it was written in', () => {
      expect(parseChapterName('nvi-43-JHN-001', 'NVI')).toMatchObject({
        chapter: 1,
      });
    });

    it('reads a note that does not carry the version as an ordinary note', () => {
      expect(parseChapterName('Reading plan', 'NVI')).toBeNull();
      expect(parseChapterName('ARA-43-JHN-001', 'NVI')).toBeNull();
    });

    it('reads a book index note as no chapter, since it carries none', () => {
      expect(parseChapterName('NVI-43-Joao', 'NVI')).toBeNull();
    });
  });
});

describe('parseBookName', () => {
  it('takes the book number out of a book index note', () => {
    expect(parseBookName('NVI-43-Joao', 'NVI')).toBe(43);
  });

  it('matches the version whatever case it was written in', () => {
    expect(parseBookName('nvi-43-Joao', 'NVI')).toBe(43);
  });

  it('reads a note belonging to another version as none', () => {
    expect(parseBookName('ARA-43-Joao', 'NVI')).toBeNull();
  });

  it('reads a note that names no book number as none', () => {
    expect(parseBookName('NVI-Joao', 'NVI')).toBeNull();
  });

  it('also answers for a chapter file, which is why chapters are read first', () => {
    expect(parseChapterName('NVI-43-JHN-001', 'NVI')).not.toBeNull();
    expect(parseBookName('NVI-43-JHN-001', 'NVI')).toBe(43);
  });
});

describe('chapterKey', () => {
  it('keys a chapter by its book and number', () => {
    expect(chapterKey(43, 1)).toBe('43:1');
  });

  it('keeps books apart that share a chapter number', () => {
    expect(chapterKey(43, 1)).not.toBe(chapterKey(4, 31));
  });
});

describe('parseVerseLine', () => {
  it('reads a verse written as a list item', () => {
    expect(parseVerseLine('1. No princípio ^nvi-gen-1-1')).toEqual({
      verse: 1,
      text: 'No princípio',
    });
  });

  it('reads a verse written with a bolded number', () => {
    expect(parseVerseLine('**5** Disse Deus ^nvi-gen-1-5')).toEqual({
      verse: 5,
      text: 'Disse Deus',
    });
  });

  it('believes the block id over the number the line writes', () => {
    expect(
      parseVerseLine('3. Um bloco de versículos ^nvi-gen-1-5'),
    ).toMatchObject({ verse: 5 });
  });

  it('falls back to the written number when the line carries no id', () => {
    expect(parseVerseLine('3. Sem id')).toEqual({ verse: 3, text: 'Sem id' });
    expect(parseVerseLine('**3** Sem id')).toEqual({
      verse: 3,
      text: 'Sem id',
    });
  });

  it('falls back to the written number when the id names no verse', () => {
    expect(parseVerseLine('1. Meio da edição ^nvi-gen-1-')).toEqual({
      verse: 1,
      text: 'Meio da edição',
    });
  });

  it('reads a line that is not a verse as none', () => {
    expect(parseVerseLine('## Título ^intro')).toBeNull();
    expect(parseVerseLine('Um parágrafo qualquer')).toBeNull();
    expect(parseVerseLine('')).toBeNull();
  });

  it('leaves the text alone apart from the marker and the id', () => {
    expect(
      parseVerseLine('1. **Deus** disse: «faça-se» ^nvi-gen-1-1'),
    ).toMatchObject({
      text: '**Deus** disse: «faça-se»',
    });
  });
});
