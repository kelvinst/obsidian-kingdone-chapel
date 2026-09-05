import { describe, expect, it } from 'vitest';

import {
  markerWrite,
  nextNoteNumber,
  noteAnchor,
  noteBlock,
  notePlacement,
  noteWrites,
} from './notes';
import type { Write } from './notes';

/** A chapter written the way the generator writes one: embed, then id. */
function chapter(...verses: string[][]): string {
  const body = verses.map((lines) => lines.join('\n')).join('\n\n');
  return `# Salmos 1 - Shedd\n\n## [[ARA-19-PSA-001|ARA]]\n\n${body}\n`;
}

function verse(n: number, ...extra: string[]): string[] {
  return [
    `![[ARA-19-PSA-001#^ara-psa-1-${n}|flat]]`,
    ...extra,
    `^shedd-psa-1-${n}`,
  ];
}

/** The text `writes` leave behind, applied the way the command applies them. */
function applied(text: string, writes: Write[]): string {
  const lines = text.split('\n');
  for (const write of writes) {
    const head = lines[write.from.line].slice(0, write.from.ch);
    const tail = lines[write.to.line].slice(write.to.ch);
    lines.splice(
      write.from.line,
      write.to.line - write.from.line + 1,
      ...(head + write.text + tail).split('\n'),
    );
  }
  return lines.join('\n');
}

describe('noteAnchor', () => {
  it('names a note by its chapter, its kind and its number', () => {
    expect(noteAnchor('shedd-psa-1', 'n', 2)).toBe('shedd-psa-1-n2');
    expect(noteAnchor('shedd-mrk-14', 'h', 2)).toBe('shedd-mrk-14-h2');
  });
});

describe('nextNoteNumber', () => {
  it('starts at one in a chapter carrying no note of that kind', () => {
    expect(nextNoteNumber('', 'shedd-psa-1', 'n')).toBe(1);
  });

  it('follows the highest number already written', () => {
    const text = chapter(verse(1)) + '\n^shedd-psa-1-n1\n^shedd-psa-1-n8\n';
    expect(nextNoteNumber(text, 'shedd-psa-1', 'n')).toBe(9);
  });

  it('follows a commentary that numbers its notes from where the book is', () => {
    expect(nextNoteNumber('^shedd-mrk-14-n26\n', 'shedd-mrk-14', 'n')).toBe(27);
  });

  it('counts only the kind asked about', () => {
    const text = '^shedd-mrk-14-n26\n^shedd-mrk-14-h2\n';
    expect(nextNoteNumber(text, 'shedd-mrk-14', 'h')).toBe(3);
  });

  it('reads no verse of the chapter as a note', () => {
    expect(nextNoteNumber('^shedd-psa-1-4\n', 'shedd-psa-1', 'n')).toBe(1);
  });

  it('leaves the notes of another chapter out of it', () => {
    expect(nextNoteNumber('^shedd-psa-2-n5\n', 'shedd-psa-1', 'n')).toBe(1);
  });

  it('reads an id inside a fence as one being shown', () => {
    const text = '```\n^shedd-psa-1-n5\n```\n';
    expect(nextNoteNumber(text, 'shedd-psa-1', 'n')).toBe(1);
  });
});

