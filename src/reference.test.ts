import { describe, expect, it, vi } from 'vitest';

import {
  booklessLabels,
  booklessPassageLabel,
  fitsChapters,
  isNumbers,
  parseBookless,
  parseNumbers,
  parseReference,
  passageId,
  passageLabel,
  referenceLabels,
  verseSpec,
} from './reference';

/** No word names a version, so a leading word is always part of the book. */
const noVersions = () => false;
const isAra = (word: string) => word === 'ARA';

describe('parseReference', () => {
  it('reads a book on its own as the whole book', () => {
    expect(parseReference('Joao', noVersions)).toEqual({
      version: null,
      versionPrefix: false,
      book: 'Joao',
      chapters: [],
      verses: [],
    });
  });

  it('reads a chapter', () => {
    expect(parseReference('Joao 1', noVersions)).toMatchObject({
      book: 'Joao',
      chapters: [1],
      verses: [],
    });
  });

  describe('a run of chapters', () => {
    it('expands a range into one chapter each', () => {
      expect(parseReference('Joao 1-3', noVersions)).toMatchObject({
        book: 'Joao',
        chapters: [1, 2, 3],
        verses: [],
      });
    });

    it('keeps a list in the order it was written, without duplicates', () => {
      expect(parseReference('Joao 3,1,3', noVersions)).toMatchObject({
        chapters: [3, 1],
      });
    });

    it('mixes ranges and single chapters', () => {
      expect(parseReference('Joao 1-3,7', noVersions)).toMatchObject({
        chapters: [1, 2, 3, 7],
      });
    });

    it('reads an unfinished range as its start', () => {
      expect(parseReference('Joao 1-', noVersions)).toMatchObject({
        chapters: [1],
      });
    });

    it('names a version when a space sits in front of the dash', () => {
      expect(parseReference('Joao 1 - 3', noVersions)).toMatchObject({
        version: '3',
        versionPrefix: true,
        chapters: [1],
      });
    });

    it('leaves a numbered book its number, which is no chapter run', () => {
      expect(parseReference('Joao 1 2', noVersions)).toMatchObject({
        book: 'Joao 1',
        chapters: [2],
      });
    });

    it('refuses verses hung on a run, having no one chapter to hang them on', () => {
      expect(parseReference('Joao 1-3.2', noVersions)).toBeNull();
    });

    it('reads the run alone while the verse separator is still bare', () => {
      expect(parseReference('Joao 1-3.', noVersions)).toMatchObject({
        chapters: [1, 2, 3],
        verses: [],
      });
    });
  });

  it('reads a verse', () => {
    expect(parseReference('Joao 1.1', noVersions)).toMatchObject({
      chapters: [1],
      verses: [1],
    });
  });

  it('accepts a colon as well as a dot', () => {
    expect(parseReference('Joao 1:1', noVersions)).toMatchObject({
      chapters: [1],
      verses: [1],
    });
  });

  it('keeps listed verses in the order they were written, without duplicates', () => {
    expect(parseReference('Joao 1.3,1,3', noVersions)).toMatchObject({
      verses: [3, 1],
    });
  });

  it('expands a range', () => {
    expect(parseReference('Joao 1.1-3', noVersions)).toMatchObject({
      verses: [1, 2, 3],
    });
  });

  it('mixes ranges and single verses', () => {
    expect(parseReference('Joao 1.1,3-5', noVersions)).toMatchObject({
      verses: [1, 3, 4, 5],
    });
  });

  it('splits a numbered book after its name, not before it', () => {
    expect(parseReference('1 Joao 1.1', noVersions)).toMatchObject({
      version: null,
      book: '1 Joao',
      chapters: [1],
      verses: [1],
    });
  });

  it('takes a leading word as a version only when it names one', () => {
    expect(parseReference('ARA Joao 1.1', isAra)).toMatchObject({
      version: 'ARA',
      book: 'Joao',
    });
    expect(parseReference('ARA Joao 1.1', noVersions)).toMatchObject({
      version: null,
      book: 'ARA Joao',
    });
  });

  describe('a version said after the reference', () => {
    it('is read where it is spoken', () => {
      expect(parseReference('Joao 1.1 ARA', isAra)).toMatchObject({
        version: 'ARA',
        versionPrefix: false,
        book: 'Joao',
        chapters: [1],
        verses: [1],
      });
    });

    it('comes off before the chapter is looked for, so the chapter is still the last number', () => {
      expect(parseReference('1 Joao 1.1 ARA', isAra)).toMatchObject({
        book: '1 Joao',
        chapters: [1],
        verses: [1],
      });
    });

    it('is only a version once it names one — a word that does not stays part of the book', () => {
      expect(parseReference('Joao 1 n', isAra)).toMatchObject({
        version: null,
        book: 'Joao 1 n',
        chapters: [],
      });
    });
  });

  describe('a version marked with a dash', () => {
    it('is read as far as it has been written', () => {
      expect(parseReference('Joao 1.1 -ara', noVersions)).toMatchObject({
        version: 'ara',
        versionPrefix: true,
        book: 'Joao',
        chapters: [1],
        verses: [1],
      });
    });

    it('says so itself, and is never put to the version table', () => {
      const isVersion = vi.fn(() => false);
      expect(parseReference('Joao 1.1 -ara', isVersion)).toMatchObject({
        version: 'ara',
        versionPrefix: true,
      });
      expect(isVersion).not.toHaveBeenCalled();
    });

    it('reads a dash with nothing after it yet as the beginning of every version', () => {
      expect(parseReference('Joao 1.1 -', noVersions)).toMatchObject({
        version: '',
        versionPrefix: true,
        chapters: [1],
        verses: [1],
      });
    });

    it('may sit anywhere in the reference', () => {
      for (const query of ['-ara Joao 1.1', 'Joao -ara 1.1', 'Joao 1.1 -ara']) {
        expect(parseReference(query, noVersions), query).toMatchObject({
          version: 'ara',
          book: 'Joao',
          chapters: [1],
          verses: [1],
        });
      }
    });
  });

  describe('the dash, which writes a run of verses as well', () => {
    it('writes a run when it is closed up', () => {
      expect(parseReference('Joao 1.1-3', noVersions)).toMatchObject({
        version: null,
        versionPrefix: false,
        verses: [1, 2, 3],
      });
    });

    it('names a version when a space sits in front of it, even followed by a number', () => {
      expect(parseReference('Joao 1.1 - 3', noVersions)).toMatchObject({
        version: '3',
        versionPrefix: true,
        chapters: [1],
        verses: [1],
      });
    });

    it('writes no run when a space sits after it, by the same rule read from the other side', () => {
      expect(parseReference('Joao 1.1- 3', noVersions)).toMatchObject({
        version: null,
        chapters: [1],
        verses: [],
      });
    });
  });

  it('reads nothing as no reference at all', () => {
    expect(parseReference('', noVersions)).toBeNull();
    expect(parseReference('   ', noVersions)).toBeNull();
  });

  describe('half-written references', () => {
    it('reads a dangling separator as the whole chapter', () => {
      expect(parseReference('Joao 1.', noVersions)).toMatchObject({
        chapters: [1],
        verses: [],
      });
    });

    it('reads an unfinished range as its start', () => {
      expect(parseReference('Joao 1.3-', noVersions)).toMatchObject({
        verses: [3],
      });
    });

    it('reads a range written backwards as its start', () => {
      expect(parseReference('Joao 1.5-1', noVersions)).toMatchObject({
        verses: [5],
      });
    });
  });

  describe('the chapter cap', () => {
    it('carries twenty-five chapters', () => {
      expect(parseReference('Joao 1-25', noVersions)?.chapters).toHaveLength(
        25,
      );
    });

    it('refuses a run reaching past twenty-five rather than cutting it short', () => {
      expect(parseReference('Joao 1-26', noVersions)).toBeNull();
      expect(parseReference('Joao 1-150', noVersions)).toBeNull();
    });

    it('counts a chapter once, so repeats never reach the cap', () => {
      expect(
        parseReference('Joao 1-25,1-25', noVersions)?.chapters,
      ).toHaveLength(25);
    });
  });

  describe('the verse cap', () => {
    it('carries fifty verses', () => {
      expect(parseReference('Joao 1.1-50', noVersions)?.verses).toHaveLength(
        50,
      );
    });

    it('refuses a reference reaching past fifty rather than cutting it short', () => {
      expect(parseReference('Joao 1.1-51', noVersions)).toBeNull();
      expect(parseReference('Joao 1.1-40,30-70', noVersions)).toBeNull();
    });

    it('counts the verses listed one by one against the cap too', () => {
      expect(parseReference('Joao 1.1-50,51', noVersions)).toBeNull();
    });

    it('counts a verse once, so repeats never reach the cap', () => {
      expect(
        parseReference('Joao 1.1-50,1-50', noVersions)?.verses,
      ).toHaveLength(50);
    });
  });
});

