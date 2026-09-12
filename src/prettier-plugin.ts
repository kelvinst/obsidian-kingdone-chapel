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
import * as markdown from 'prettier/plugins/markdown';

import { glueSoftLinks } from './softlink-format';

const base: Printer = markdown.printers.mdast;

export const parsers = {
  markdown: markdown.parsers.markdown,
};

export const printers = {
  mdast: {
    ...base,
    preprocess: (ast: unknown, options: unknown) =>
      glueSoftLinks(
        (base.preprocess as (ast: unknown, options: unknown) => unknown)(
          ast,
          options,
        ),
      ),
  },
};