describe('markerWrite', () => {
  const mark = (text: string) =>
    markerWrite(text, 'shedd-psa-1-1', 'shedd-psa-1-n2', 'n2', [
      'Notas',
      'Notes',
    ]);

  it('writes an aside of its own on a verse carrying none', () => {
    const text = chapter(verse(1), verse(2));
    expect(applied(text, [mark(text)!])).toContain(
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]]\n' +
        ',,**Notas**: [[#^shedd-psa-1-n2|n2]].,,\n' +
        '^shedd-psa-1-1',
    );
  });

  it('joins the aside a verse already keeps its refs in', () => {
    const text = chapter(
      verse(1, ',,**Refs**: [[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].,,'),
    );
    expect(applied(text, [mark(text)!])).toContain(
      ',,**Refs**: [[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]]. ' +
        '**Notas**: [[#^shedd-psa-1-n2|n2]].,,',
    );
  });

  it('closes a refs list that was left without a full stop', () => {
    const text = chapter(
      verse(1, ',,**Refs**: [[#^shedd-psa-26-4|Sl 26.4]],,'),
    );
    expect(applied(text, [mark(text)!])).toContain(
      ',,**Refs**: [[#^shedd-psa-26-4|Sl 26.4]]. ' +
        '**Notas**: [[#^shedd-psa-1-n2|n2]].,,',
    );
  });

  it('extends the notes a verse is already marked with', () => {
    const text = chapter(verse(1, ',,**Notas**: [[#^shedd-psa-1-n1|n1]].,,'));
    expect(applied(text, [mark(text)!])).toContain(
      ',,**Notas**: [[#^shedd-psa-1-n1|n1]]; [[#^shedd-psa-1-n2|n2]].,,',
    );
  });

  it('marks a verse written with its aside and its id on the one line', () => {
    const text =
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**: ' +
      '[[#^shedd-psa-26-4|Sl 26.4]].,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toBe(
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**: ' +
        '[[#^shedd-psa-26-4|Sl 26.4]]. **Notas**: ' +
        '[[#^shedd-psa-1-n2|n2]].,, ^shedd-psa-1-1\n',
    );
  });

  it('writes an aside on a verse written on the one line without one', () => {
    const text = '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toBe(
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ' +
        ',,**Notas**: [[#^shedd-psa-1-n2|n2]].,, ^shedd-psa-1-1\n',
    );
  });

  it('reads a verse the chapter does not carry as nothing to mark', () => {
    expect(mark(chapter(verse(2)))).toBeNull();
  });
});

describe('noteBlock', () => {
  it('writes the callout, the verse it is about and its own id', () => {
    expect(
      noteBlock(
        'note',
        'Nota 2 - Salmos 1.1',
        ['shedd-psa-1-1'],
        'shedd-psa-1-n2',
      ),
    ).toBe(
      '<!-- prettier-ignore -->\n' +
        '> [!note]+ Nota 2 - Salmos 1.1\n' +
        '>\n' +
        '> > [!quote]-\n' +
        '> >\n' +
        '> > ![[#^shedd-psa-1-1]]\n' +
        '>\n' +
        '> \n' +
        '^shedd-psa-1-n2\n',
    );
  });

  it('embeds every verse of a range on the one line', () => {
    expect(
      noteBlock(
        'homiletic',
        'Nótula Homilética 1 - Salmos 1.1-3',
        ['shedd-psa-1-1', 'shedd-psa-1-2', 'shedd-psa-1-3'],
        'shedd-psa-1-h1',
      ),
    ).toContain(
      '> > ![[#^shedd-psa-1-1]] ![[#^shedd-psa-1-2]] ![[#^shedd-psa-1-3]]\n',
    );
  });
});