describe('referenceLabels', () => {
  it('labels a whole book with its name', () => {
    expect(referenceLabels('João', [], [])).toEqual(['João']);
  });

  it('ignores verses when there is no chapter to hang them on', () => {
    expect(referenceLabels('João', [], [1, 2])).toEqual(['João']);
  });

  it('labels a whole chapter', () => {
    expect(referenceLabels('João', [1], [])).toEqual(['João 1']);
  });

  it('spells the reference out once and then only the verse numbers', () => {
    expect(referenceLabels('João', [1], [1, 2, 3])).toEqual([
      'João 1.1',
      '2',
      '3',
    ]);
  });

  it('spells the reference out once and then only the chapter numbers', () => {
    expect(referenceLabels('João', [1, 2, 3], [])).toEqual([
      'João 1',
      '2',
      '3',
    ]);
  });

  it('hangs verses off the one chapter a run of them may sit in', () => {
    expect(referenceLabels('João', [5], [1, 2])).toEqual(['João 5.1', '2']);
  });

  describe('a version', () => {
    it('is named after the last verse, where it reads as the whole reference’s', () => {
      expect(referenceLabels('João', [1], [1, 2, 3], 'NVI')).toEqual([
        'João 1.1',
        '2',
        '3 - NVI',
      ]);
    });

    it('is named after the last chapter of a run', () => {
      expect(referenceLabels('João', [1, 2, 3], [], 'NVI')).toEqual([
        'João 1',
        '2',
        '3 - NVI',
      ]);
    });

    it('is named after a whole chapter, and after a whole book', () => {
      expect(referenceLabels('João', [1], [], 'NVI')).toEqual(['João 1 - NVI']);
      expect(referenceLabels('João', [], [], 'NVI')).toEqual(['João - NVI']);
    });

    it('goes unsaid when there is none', () => {
      expect(referenceLabels('João', [1], [1], null)).toEqual(['João 1.1']);
    });
  });
});

