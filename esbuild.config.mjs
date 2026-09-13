import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

import { banner, pluginBuildOptions } from './esbuild.plugin.mjs';

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins,
  ],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
});

const pluginContext = await esbuild.context(pluginBuildOptions(prod));

if (prod) {
  await context.rebuild();
  await pluginContext.rebuild();
  process.exit(0);
} else {
  await context.watch();
  await pluginContext.watch();
}