describe('notePlacement', () => {
  const headings = ['Notas', 'Notes'];
  const quotes = ['Citações', 'Quotes'];
  const block =
    '<!-- prettier-ignore -->\n> [!note]+ Nota 1\n^shedd-psa-1-n1\n';

  it('writes the note at the end of the section a chapter already keeps', () => {
    const text =
      '# Salmos 1\n\n## Notas\n\n<!-- prettier-ignore -->\n' +
      '> [!note]+ Nota 1\n^shedd-psa-1-n0\n';
    const at = notePlacement(text, headings, quotes, block);
    expect(applied(text, [at])).toBe(
      '# Salmos 1\n\n## Notas\n\n<!-- prettier-ignore -->\n' +
        '> [!note]+ Nota 1\n^shedd-psa-1-n0\n\n' +
        block,
    );
  });

  it('opens the section before the quotes when there is none', () => {
    const text = '# Salmos 1\n\n![[x]]\n^shedd-psa-1-1\n\n## Citações\n\nq\n';
    expect(applied(text, [notePlacement(text, headings, quotes, block)])).toBe(
      '# Salmos 1\n\n![[x]]\n^shedd-psa-1-1\n\n## Notas\n\n' +
        block +
        '\n## Citações\n\nq\n',
    );
  });

  it('closes the verses with the section, where the verses are ignored', () => {
    const text =
      '# Marcos 14\n\n<!-- prettier-ignore-start -->\n\n![[x]]\n' +
      '^shedd-mrk-14-1\n<!-- prettier-ignore-end -->\n\n## Citações\n\nq\n';
    expect(applied(text, [notePlacement(text, headings, quotes, block)])).toBe(
      '# Marcos 14\n\n<!-- prettier-ignore-start -->\n\n![[x]]\n' +
        '^shedd-mrk-14-1\n## Notas\n<!-- prettier-ignore-end -->\n\n' +
        block +
        '\n## Citações\n\nq\n',
    );
  });

  it('writes the section at the end of a chapter that has neither', () => {
    const text = '# Salmos 1\n\n![[x]]\n^shedd-psa-1-1\n';
    expect(applied(text, [notePlacement(text, headings, quotes, block)])).toBe(
      '# Salmos 1\n\n![[x]]\n^shedd-psa-1-1\n\n## Notas\n\n' + block,
    );
  });

  it('answers to the section under the other language it was written in', () => {
    const text = '# Psalm 1\n\n## Notes\n\nk\n';
    expect(applied(text, [notePlacement(text, headings, quotes, block)])).toBe(
      '# Psalm 1\n\n## Notes\n\nk\n\n' + block,
    );
  });
});

