import { describe, expect, it } from 'vitest';

import {
  chapterFileName,
  chapterKey,
  hasBlockId,
  verseEmbeds,
  quotePlacement,
  parseBookName,
  parseChapterName,
  parseVerseLine,
  parseVerses,
  verseInId,
  verseWords,
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

  it('carries the lines above an id closing a line that writes on', () => {
    // How Shedd writes a verse it has refs or notes for: the embed, then an
    // aside over as many lines as it takes, the id closing the last of them.
    const verse =
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**:\n' +
      '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].,,';
    expect(
      parseVerses('## Os justos\n\n' + verse + ' ^shedd-psa-1-1\n'),
    ).toEqual([{ verse: 1, text: verse }]);
  });

  it('stops at a heading, so it is not read into the verse under it', () => {
    expect(
      parseVerses('## Os justos\nFeliz o homem. ^shedd-psa-1-1\n'),
    ).toEqual([{ verse: 1, text: 'Feliz o homem.' }]);
  });

  it('leaves a verse that writes itself out alone', () => {
    expect(
      parseVerses('## Uma seção\n1. Falou o SENHOR. ^ara-lev-1-1\n'),
    ).toEqual([{ verse: 1, text: 'Falou o SENHOR.' }]);
  });
});

describe('verseInId', () => {
  it('reads the verse a block id closes with', () => {
    expect(verseInId('ara-lev-1-2')).toBe(2);
    expect(verseInId('test-lev-1-12')).toBe(12);
  });

  it('answers with nothing for an id naming something else', () => {
    expect(verseInId('a500c4')).toBeNull();
    expect(verseInId('ara-lev-1-')).toBeNull();
  });
});

describe('verseEmbeds', () => {
  it('reads the file and block a verse embeds', () => {
    expect(verseEmbeds('![[ARA-41-MRK-014#^ara-mrk-14-1]]')).toMatchObject([
      { path: 'ARA-41-MRK-014', block: 'ara-mrk-14-1' },
    ]);
  });

  it('leaves the label out of it', () => {
    expect(verseEmbeds('![[ARA-41-MRK-014#^ara-mrk-14-1|flat]]')).toMatchObject(
      [{ block: 'ara-mrk-14-1' }],
    );
  });

  it('reads one written with a folder before it', () => {
    expect(
      verseEmbeds('![[Bibles/ARA/ARA-41-MRK-014#^ara-mrk-14-1]]'),
    ).toMatchObject([{ path: 'Bibles/ARA/ARA-41-MRK-014' }]);
  });

  it('says where in the verse each embed sits', () => {
    const text = '![[ARA-41-MRK-014#^ara-mrk-14-1|flat]] — nota';
    const [embed] = verseEmbeds(text);
    expect(text.slice(embed.at, embed.at + embed.length)).toBe(
      '![[ARA-41-MRK-014#^ara-mrk-14-1|flat]]',
    );
  });

  it('reads an embed the verse writes beside words of its own', () => {
    expect(
      verseEmbeds('Antes: ![[ARA-41-MRK-014#^ara-mrk-14-1]] — nota'),
    ).toMatchObject([{ block: 'ara-mrk-14-1' }]);
  });

  it('reads every embed a verse holds', () => {
    expect(
      verseEmbeds(
        '![[ARA-41-MRK-014#^ara-mrk-14-1]]\n![[ARA-41-MRK-014#^ara-mrk-14-2]]',
      ).map((e) => e.block),
    ).toEqual(['ara-mrk-14-1', 'ara-mrk-14-2']);
  });

  it('is nothing for a verse that writes its own words', () => {
    expect(verseEmbeds('No princípio, criou Deus.')).toEqual([]);
  });

  it('is nothing for an embed of a whole file', () => {
    expect(verseEmbeds('![[ARA-41-MRK-014]]')).toEqual([]);
  });

  it('is nothing for a link that is not an embed', () => {
    expect(verseEmbeds('[[ARA-41-MRK-014#^ara-mrk-14-1]]')).toEqual([]);
  });
});

describe('verseWords', () => {
  it('leaves a verse that writes only words alone', () => {
    expect(verseWords('No princípio, criou Deus.')).toBe(
      'No princípio, criou Deus.',
    );
  });

  it('drops an aside, delimiters and all', () => {
    expect(
      verseWords('Feliz o homem ,,**Refs**: Sl 26.4.,, que não anda'),
    ).toBe('Feliz o homem que não anda');
  });

  it('drops an aside written over more than one line', () => {
    expect(
      verseWords('Feliz o homem ,,**Refs**:\n[[Shedd-19-PSA-026|Sl 26.4]].,,'),
    ).toBe('Feliz o homem');
  });

  it('drops what an aside holds, marks and all', () => {
    expect(verseWords('Feliz ,,nota ^1^ mais,, homem')).toBe('Feliz homem');
  });

  it('drops an embed of what is no verse, bang and all', () => {
    expect(verseWords('![[ARA-41-MRK-014]] mais')).toBe('mais');
  });

  it('reads a link as the label it was given', () => {
    expect(
      verseWords('Veja [[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].'),
    ).toBe('Veja Sl 26.4.');
  });

  it('reads a link with no label as what it names', () => {
    expect(verseWords('Veja [[Salmo 26]].')).toBe('Veja Salmo 26.');
  });

  it('keeps the words a mark other than an aside holds', () => {
    expect(verseWords('Filho ^1^ de Deus ~2~')).toBe('Filho 1 de Deus 2');
  });

  it('reads a verse written over lines as one line', () => {
    expect(verseWords('Principio do evangelho\nde Jesus Cristo.')).toBe(
      'Principio do evangelho de Jesus Cristo.',
    );
  });
});
