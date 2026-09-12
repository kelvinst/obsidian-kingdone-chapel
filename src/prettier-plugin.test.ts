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
    // "103.10") — so this assertion only passes because the plugin joins
    // the link back up, not because the break never happened to land there.
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

  it('rejoins a link an earlier format already broke across two lines', async () => {
    const broken =
      'os mesmos ((Shedd-13-1CH-016#^shedd-1ch-16-4|1 Cr\n' +
      '16.4)),((Shedd-13-1CH-016#^shedd-1ch-16-5|5)); e mais prosa depois do fim deles.\n';
    const once = await format(broken);
    for (const line of once.split('\n')) {
      expect(line.split('((').length).toBe(line.split('))').length);
    }
    expect(once).toContain('((Shedd-13-1CH-016#^shedd-1ch-16-4|1 Cr 16.4))');
    expect(await format(once)).toBe(once);
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