describe('parseBookless', () => {
  it('reads a chapter and a verse written without a book', () => {
    expect(parseBookless('3.1')).toEqual({ chapter: 3, verses: [1] });
  });

  it('reads a colon the way it reads a dot', () => {
    expect(parseBookless('3:1')).toEqual({ chapter: 3, verses: [1] });
  });

  it('expands a run of verses', () => {
    expect(parseBookless('3.1-4')).toEqual({
      chapter: 3,
      verses: [1, 2, 3, 4],
    });
  });

  it('reads numbers alone as verses of the chapter carried in', () => {
    expect(parseBookless('9,10')).toEqual({ chapter: null, verses: [9, 10] });
  });

  it('keeps a chapter still missing its verse', () => {
    expect(parseBookless('3.')).toEqual({ chapter: 3, verses: [] });
  });

  it('leaves anything carrying a letter to `parseReference`', () => {
    expect(parseBookless('Joao 1.1')).toBeNull();
    expect(parseBookless('3.1 -ara')).toBeNull();
  });

  it('reads nothing out of nothing', () => {
    expect(parseBookless('   ')).toBeNull();
  });

  it('refuses numbers that name no verse', () => {
    expect(parseBookless('0')).toBeNull();
    expect(parseBookless('1.2.3')).toBeNull();
  });

  it('refuses a run reaching past the verse cap', () => {
    expect(parseBookless('1.1-60')).toBeNull();
    expect(parseBookless('1-60')).toBeNull();
  });
});