describe('noteWrites', () => {
  const text = chapter(verse(1), verse(2), verse(3));
  const note = {
    callout: 'note',
    title: 'Nota 1 - Salmos 1.1-3',
    markers: ['Notas', 'Notes'],
    headings: ['Notas', 'Notes'],
    quotes: ['Citações', 'Quotes'],
    verses: ['shedd-psa-1-1', 'shedd-psa-1-2', 'shedd-psa-1-3'],
    anchor: 'shedd-psa-1-n1',
    label: 'n1',
  };

  it('marks every verse of the range and writes the note once', () => {
    const written = applied(text, noteWrites(text, note).writes);
    expect(written.match(/\[\[#\^shedd-psa-1-n1\|n1\]\]/g)).toHaveLength(3);
    expect(written).toContain('## Notas');
    expect(written).toContain('> [!note]+ Nota 1 - Salmos 1.1-3');
    expect(written).toContain(
      '> > ![[#^shedd-psa-1-1]] ![[#^shedd-psa-1-2]] ![[#^shedd-psa-1-3]]',
    );
  });

  it('leaves the cursor on the line the comment is typed into', () => {
    const { writes, comment } = noteWrites(text, note);
    const lines = applied(text, writes).split('\n');
    expect(lines[comment.line]).toBe('> ');
    expect(lines[comment.line + 1]).toBe('^shedd-psa-1-n1');
    expect(comment.ch).toBe(2);
  });

  it('leaves the cursor where the note landed with nothing marked above it', () => {
    const bare = '# Salmos 1\n\n![[x]]\n^shedd-psa-1-9\n';
    const { writes, comment } = noteWrites(bare, note);
    const lines = applied(bare, writes).split('\n');
    expect(lines[comment.line]).toBe('> ');
  });

  it('marks a verse the chapter never wrote nowhere', () => {
    const { writes } = noteWrites(text, { ...note, verses: ['shedd-psa-1-9'] });
    expect(applied(text, writes)).toContain('## Notas');
  });
});

describe('a chapter that keeps its notes above its quotes', () => {
  const headings = ['Notas', 'Notes'];
  const quotes = ['Citações', 'Quotes'];
  const block =
    '<!-- prettier-ignore -->\n> [!note]+ Nota 2\n^shedd-psa-1-n2\n';

  it('writes the note under the last of them, ahead of the quotes', () => {
    const text =
      '## Notas\n\n<!-- prettier-ignore -->\n> [!note]+ Nota 1\n' +
      '^shedd-psa-1-n1\n\n<!-- prettier-ignore -->\n## Citações\n\nq\n';
    const lines = applied(text, [
      notePlacement(text, headings, quotes, block),
    ]).split('\n');

    expect(lines.indexOf('> [!note]+ Nota 2')).toBeGreaterThan(
      lines.indexOf('^shedd-psa-1-n1'),
    );
    expect(lines.indexOf('> [!note]+ Nota 2')).toBeLessThan(
      lines.indexOf('## Citações'),
    );
    // The comment ahead of the quotes heading is the heading's own, and stays
    // in front of it rather than being written over.
    expect(lines[lines.indexOf('## Citações') - 1]).toBe(
      '<!-- prettier-ignore -->',
    );
  });
});

describe('a chapter written in an unusual shape', () => {
  const headings = ['Notas', 'Notes'];
  const quotes = ['Citações', 'Quotes'];
  const block =
    '<!-- prettier-ignore -->\n> [!note]+ Nota 1\n^shedd-psa-1-n1\n';
  const placed = (text: string) =>
    applied(text, [notePlacement(text, headings, quotes, block)]);

  it('marks a verse whose id opens the chapter', () => {
    const text = '^shedd-psa-1-1\n';
    const write = markerWrite(text, 'shedd-psa-1-1', 'shedd-psa-1-n2', 'n2', [
      'Notas',
    ]);
    expect(applied(text, [write!])).toBe(
      ',,**Notas**: [[#^shedd-psa-1-n2|n2]].,,\n^shedd-psa-1-1\n',
    );
  });

  it('reads a heading inside a fence as one being shown', () => {
    const text = '# Salmos 1\n\n```\n## Notas\n```\n';
    expect(placed(text)).toContain('```\n## Notas\n```\n\n## Notas\n');
  });

  it('writes the section onto a chapter that ends without a blank line', () => {
    expect(placed('# Salmos 1')).toBe('# Salmos 1\n\n## Notas\n\n' + block);
  });

  it('writes the section into a chapter that says nothing at all', () => {
    expect(placed('')).toBe('## Notas\n\n' + block);
  });

  it('leaves the blank line a chapter already ends with', () => {
    expect(placed('# Salmos 1\n\n')).toBe('# Salmos 1\n\n## Notas\n\n' + block);
  });
});

describe('a chapter left mid-edit', () => {
  const headings = ['Notas', 'Notes'];
  const quotes = ['Citações', 'Quotes'];
  const block =
    '<!-- prettier-ignore -->\n> [!note]+ Nota 1\n^shedd-psa-1-n1\n';
  const placed = (text: string) =>
    applied(text, [notePlacement(text, headings, quotes, block)]);

  it('backs the note out of a fence someone left open', () => {
    const text = '# Salmos 1\n\n```\num exemplo\n';
    const written = placed(text).split('\n');
    expect(written.indexOf('## Notas')).toBeLessThan(written.indexOf('```'));
  });

  it('closes a chapter that ends on the marker the verses end with', () => {
    expect(placed('# Marcos 14\n\n<!-- prettier-ignore-end -->')).toBe(
      '# Marcos 14\n\n## Notas\n<!-- prettier-ignore-end -->\n\n' + block,
    );
  });
});

describe('an aside Prettier has wrapped', () => {
  const mark = (text: string) =>
    markerWrite(text, 'shedd-psa-1-1', 'shedd-psa-1-n9', 'n9', [
      'Notas',
      'Notes',
    ]);

  it('joins the notes of a verse whose aside opens lines above its id', () => {
    const text =
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**:\n' +
      '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]];\n' +
      '[[Shedd-24-JER-015#^shedd-jer-15-17|Jr 15.17]]. **Notas**:\n' +
      '[[#^shedd-psa-1-n1|n1]]; [[#^shedd-psa-1-n2|n2]].,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toBe(
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**:\n' +
        '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]];\n' +
        '[[Shedd-24-JER-015#^shedd-jer-15-17|Jr 15.17]]. **Notas**:\n' +
        '[[#^shedd-psa-1-n1|n1]]; [[#^shedd-psa-1-n2|n2]]; ' +
        '[[#^shedd-psa-1-n9|n9]].,, ^shedd-psa-1-1\n',
    );
  });

  it('opens the notes of a verse whose wrapped aside carries only refs', () => {
    const text =
      '![[ARA-19-PSA-001#^ara-psa-1-1|flat]] ,,**Refs**:\n' +
      '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toContain(
      '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]]. ' +
        '**Notas**: [[#^shedd-psa-1-n9|n9]].,, ^shedd-psa-1-1',
    );
  });

  it('joins a wrapped aside written on the lines above the id', () => {
    const text =
      '![[ARA-41-MRK-014#^ara-mrk-14-1|flat]]\n' +
      ',,**Refs**: [[#^shedd-mat-26-47|Mt 26.47]];\n' +
      '[[#^shedd-jhn-18-3|Jo 18.3]].,,\n' +
      '^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toContain(
      '[[#^shedd-jhn-18-3|Jo 18.3]]. **Notas**: [[#^shedd-psa-1-n9|n9]].,,\n' +
        '^shedd-psa-1-1',
    );
  });

  it('writes an aside of its own where a `,,` was left open above', () => {
    const text = ',,left open\n\n![[x]] ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toContain(
      '![[x]] ,,**Notas**: [[#^shedd-psa-1-n9|n9]].,, ^shedd-psa-1-1',
    );
  });
});

