import { describe, expect, it, vi } from 'vitest';

import { parseReference, referenceLabels } from './reference';

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
