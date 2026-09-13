import { describe, expect, it } from 'vitest';

import { gluedSentence, glueSoftLinks } from './softlink-format';

/** A sentence's children written as `type:value`, which is all printing reads. */
function shape(children: { type: string; value?: string }[]): string[] {
  return children.map((child) => `${child.type}:${child.value ?? ''}`);
}

/** The children prettier's own preprocess makes of `text`, split on spaces. */
function sentence(text: string): { type: string; value: string }[] {
  return text.split(/( )/).map((part) => ({
    type: part === ' ' ? 'whitespace' : 'word',
    value: part,
  }));
}

describe('gluedSentence', () => {
  it('merges the words a link is split across into one', () => {
    expect(
      shape(gluedSentence(sentence('veja ((a#^b|1 Cr 16.4)) fim'))),
    ).toEqual([
      'word:veja',
      'whitespace: ',
      'word:((a#^b|1 Cr 16.4))',
      'whitespace: ',
      'word:fim',
    ]);
  });

  it('leaves a sentence holding no link as it was', () => {
    const children = sentence('nada a fazer aqui');
    expect(gluedSentence(children)).toBe(children);
  });

  it('merges two links written with no space between them', () => {
    expect(
      shape(gluedSentence(sentence('x ((a|1 Cr 16.4)),((b|5)); y'))),
    ).toEqual([
      'word:x',
      'whitespace: ',
      'word:((a|1 Cr 16.4)),((b|5));',
      'whitespace: ',
      'word:y',
    ]);
  });

  it('keeps the punctuation glued to a link with the link', () => {
    expect(shape(gluedSentence(sentence('(((a|Sl 1.1))).')))).toEqual([
      'word:(((a|Sl 1.1))).',
    ]);
  });

  it('carries the first word’s own fields onto the merged word', () => {
    const children = [
      {
        type: 'word',
        value: '((a|1',
        kind: 'non-cjk',
        hasLeadingPunctuation: true,
      },
      { type: 'whitespace', value: ' ' },
      {
        type: 'word',
        value: 'Cr))',
        kind: 'non-cjk',
        hasTrailingPunctuation: true,
      },
    ];
    expect(gluedSentence(children)[0]).toMatchObject({
      type: 'word',
      value: '((a|1 Cr))',
      kind: 'non-cjk',
      hasLeadingPunctuation: true,
      hasTrailingPunctuation: true,
    });
  });

  it('merges a link split by a soft line break, keeping the break', () => {
    const children = [
      { type: 'word', value: '((a#^b|1' },
      { type: 'whitespace', value: ' ' },
      { type: 'word', value: 'Cr' },
      { type: 'whitespace', value: '\n' },
      { type: 'word', value: '16.4))' },
    ];
    expect(shape(gluedSentence(children))).toEqual([
      'word:((a#^b|1 Cr\n16.4))',
    ]);
  });

  it('merges two links when only the first crosses a newline', () => {
    const children = [
      { type: 'word', value: '((a|1' },
      { type: 'whitespace', value: '\n' },
      { type: 'word', value: 'Cr)),' },
      { type: 'whitespace', value: ' ' },
      { type: 'word', value: '((b|5));' },
    ];
    expect(shape(gluedSentence(children))).toEqual([
      'word:((a|1\nCr)),',
      'whitespace: ',
      'word:((b|5));',
    ]);
  });

  it('leaves a sentence holding a newline but no link unchanged', () => {
    const children = [
      { type: 'word', value: 'nada' },
      { type: 'whitespace', value: '\n' },
      { type: 'word', value: 'aqui' },
    ];
    expect(gluedSentence(children)).toBe(children);
  });

  it('counts a child that is not a word as no text of its own', () => {
    const children = [
      { type: 'word', value: '((a|1' },
      { type: 'whitespace', value: ' ' },
      { type: 'word', value: 'Cr))' },
      { type: 'emphasis', children: [{ type: 'word', value: 'x' }] },
    ];
    expect(
      shape(gluedSentence(children) as { type: string; value?: string }[]),
    ).toEqual(['word:((a|1 Cr))', 'emphasis:']);
  });
});

describe('glueSoftLinks', () => {
  it('merges inside every sentence of a tree', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'sentence', children: sentence('a ((x|1 2)) b') }],
        },
      ],
    };
    const glued = glueSoftLinks(tree);
    const first = glued.children[0].children[0].children;
    expect(shape(first as { type: string; value?: string }[])).toEqual([
      'word:a',
      'whitespace: ',
      'word:((x|1 2))',
      'whitespace: ',
      'word:b',
    ]);
  });

  it('leaves a node holding no children alone', () => {
    const leaf = { type: 'word', value: '((a|1 2))' };
    expect(glueSoftLinks(leaf)).toBe(leaf);
  });
});
