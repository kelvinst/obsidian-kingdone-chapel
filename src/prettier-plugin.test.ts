import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

import * as plugin from './prettier-plugin';

/** The vault's own settings, which are what the issue was measured at. */
async function format(text: string): Promise<string> {
  return prettier.format(text, {
    parser: 'markdown',
    printWidth: 79,
    proseWrap: 'always',
    plugins: [plugin],
  });
}

const RUN =
  'os mesmos ((Shedd-13-1CH-016#^shedd-1ch-16-4|1 Cr 16.4)),' +
  '((Shedd-13-1CH-016#^shedd-1ch-16-5|5)); e mais prosa depois do fim deles.\n';

describe('the plugin', () => {
  it('leaves every link on one line, overflowing the width', async () => {
    for (const line of (await format(RUN)).split('\n')) {
      expect(line.split('((').length).toBe(line.split('))').length);
    }
  });

  it('formats a link inside a list item without losing its text', async () => {
    // The prose before the link is long enough that base prettier, run
    // without this plugin, wraps right inside the alias (between "Sl" and
    // "103.10") — so this assertion only passes because the plugin keeps
    // the link whole, not because the break never happened to land there.
    const text =
      '- lista com bastante texto ainda mais longo antes para empurrar o ' +
      'link ((y|Sl 103.10)) ate a margem\n';
    const once = await format(text);
    expect(await format(once)).toBe(once);
    expect(once).toContain('((y|Sl 103.10))');
    expect(once.replace(/\s+/g, ' ')).toContain('ate a margem');
  });

  it('formats a link inside a blockquote without gaining a marker', async () => {
    // Same reasoning as the list-item case above: this prefix is long
    // enough that base prettier wraps inside "((w|Sl 2.2))" on its own, so
    // an intact link here is evidence the plugin did something.
    const text =
      '> citacao razoavelmente mais longa antes para empurrar de vez o ' +
      'link ((w|Sl 2.2)) e um asterisco escapado \\* aqui no meio do texto ' +
      'todo\n';
    const once = await format(text);
    expect(await format(once)).toBe(once);
    expect(once).toContain('((w|Sl 2.2))');
    expect(once).not.toContain('> >');
  });

  it('prints the same text a second and a third time', async () => {
    const once = await format(RUN);
    const twice = await format(once);
    expect(twice).toBe(once);
    expect(await format(twice)).toBe(once);
  });

  /** Formats `text` three times, each pass fed the one before it. */
  async function thrice(text: string): Promise<string[]> {
    const once = await format(text);
    const twice = await format(once);
    return [once, twice, await format(twice)];
  }

  it('leaves a link already spanning two lines as written', async () => {
    const broken =
      'os mesmos ((Shedd-13-1CH-016#^shedd-1ch-16-4|1 Cr\n' +
      '16.4)),((Shedd-13-1CH-016#^shedd-1ch-16-5|5)); e mais prosa.\n';
    expect(await thrice(broken)).toEqual([broken, broken, broken]);
  });

  it('leaves a link spanning lines in a paragraph as written', async () => {
    const text = 'Veja ((a#^b|Sl\n103.10)) e siga.\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('leaves a link spanning lines in a list item as written', async () => {
    // The continuation line's indent is not in the word: the printer's split
    // took it out, and only the list item can put it back.
    const text = '- item com ((a#^b|Sl\n  103.10)) e segue\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('leaves a link spanning lines in a blockquote as written', async () => {
    const text = '> quote com ((a#^b|Sl\n> 103.10)) e segue\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('leaves a link spanning lines in a quote in a list as written', async () => {
    const text =
      '- item\n\n  > quote aninhada ((a#^b|Sl\n  > 103.10)) e segue\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('wraps what follows a link spanning lines by the width', async () => {
    // Shedd-19-PSA-000.md as it stands in the vault: a link already broken
    // across two lines, then a run of links too long for what is left of the
    // line. The run belongs on a line of its own. Printed as one word holding a
    // hardline, the link told Prettier everything after it fit, and the run
    // was glued onto the link's second line, 196 columns long.
    const text =
      'os mesmos (((Shedd-13-1CH-016#^shedd-1ch-16-4|1 Cr\n' +
      '16.4)),((Shedd-13-1CH-016#^shedd-1ch-16-5|5));\n' +
      '((Shedd-13-1CH-025#^shedd-1ch-25-1|25.1)),((Shedd-13-1CH-025#^shedd-1ch-25-2|2)),((Shedd-13-1CH-025#^shedd-1ch-25-3|3))).\n' +
      'Os enigmáticos termos musicais.\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('leaves a link closed lines after it opened as written', async () => {
    const text =
      'antes ((x|abre aqui\nsegunda linha de prosa\nterceira linha e agora )) fecha\n';
    expect(await thrice(text)).toEqual([text, text, text]);
  });

  it('reflows a `((` never closed as prettier does on its own', async () => {
    const text =
      'antes ((x|abre aqui\nsegunda linha de prosa que nunca fecha o que abriu e\n' +
      'segue\nmais curta.\n';
    expect(await format(text)).toBe(
      await prettier.format(text, {
        parser: 'markdown',
        printWidth: 79,
        proseWrap: 'always',
      }),
    );
  });

  it('formats a note holding no link as prettier does on its own', async () => {
    const text = 'uma frase comum, sem link nenhum, escrita para conferir.\n';
    expect(await format(text)).toBe(
      await prettier.format(text, {
        parser: 'markdown',
        printWidth: 79,
        proseWrap: 'always',
      }),
    );
  });
});
