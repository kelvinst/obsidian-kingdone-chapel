import { describe, expect, it } from 'vitest';

import { parseReference, verseLabels } from './reference';

/** No word names a version, so a leading word is always part of the book. */
const noVersions = () => false;
const isAra = (word: string) => word === 'ARA';

describe('parseReference', () => {
  it('reads a book on its own as the whole book', () => {
    expect(parseReference('Joao', noVersions)).toEqual({
      version: null,
      book: 'Joao',
      chapter: null,
      verses: [],
    });
  });

  it('reads a chapter', () => {
    expect(parseReference('Joao 1', noVersions)).toMatchObject({ book: 'Joao', chapter: 1, verses: [] });
  });

  it('reads a verse', () => {
    expect(parseReference('Joao 1.1', noVersions)).toMatchObject({ chapter: 1, verses: [1] });
  });

  it('accepts a colon as well as a dot', () => {
    expect(parseReference('Joao 1:1', noVersions)).toMatchObject({ chapter: 1, verses: [1] });
  });

  it('keeps listed verses in the order they were written, without duplicates', () => {
    expect(parseReference('Joao 1.3,1,3', noVersions)).toMatchObject({ verses: [3, 1] });
  });

  it('expands a range', () => {
    expect(parseReference('Joao 1.1-3', noVersions)).toMatchObject({ verses: [1, 2, 3] });
  });

  it('mixes ranges and single verses', () => {
    expect(parseReference('Joao 1.1,3-5', noVersions)).toMatchObject({ verses: [1, 3, 4, 5] });
  });

  it('splits a numbered book after its name, not before it', () => {
    expect(parseReference('1 Joao 1.1', noVersions)).toMatchObject({
      version: null,
      book: '1 Joao',
      chapter: 1,
      verses: [1],
    });
  });

  it('takes a leading word as a version only when it names one', () => {
    expect(parseReference('ARA Joao 1.1', isAra)).toMatchObject({ version: 'ARA', book: 'Joao' });
    expect(parseReference('ARA Joao 1.1', noVersions)).toMatchObject({ version: null, book: 'ARA Joao' });
  });

  it('reads nothing as no reference at all', () => {
    expect(parseReference('', noVersions)).toBeNull();
    expect(parseReference('   ', noVersions)).toBeNull();
  });

  describe('half-written references', () => {
    it('reads a dangling separator as the whole chapter', () => {
      expect(parseReference('Joao 1.', noVersions)).toMatchObject({ chapter: 1, verses: [] });
    });

    it('reads an unfinished range as its start', () => {
      expect(parseReference('Joao 1.3-', noVersions)).toMatchObject({ verses: [3] });
    });

    it('reads a range written backwards as its start', () => {
      expect(parseReference('Joao 1.5-1', noVersions)).toMatchObject({ verses: [5] });
    });
  });

  describe('the verse cap', () => {
    it('carries fifty verses', () => {
      expect(parseReference('Joao 1.1-50', noVersions)?.verses).toHaveLength(50);
    });

    it('refuses a reference reaching past fifty rather than cutting it short', () => {
      expect(parseReference('Joao 1.1-51', noVersions)).toBeNull();
      expect(parseReference('Joao 1.1-40,30-70', noVersions)).toBeNull();
    });

    it('counts a verse once, so repeats never reach the cap', () => {
      expect(parseReference('Joao 1.1-50,1-50', noVersions)?.verses).toHaveLength(50);
    });
  });
});

describe('verseLabels', () => {
  it('labels a whole book with its name', () => {
    expect(verseLabels('João', null, [])).toEqual(['João']);
  });

  it('ignores verses when there is no chapter to hang them on', () => {
    expect(verseLabels('João', null, [1, 2])).toEqual(['João']);
  });

  it('labels a whole chapter', () => {
    expect(verseLabels('João', 1, [])).toEqual(['João 1']);
  });

  it('spells the reference out once and then only the verse numbers', () => {
    expect(verseLabels('João', 1, [1, 2, 3])).toEqual(['João 1.1', '2', '3']);
  });
});
