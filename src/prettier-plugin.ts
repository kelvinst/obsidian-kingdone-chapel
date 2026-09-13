/**
 * The Prettier plugin: what a vault loads so its formatter leaves a soft link
 * whole.
 *
 * Two exports, and the second is the one that is easy to leave out. The printer
 * is where the work is — `preprocess` runs Prettier's own and glues the links in
 * what comes back. The parser is Prettier's own, re-exported unchanged, because
 * Prettier takes the printer from whichever plugin supplied the parser: a plugin
 * exporting only a printer is loaded, asked for nothing, and formatting comes
 * out exactly as it would have without it, with no error to say so.
 */

import type { Printer } from 'prettier';
import { builders } from 'prettier/doc';
import * as markdown from 'prettier/plugins/markdown';

import { glueSoftLinks } from './softlink-format';

const base: Printer = markdown.printers.mdast;

/**
 * What the base printer prints, with a link written across lines printed across
 * the same lines.
 *
 * Only a word the glue merged can hold a `\n` — Prettier's own split never puts
 * one in a word — so this touches nothing else. The break goes out as a hardline
 * and not as the raw newline because the split has already taken the
 * continuation line's prefix out of the text: a list item's indent, a quote's
 * `>`. A raw newline would print the next line without it; a hardline is given
 * it back by the list item or quote the link sits in.
 */
const print: Printer['print'] = (path, options, printChild, args) => {
  const doc = base.print(path, options, printChild, args);
  if ((path.node as { type: string }).type !== 'word') return doc;
  // A word prints as its own text, escaped where it needs to be: a string.
  const text = doc as string;
  return text.includes('\n')
    ? builders.join(builders.hardline, text.split('\n'))
    : text;
};

export const parsers = {
  markdown: markdown.parsers.markdown,
};

export const printers = {
  mdast: {
    ...base,
    print,
    preprocess: (ast: unknown, options: unknown) =>
      glueSoftLinks(
        (base.preprocess as (ast: unknown, options: unknown) => unknown)(
          ast,
          options,
        ),
      ),
  },
};