describe('booklessLabels', () => {
  it('writes the chapter it was given when no verse was', () => {
    expect(booklessLabels({ chapter: 3, verses: [] }, 3)).toEqual(['3']);
  });

  it('keeps the chapter the reference wrote, verse by verse', () => {
    expect(booklessLabels({ chapter: 3, verses: [1, 2] }, 3)).toEqual([
      '3.1',
      '2',
    ]);
  });

  it('leaves carried verses as the bare numbers they were typed as', () => {
    expect(booklessLabels({ chapter: null, verses: [9, 10] }, 2)).toEqual([
      '9',
      '10',
    ]);
  });
});

describe('verseSpec', () => {
  it('writes a single verse as itself', () => {
    expect(verseSpec([1])).toBe('1');
  });

  it('closes a run of verses back up into the dash it was typed as', () => {
    expect(verseSpec([47, 48, 49, 50, 51, 52, 53, 54, 55, 56])).toBe('47-56');
  });

  it('leaves a pair as a pair, which is no longer to read than the dash', () => {
    expect(verseSpec([1, 2])).toBe('1,2');
  });

  it('lists verses that are not consecutive', () => {
    expect(verseSpec([1, 4, 9])).toBe('1,4,9');
  });

  it('mixes runs and single verses, the way the reference was written', () => {
    expect(verseSpec([1, 3, 4, 5])).toBe('1,3-5');
    expect(verseSpec([1, 2, 4, 5, 6, 9])).toBe('1,2,4-6,9');
  });

  it('keeps the order it was given, so verses out of order stay a list', () => {
    expect(verseSpec([5, 1])).toBe('5,1');
  });

  it('writes nothing for no verses at all', () => {
    expect(verseSpec([])).toBe('');
  });
});

describe('passageLabel', () => {
  it('reads as the whole passage, in one label', () => {
    expect(passageLabel('Mateus', 26, [47, 48, 49])).toBe('Mateus 26.47-49');
  });

  it('names a version at the very end, where it belongs to the reference', () => {
    expect(passageLabel('Mateus', 26, [47, 48, 49], 'NVI')).toBe(
      'Mateus 26.47-49 - NVI',
    );
  });

  it('goes unsaid when there is no version', () => {
    expect(passageLabel('Mateus', 26, [47, 48], null)).toBe('Mateus 26.47,48');
  });
});

describe('passageId', () => {
  it('is written in the shape the verse anchors already use', () => {
    expect(passageId('NVI', 'MAT', 26, [47, 48, 49])).toBe('nvi-mat-26-47-49');
  });

  it('writes a list of verses with dashes, since a block id carries no commas', () => {
    expect(passageId('NVI', 'JHN', 1, [1, 3, 4, 5])).toBe('nvi-jhn-1-1-3-5');
  });

  it('writes a version named by a folder as something a block id can hold', () => {
    expect(passageId('King James', 'JHN', 1, [1, 2, 3])).toBe(
      'king-james-jhn-1-1-3',
    );
    expect(passageId('NVI.2011', 'JHN', 1, [1, 2, 3])).toBe(
      'nvi-2011-jhn-1-1-3',
    );
  });

  it('folds the accents of a version into the letters they sit on', () => {
    expect(passageId('ARÁ', 'JHN', 1, [1, 2, 3])).toBe('ara-jhn-1-1-3');
  });

  it('tells apart versions whose names a block id cannot carry at all', () => {
    const first = passageId('和合本', 'JHN', 1, [1, 2, 3]);
    const second = passageId('新譯本', 'JHN', 1, [1, 2, 3]);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[a-z0-9]+-jhn-1-1-3$/);
    expect(second).toMatch(/^[a-z0-9]+-jhn-1-1-3$/);
  });

  it('leaves no dash hanging off either end of the id', () => {
    expect(passageId('(ARA)', 'JHN', 1, [1, 2, 3])).toBe('ara-jhn-1-1-3');
  });

  it('answers the same passage with the same id, however it was asked for', () => {
    expect(passageId('NVI', 'JHN', 1, [1, 2, 3])).toBe(
      passageId('nvi', 'jhn', 1, [1, 2, 3]),
    );
  });
});

