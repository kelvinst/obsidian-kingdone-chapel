import { describe, expect, it } from 'vitest';

import {
  chapterFileName,
  chapterKey,
  hasBlockId,
  quotePlacement,
  parseBookName,
  parseChapterName,
  parseVerseLine,
  parseVerses,
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

describe('chapterFileName', () => {
  it('names another chapter of the same book, padded as the example is', () => {
    expect(chapterFileName('NVI-43-JHN-001', 2)).toBe('NVI-43-JHN-002');
    expect(chapterFileName('NVI-43-JHN-001', 21)).toBe('NVI-43-JHN-021');
  });

  it('keeps the version exactly as the version writes it', () => {
    expect(chapterFileName('nvi-43-JHN-001', 2)).toBe('nvi-43-JHN-002');
  });

  it('splits at the last dash, so a numbered book keeps its number', () => {
    expect(chapterFileName('NVI-09-1SA-001', 2)).toBe('NVI-09-1SA-002');
  });

  it('pads to the width the example used, and no further', () => {
    expect(chapterFileName('NVI-19-PSA-1', 12)).toBe('NVI-19-PSA-12');
    expect(chapterFileName('NVI-19-PSA-001', 150)).toBe('NVI-19-PSA-150');
  });

  it('reads the whole-book file a commentary keeps as an example like any other', () => {
    expect(chapterFileName('COM-01-GEN-000', 1)).toBe('COM-01-GEN-001');
  });

  it('has no answer where the example ends in no chapter number', () => {
    expect(chapterFileName('NVI-43-Joao', 1)).toBeNull();
    expect(chapterFileName('', 1)).toBeNull();
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

describe('quotePlacement', () => {
  const headings = ['Citações', 'Quotes'];
  const quote = '> [!quote]+ João 1.1,2';
  /** What the placement writes, read back as the note it leaves behind. */
  const written = (text: string) => {
    const at = quotePlacement(text, headings, quote);
    const lines = text.split('\n');
    const line = lines[at.line];
    lines[at.line] = line.slice(0, at.ch) + at.text + line.slice(at.ch);
    return lines.join('\n');
  };

  it('opens the section at the end of a note that has none', () => {
    expect(written('Some note')).toBe(`Some note\n\n## Citações\n\n${quote}\n`);
  });

  it('writes the heading of the language it was given first', () => {
    expect(quotePlacement('', ['Quotes', 'Citações'], quote).text).toBe(
      `## Quotes\n\n${quote}\n`,
    );
  });

  it('leaves one blank line, however the note happened to end', () => {
    expect(written('Some note\n')).toBe(
      `Some note\n\n## Citações\n\n${quote}\n`,
    );
    expect(written('Some note\n\n')).toBe(
      `Some note\n\n## Citações\n\n${quote}\n`,
    );
  });

  it('adds to the section a note already keeps its quotes under', () => {
    expect(written(`Some note\n\n## Citações\n\n> [!quote]+ João 3.16\n`)).toBe(
      `Some note\n\n## Citações\n\n> [!quote]+ João 3.16\n\n${quote}\n`,
    );
  });

  it('closes the file when the quote is the last thing in it', () => {
    expect(written('## Citações\n\n> [!quote]+ João 3.16')).toBe(
      `## Citações\n\n> [!quote]+ João 3.16\n\n${quote}\n`,
    );
  });

  it('recognises the section under either language’s name', () => {
    expect(written(`Some note\n\n## Quotes\n\n> [!quote]+ João 3.16\n`)).toBe(
      `Some note\n\n## Quotes\n\n> [!quote]+ João 3.16\n\n${quote}\n`,
    );
  });

  it('passes over the sections that are not the one quotes are kept under', () => {
    expect(
      written(
        `## Notas\n\nMais texto\n\n## Citações\n\n> [!quote]+ João 3.16\n`,
      ),
    ).toBe(
      `## Notas\n\nMais texto\n\n## Citações\n\n> [!quote]+ João 3.16\n\n${quote}\n`,
    );
  });

  it('reads past a heading that a fenced example is only showing', () => {
    const note = [
      'Como funciona:',
      '',
      '```markdown',
      '## Citações',
      '',
      '> [!quote]+ João 3.16',
      '```',
      '',
      '## Notas',
      '',
      'Mais texto',
      '',
    ].join('\n');
    // The example is not the section, so the note is given one of its own,
    // after everything it says.
    expect(written(note)).toBe(`${note}\n## Citações\n\n${quote}\n`);
  });

  it('is not ended by a heading inside a fence in its own section', () => {
    const note = [
      '## Citações',
      '',
      '> [!quote]+ João 3.16',
      '',
      '```markdown',
      '## Notas',
      '```',
      '',
    ].join('\n');
    expect(written(note)).toBe(
      `## Citações\n\n> [!quote]+ João 3.16\n\n\`\`\`markdown\n## Notas\n\`\`\`\n\n${quote}\n`,
    );
  });

  it('backs out of a code block left open at the end of the note', () => {
    const note = [
      '## Citações',
      '',
      '> [!quote]+ João 3.16',
      '',
      '```markdown',
      '## exemplo',
    ].join('\n');
    expect(written(note)).toBe(
      `## Citações\n\n> [!quote]+ João 3.16\n\n${quote}\n\n\`\`\`markdown\n## exemplo`,
    );
  });

  it('opens the section before a code block left open, not inside it', () => {
    const note = ['Nota', '', '```markdown', '## exemplo'].join('\n');
    expect(written(note)).toBe(
      `Nota\n\n## Citações\n\n${quote}\n\n\`\`\`markdown\n## exemplo`,
    );
  });

  it('stops at the section that follows, rather than writing into it', () => {
    expect(
      written(
        `## Citações\n\n> [!quote]+ João 3.16\n\n## Notas\n\nMais texto\n`,
      ),
    ).toBe(
      `## Citações\n\n> [!quote]+ João 3.16\n\n${quote}\n\n## Notas\n\nMais texto\n`,
    );
  });

  it('writes the first quote of an empty section under its heading', () => {
    expect(written('## Citações\n')).toBe(`## Citações\n\n${quote}\n`);
  });

  it('has nothing to leave a blank line after in an empty note', () => {
    expect(quotePlacement('', headings, quote).text).toBe(
      `## Citações\n\n${quote}\n`,
    );
  });
});

describe('hasBlockId', () => {
  it('finds the id closing a line', () => {
    expect(
      hasBlockId('> ![[NVI-43-JHN-001]] ^nvi-jhn-1-1-3', 'nvi-jhn-1-1-3'),
    ).toBe(true);
  });

  it('reads past the spaces a line may end in', () => {
    expect(hasBlockId('texto ^nvi-jhn-1-1-3  \nmais', 'nvi-jhn-1-1-3')).toBe(
      true,
    );
  });

  it('does not read the id out of a link that only names it', () => {
    expect(hasBlockId('[[#^nvi-jhn-1-1-3|João 1.1-3]]', 'nvi-jhn-1-1-3')).toBe(
      false,
    );
  });

  it('does not read an id a fenced example is only showing', () => {
    const note = [
      'Assim:',
      '',
      '```markdown',
      '> ![[NVI-43-JHN-001#^nvi-jhn-1-3]] ^nvi-jhn-1-1-3',
      '```',
      '',
    ].join('\n');
    expect(hasBlockId(note, 'nvi-jhn-1-1-3')).toBe(false);
  });

  it('does not answer for an id the note does not carry', () => {
    expect(hasBlockId('texto ^nvi-jhn-1-1-2', 'nvi-jhn-1-1-3')).toBe(false);
  });
});

describe('parseVerses', () => {
  it('reads a version that writes each verse on its own line', () => {
    expect(
      parseVerses(
        '# Levítico 1\n\n' +
          '¹ Falou o SENHOR a Moisés. ^ara-lev-1-1\n\n' +
          '² Fala aos filhos de Israel. ^ara-lev-1-2\n',
      ),
    ).toEqual([
      { verse: 1, text: '¹ Falou o SENHOR a Moisés.' },
      { verse: 2, text: '² Fala aos filhos de Israel.' },
    ]);
  });

  it('takes what stands above an id that sits on a line of its own', () => {
    expect(
      parseVerses(
        '# Levítico 1\n\n' +
          '## [[NVI-03-LEV-001|NVI]]\n\n' +
          '![[NVI-03-LEV-001#^nvi-lev-1-1]]\n' +
          '^test-lev-1-1\n\n' +
          '![[NVI-03-LEV-001#^nvi-lev-1-2]]\n' +
          '^test-lev-1-2\n',
      ),
    ).toEqual([
      { verse: 1, text: '![[NVI-03-LEV-001#^nvi-lev-1-1]]' },
      { verse: 2, text: '![[NVI-03-LEV-001#^nvi-lev-1-2]]' },
    ]);
  });

  it('carries every line written under the verse, down to its id', () => {
    expect(
      parseVerses(
        '![[NVI-03-LEV-001#^nvi-lev-1-1]]\n' +
          'A oferta é voluntária.\n' +
          '^test-lev-1-1\n',
      ),
    ).toEqual([
      {
        verse: 1,
        text: '![[NVI-03-LEV-001#^nvi-lev-1-1]]\nA oferta é voluntária.',
      },
    ]);
  });

  it('stops at the blank line, so a heading is not read as a verse', () => {
    expect(parseVerses('## Uma seção\n\n^test-lev-1-1\n')).toEqual([
      { verse: 1, text: '' },
    ]);
  });

  it('leaves a verse that writes itself out alone', () => {
    expect(
      parseVerses('## Uma seção\n1. Falou o SENHOR. ^ara-lev-1-1\n'),
    ).toEqual([{ verse: 1, text: 'Falou o SENHOR.' }]);
  });
});
