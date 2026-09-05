import { describe, expect, it } from 'vitest';

import { softLinksIn } from './softlink';

/** Every link in `text`, as `path>text` at `from`-`to`. */
function read(text: string): string[] {
  return softLinksIn(text).map(
    (link) => `${link.path}>${link.text}@${link.from}-${link.to}`,
  );
}

describe('softLinksIn', () => {
  it('reads a token as a link to the note it names', () => {
    expect(read('Veja ((Shedd-19-PSA-023)).')).toEqual([
      'Shedd-19-PSA-023>Shedd-19-PSA-023@5-25',
    ]);
  });

  it('shows the display text where one is written', () => {
    expect(read('((Shedd-19-PSA-023|23))')).toEqual([
      'Shedd-19-PSA-023>23@0-23',
    ]);
  });

  it('keeps a block anchor on the path and off the page', () => {
    expect(read('((Shedd-19-PSA-103#^shedd-psa-103-10|Sl 103.10))')).toEqual([
      'Shedd-19-PSA-103#^shedd-psa-103-10>Sl 103.10@0-48',
    ]);
  });

  it('shows the whole link text where a target is anchored and unaliased', () => {
    expect(read('((PSA-103#^v10))')).toEqual([
      'PSA-103#^v10>PSA-103#^v10@0-16',
    ]);
  });

  it('reads every token on a line', () => {
    expect(read('((a|1)) e ((b|2))')).toEqual(['a>1@0-7', 'b>2@10-17']);
  });

  it('counts from the offset it is given', () => {
    expect(softLinksIn('((a))', 100)[0].from).toBe(100);
  });

  it('leaves a nested parenthetical alone', () => {
    expect(read('Um verso (bla (aside) bla) e o resto.')).toEqual([]);
  });

  it('leaves prose written tight against a parenthesis alone', () => {
    expect(read('((veja o salmo) e o resto)')).toEqual([]);
  });

  it('refuses a target written with spaces', () => {
    expect(read('((Salmo 23))')).toEqual([]);
  });

  it('refuses an empty target and an empty display', () => {
    expect(read('(())')).toEqual([]);
    expect(read('((a|))')).toEqual([]);
  });

  it('refuses a token holding a wikilink, which would draw an edge', () => {
    expect(read('((  [[a]]  ))')).toEqual([]);
  });

  it('never reaches across a line', () => {
    expect(read('((a\nb))')).toEqual([]);
  });

  it('trims the display text without moving the token', () => {
    expect(read('((a| 1 ))')).toEqual(['a>1@0-9']);
  });
});
