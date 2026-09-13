import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'esbuild';
import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pluginBuildOptions } from '../esbuild.plugin.mjs';

// The built file is loaded from a vault, and a vault has no `node_modules`.
// Every other test loads the plugin from inside the repo, where an import the
// bundle left out still resolves, so none of them can tell a file that works in
// a vault from one that fails to load there. This one builds the file with the
// real build's options into a directory under the system's temp dir — nothing
// above it holds a `node_modules` — and has Prettier load it from there by path,
// as a `.prettierrc` plugin entry is.
describe('the built plugin, loaded from a directory with no node_modules', () => {
  let dir: string;
  let outfile: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'okc-prettier-plugin-'));
    outfile = join(dir, 'prettier-plugin.mjs');
    await build({
      ...pluginBuildOptions(true),
      outfile,
      logLevel: 'silent',
    });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('loads and leaves every link on one line', async () => {
    const run =
      'uma longa sequencia de links ' +
      Array.from(
        { length: 12 },
        (_, n) => `((Shedd-13-1CH-016#^shedd-1ch-16-${n}|1 Cr 16.${n}))`,
      ).join(' ') +
      ' e prosa depois.\n';
    const out = await prettier.format(run, {
      parser: 'markdown',
      printWidth: 79,
      proseWrap: 'always',
      plugins: [outfile],
    });
    for (let n = 0; n < 12; n++) {
      expect(out).toContain(
        `((Shedd-13-1CH-016#^shedd-1ch-16-${n}|1 Cr 16.${n}))`,
      );
    }
    for (const line of out.split('\n')) {
      expect(line.split('((').length).toBe(line.split('))').length);
    }
  });
});