describe('a verse whose aside was never closed', () => {
  it('leaves the open mark alone and writes an aside of its own', () => {
    const text = '![[x]] ,,left open ^shedd-psa-1-1\n';
    const write = markerWrite(text, 'shedd-psa-1-1', 'shedd-psa-1-n9', 'n9', [
      'Notas',
    ]);
    expect(applied(text, [write!])).toBe(
      '![[x]] ,,left open ,,**Notas**: [[#^shedd-psa-1-n9|n9]].,, ' +
        '^shedd-psa-1-1\n',
    );
  });
});

describe('an aside written in some other order', () => {
  const mark = (text: string) =>
    markerWrite(text, 'shedd-psa-1-1', 'shedd-psa-1-n9', 'n9', [
      'Notas',
      'Notes',
    ]);

  it('adds the note to the list of notes, not to the refs after it', () => {
    const text =
      '![[x]] ,,**Notas**: [[#^shedd-psa-1-n1|n1]]. **Refs**: ' +
      '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toBe(
      '![[x]] ,,**Notas**: [[#^shedd-psa-1-n1|n1]]; ' +
        '[[#^shedd-psa-1-n9|n9]]. **Refs**: ' +
        '[[Shedd-19-PSA-026#^shedd-psa-26-4|Sl 26.4]].,, ^shedd-psa-1-1\n',
    );
  });

  it('adds it to the end of a list that names no note yet', () => {
    const text = '![[x]] ,,**Notas**: pendente,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toBe(
      '![[x]] ,,**Notas**: pendente; [[#^shedd-psa-1-n9|n9]],, ' +
        '^shedd-psa-1-1\n',
    );
  });

  it('writes in front of the full stop a bare list closes with', () => {
    const text =
      '![[x]] ,,**Notas**: a escrever. **Refs**: nenhuma.,, ^shedd-psa-1-1\n';
    expect(applied(text, [mark(text)!])).toContain(
      ',,**Notas**: a escrever; [[#^shedd-psa-1-n9|n9]]. **Refs**: nenhuma.,,',
    );
  });
});