describe('booklessPassageLabel', () => {
  it('reads a carried run as the verses alone', () => {
    expect(booklessPassageLabel({ chapter: null, verses: [1, 2, 3] }, 3)).toBe(
      '1-3',
    );
  });

  it('says the chapter the carried reference named itself', () => {
    expect(booklessPassageLabel({ chapter: 3, verses: [1, 2, 3] }, 3)).toBe(
      '3.1-3',
    );
  });

  it('lists verses that are not a run, as they were written', () => {
    expect(booklessPassageLabel({ chapter: null, verses: [1, 4] }, 3)).toBe(
      '1,4',
    );
  });
});

describe('parseNumbers', () => {
  it('reads a number written on its own', () => {
    expect(parseNumbers('1')).toEqual([1]);
  });

  it('reads a list and a run, the way a reference writes them', () => {
    expect(parseNumbers('1,2,3')).toEqual([1, 2, 3]);
    expect(parseNumbers('1-3')).toEqual([1, 2, 3]);
  });

  it('reads what is written around the spaces', () => {
    expect(parseNumbers(' 1, 2 ')).toEqual([1, 2]);
  });

  it('is not this kind of reference once a letter is in it', () => {
    expect(parseNumbers('Joao 1')).toBeNull();
    expect(parseNumbers('1 ARA')).toBeNull();
    expect(parseNumbers('1.1')).toBeNull();
  });

  it('refuses a run reaching for more verses than a reference may carry', () => {
    expect(parseNumbers('1-99')).toBeNull();
  });

  it('comes back with nothing when the numbers are still to be written', () => {
    expect(parseNumbers(',')).toEqual([]);
    expect(parseNumbers('-')).toEqual([]);
  });
});

describe('isNumbers', () => {
  it('tells a query written as numbers alone from any other', () => {
    expect(isNumbers('1-3')).toBe(true);
    expect(isNumbers(' 1, 2 ')).toBe(true);
    expect(isNumbers('Joao 1')).toBe(false);
    expect(isNumbers('1.1')).toBe(false);
  });

  it('says so of a run past the cap, which reads as numbers all the same', () => {
    expect(isNumbers('1-99')).toBe(true);
    expect(parseNumbers('1-99')).toBeNull();
  });
});

describe('parseNumbers', () => {
  it('reads a number written on its own', () => {
    expect(parseNumbers('1')).toEqual([1]);
  });

  it('reads a list and a run, the way a reference writes them', () => {
    expect(parseNumbers('1,2,3')).toEqual([1, 2, 3]);
    expect(parseNumbers('1-3')).toEqual([1, 2, 3]);
  });

  it('reads what is written around the spaces', () => {
    expect(parseNumbers(' 1, 2 ')).toEqual([1, 2]);
  });

  it('is not this kind of reference once a letter is in it', () => {
    expect(parseNumbers('Joao 1')).toBeNull();
    expect(parseNumbers('1 ARA')).toBeNull();
    expect(parseNumbers('1.1')).toBeNull();
  });

  it('refuses a run reaching for more verses than a reference may carry', () => {
    expect(parseNumbers('1-99')).toBeNull();
  });

  it('comes back with nothing when the numbers are still to be written', () => {
    expect(parseNumbers(',')).toEqual([]);
    expect(parseNumbers('-')).toEqual([]);
  });
});

describe('isNumbers', () => {
  it('tells a query written as numbers alone from any other', () => {
    expect(isNumbers('1-3')).toBe(true);
    expect(isNumbers(' 1, 2 ')).toBe(true);
    expect(isNumbers('Joao 1')).toBe(false);
    expect(isNumbers('1.1')).toBe(false);
  });

  it('says so of a run past the cap, which reads as numbers all the same', () => {
    expect(isNumbers('1-99')).toBe(true);
    expect(parseNumbers('1-99')).toBeNull();
  });
});

describe('fitsChapters', () => {
  it('takes a run no longer than a run of chapters may be', () => {
    expect(fitsChapters([1, 2, 3])).toBe(true);
    expect(fitsChapters(parseNumbers('1-25') as number[])).toBe(true);
  });

  it('turns down one that only a run of verses could carry', () => {
    expect(fitsChapters(parseNumbers('1-26') as number[])).toBe(false);
  });
});
