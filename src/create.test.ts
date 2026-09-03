import { describe, expect, it } from 'vitest';

import { chapterNote, declaringNote, renameSegments, verseId } from './create';

describe('renameSegments', () => {
  it('renames the segments the version names, and no others', () => {
    expect(
      renameSegments(
        '5-NT-Gospels/ARA-41-MRK/ARA-41-MRK-014.md',
        'ARA',
        'Shedd',
      ),
    ).toBe('5-NT-Gospels/Shedd-41-MRK/Shedd-41-MRK-014.md');
  });

  it('renames a segment that is the code and nothing else', () => {
    expect(renameSegments('ARA/ARA-01-GEN-001.md', 'ARA', 'Shedd')).toBe(
      'Shedd/Shedd-01-GEN-001.md',
    );
  });

  it('leaves a segment that only begins with the same letters', () => {
    expect(renameSegments('ARAB/ARA-01-GEN-001.md', 'ARA', 'Shedd')).toBe(
      'ARAB/Shedd-01-GEN-001.md',
    );
  });

  it('matches the code without case, the way file names are read', () => {
    expect(renameSegments('ara-01-GEN-001.md', 'ARA', 'Shedd')).toBe(
      'Shedd-01-GEN-001.md',
    );
  });

  it('leaves a flat name alone when it names another version', () => {
    expect(renameSegments('NVI-01-GEN-001.md', 'ARA', 'Shedd')).toBe(
      'NVI-01-GEN-001.md',
    );
  });
});

describe('verseId', () => {
  it('opens with the version and closes with the verse, all lowercase', () => {
    expect(verseId('Shedd', 'MRK', 14, 1)).toBe('shedd-mrk-14-1');
  });
});

describe('chapterNote', () => {
  const verses = [
    { verse: 1, anchor: 'ara-mrk-14-1' },
    { verse: 2, anchor: 'ara-mrk-14-2' },
  ];

  it('embeds each verse over a block id of its own', () => {
    expect(
      chapterNote(
        'Marcos 14',
        'ARA-41-MRK-014',
        'ARA',
        verses,
        'Shedd',
        'MRK',
        14,
      ),
    ).toBe(
      '# Marcos 14\n' +
        '\n' +
        '## [[ARA-41-MRK-014|ARA]]\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-1]]\n' +
        '^shedd-mrk-14-1\n' +
        '\n' +
        '![[ARA-41-MRK-014#^ara-mrk-14-2]]\n' +
        '^shedd-mrk-14-2\n',
    );
  });

  it('leaves a blank line under each verse, so the id belongs to it alone', () => {
    const note = chapterNote(
      'Marcos 14',
      'S',
      'ARA',
      verses,
      'Shedd',
      'MRK',
      14,
    );

    expect(note).toContain('^shedd-mrk-14-1\n\n![[');
  });

  it('writes the heading and nothing under it for a chapter with no anchors', () => {
    expect(
      chapterNote('Marcos 14', 'ARA-41-MRK-014', 'ARA', [], 'Shedd', 'MRK', 14),
    ).toBe('# Marcos 14\n\n## [[ARA-41-MRK-014|ARA]]\n\n');
  });
});

describe('declaringNote', () => {
  it('says the heading, the code and the name', () => {
    expect(declaringNote('Shedd', 'Bíblia Shedd', 'Versões', 'ARA')).toBe(
      '---\n' +
        'bible: true\n' +
        'complete: true\n' +
        'translation: "ARA"\n' +
        'group: "Versões"\n' +
        'code: "Shedd"\n' +
        'name: "Bíblia Shedd"\n' +
        '---\n',
    );
  });

  it('leaves the heading out rather than writing it empty', () => {
    expect(declaringNote('Shedd', 'Bíblia Shedd', '', 'ARA')).toBe(
      '---\nbible: true\ncomplete: true\ntranslation: "ARA"\n' +
        'code: "Shedd"\nname: "Bíblia Shedd"\n---\n',
    );
  });

  it('quotes a name the reader wrote a colon into', () => {
    expect(
      declaringNote('Shedd', 'Bíblia Shedd: edição revista', '', 'ARA'),
    ).toContain('name: "Bíblia Shedd: edição revista"\n');
  });

  it('quotes a heading the reader wrote a colon into', () => {
    expect(
      declaringNote('Shedd', 'Shedd', 'Comentários: Novo Testamento', 'ARA'),
    ).toContain('group: "Comentários: Novo Testamento"\n');
  });

  it('quotes a name that would otherwise open a comment', () => {
    expect(declaringNote('Shedd', '#1 Shedd', '', 'ARA')).toContain(
      'name: "#1 Shedd"\n',
    );
  });

  it('escapes a quote the reader wrote into the name', () => {
    expect(declaringNote('Shedd', 'A "Shedd"', '', 'ARA')).toContain(
      'name: "A \\"Shedd\\""\n',
    );
  });

  it('says a generated version is a whole Bible whatever it answers', () => {
    expect(declaringNote('Shedd', 'Bíblia Shedd', '', 'Rascunho')).toContain(
      'complete: true\n',
    );
  });
});