describe('a chapter that keeps Prettier off more than its verses', () => {
  const headings = ['Notas', 'Notes'];
  const quotes = ['Citações', 'Quotes'];
  const block =
    '<!-- prettier-ignore -->\n> [!note]+ Nota 1\n^shedd-psa-1-n1\n';

  it('closes the verses with the last of the markers, not the first', () => {
    const text =
      '# Salmos 1\n\n<!-- prettier-ignore-start -->\n| a | b |\n' +
      '<!-- prettier-ignore-end -->\n\n<!-- prettier-ignore-start -->\n\n' +
      '![[x]]\n^shedd-psa-1-1\n<!-- prettier-ignore-end -->\n';
    const lines = applied(text, [
      notePlacement(text, headings, quotes, block),
    ]).split('\n');

    expect(lines.indexOf('## Notas')).toBeGreaterThan(
      lines.indexOf('^shedd-psa-1-1'),
    );
    expect(lines.filter((line) => line === '## Notas')).toHaveLength(1);
  });
});

describe('a note over verses a chapter never wrote', () => {
  const note = {
    callout: 'note',
    title: 'Nota 1 - Salmos 1.1-3',
    verses: ['shedd-psa-1-1', 'shedd-psa-1-2', 'shedd-psa-1-3'],
    anchor: 'shedd-psa-1-n1',
    label: 'n1',
    markers: ['Notas'],
    headings: ['Notas'],
    quotes: ['Citações'],
  };

  it('quotes the verses it marked and no others', () => {
    const text =
      '# Salmos 1\n\n![[x]]\n^shedd-psa-1-1\n\n![[y]]\n^shedd-psa-1-3\n';
    const written = noteWrites(text, note);

    expect(written.verses).toEqual(['shedd-psa-1-1', 'shedd-psa-1-3']);
    expect(applied(text, written.writes)).toContain(
      '> > ![[#^shedd-psa-1-1]] ![[#^shedd-psa-1-3]]\n',
    );
  });

  it('is about nothing where the chapter carries none of them', () => {
    const text = '# Salmos 1\n\n![[x]]\n^shedd-psa-2-1\n';
    expect(noteWrites(text, note).verses).toEqual([]);
  });

  it('leaves the cursor on its own line where the notes come first', () => {
    const text =
      '# Salmos 1\n\n## Notas\n\nnada ainda\n\n## Versos\n\n![[x]]\n' +
      '^shedd-psa-1-1\n';
    const { writes, comment } = noteWrites(text, {
      ...note,
      verses: ['shedd-psa-1-1'],
    });
    const lines = applied(text, writes).split('\n');

    expect(lines[comment.line]).toBe('> ');
    expect(lines[comment.line + 1]).toBe('^shedd-psa-1-n1');
  });
});

describe('two verses one aside is read as covering', () => {
  it('marks the first of them and leaves the second out', () => {
    // No blank line between the two, so the aside of the second is read back
    // into the line the first closes on: one write over the other's lines.
    const text =
      '![[x]] ,,**Refs**:\n' +
      '[[a]].,, ^shedd-psa-1-1\n' +
      '[[b]].,, ^shedd-psa-1-2\n';
    const written = noteWrites(text, {
      callout: 'note',
      title: 'Nota 1 - Salmos 1.1,2',
      verses: ['shedd-psa-1-1', 'shedd-psa-1-2'],
      anchor: 'shedd-psa-1-n1',
      label: 'n1',
      markers: ['Notas'],
      headings: ['Notas'],
      quotes: ['Citações'],
    });

    expect(written.verses).toEqual(['shedd-psa-1-1']);
    const marked = applied(text, written.writes);
    expect(marked.match(/\[\[#\^shedd-psa-1-n1\|n1\]\]/g)).toHaveLength(1);
    expect(marked).toContain('^shedd-psa-1-2');
  });
});
