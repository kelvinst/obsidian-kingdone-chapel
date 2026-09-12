# Soft Link Line Breaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Prettier plugin from this repo that keeps a `((path|alias))` soft link on one line, the way Prettier already keeps `[[wikilink]]` whole.

**Architecture:** Prettier's markdown printer has a `preprocess` hook that splits every sentence into `word` and `whitespace` children carrying a `value` and no position. Joining those values gives the sentence's text; each soft link found there covers a run of those children; replacing that run with a single `word` node leaves the printer no break opportunity inside the link. The plugin spreads Prettier's own `printers.mdast` and replaces only `preprocess`, and re-exports Prettier's own `parsers.markdown` unchanged — Prettier resolves the printer from the plugin that supplied the parser, so a plugin exporting only `printers` is silently ignored.

**Tech Stack:** TypeScript, esbuild, vitest, prettier 3.9.6.

**Spec:** the design field of bd issue `okc-jwm` — read it with `bd show okc-jwm`.

## Global Constraints

- prettier is `^3.9.6`; the plugin is written against `prettier/plugins/markdown`'s `parsers.markdown` and `printers.mdast` exports.
- The vault formats at `printWidth: 79`, `proseWrap: always`. Every acceptance check uses those.
- `src/softlink.ts` owns the definition of a soft link. Nothing in this plan re-writes that regex; `softLinksIn` is imported.
- Coverage floors in `vitest.config.mts` are a ratchet: 100% statements / functions / lines over `src/**/*.ts`. New files must be fully covered.
- Commits are made with `mise exec -- git commit` (the pre-commit hook refuses a commit made on another Node version).
- In a worktree, run `mkdir -p node_modules/.vite-temp` once before `npm run test:coverage`, or vite walks up to the main checkout and dies with EPERM.
- Comment style: this repo's modules open with a docblock saying why the module exists, in prose. Match `src/softlink.ts`.

---

### Task 1: The merge

**Files:**

- Create: `src/softlink-format.ts`
- Test: `src/softlink-format.test.ts`

**Interfaces:**

- Consumes: `softLinksIn(text: string, offset?: number): SoftLink[]` from `./softlink`, where `SoftLink` has `from`, `to`, `path`, `text`.
- Produces:
  - `interface InlineNode { type: string; value?: string; children?: InlineNode[]; [key: string]: unknown }`
  - `gluedSentence(children: InlineNode[]): InlineNode[]` — one sentence's children, every soft link merged into a single `word`. Returns the same array instance when nothing merged.
  - `glueSoftLinks<T>(node: T): T` — walks an mdast tree in place, applying `gluedSentence` to every node of type `sentence`. Returns the node it was given.

- [ ] **Step 1: Write the failing test**

Create `src/softlink-format.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/softlink-format.test.ts`
Expected: FAIL — `Failed to resolve import "./softlink-format"`.

- [ ] **Step 3: Write the module**

Create `src/softlink-format.ts`:

```ts
/**
 * Keeping a soft link on one line when Prettier formats a note.
 *
 * Prettier's markdown printer knows a wikilink and prints it whole, letting the
 * line run past the width rather than breaking inside it. `((...))` is this
 * plugin's own syntax, which the printer has never heard of, so it is plain
 * prose to it and every space inside an alias is a break opportunity like any
 * other — a link split across two lines, which is a link that no longer
 * resolves.
 *
 * The printer's `preprocess` splits each sentence into `word` and `whitespace`
 * children, each carrying the text it stands for and nothing else: no position,
 * no span into the source. That is the place to work. Joining the values gives
 * the sentence back as text, every link in it covers a run of those children,
 * and a run replaced by one `word` is a link the printer has nowhere to break.
 *
 * Doing the same a step earlier, on the parsed tree, is what this avoids: a node
 * synthesized there has to carry a position, and a position spanning a line
 * break drags its container's line prefix — a list's indent, a quote's `>` —
 * into what the printer slices out. That costs characters on every format.
 */

import { softLinksIn } from './softlink';

/** A child of a sentence, as the printer's `preprocess` leaves it. */
export interface InlineNode {
  type: string;
  value?: string;
  children?: InlineNode[];
  [key: string]: unknown;
}

/** What a child stands for in the sentence's text, which only a word has. */
function textOf(node: InlineNode): string {
  return node.value ?? '';
}

/**
 * One sentence's children, every soft link in it merged into a single word.
 *
 * A link covers whatever run of children its text falls in, and the whole of
 * each: a link glued to the punctuation around it — `(((a|Sl 1.1))).` — is one
 * word already, and a link the printer split across three is three. Merging the
 * run rather than the exact span is what keeps the merged word's text equal to
 * the text it replaced, which is the whole correctness argument.
 *
 * The array itself comes back where no link was found, so a caller can tell a
 * sentence that was left alone from one that was rebuilt.
 */
export function gluedSentence(children: InlineNode[]): InlineNode[] {
  const text = children.map(textOf).join('');
  const links = softLinksIn(text);
  if (links.length === 0) return children;

  const out: InlineNode[] = [];
  let at = 0;
  let i = 0;
  while (i < children.length) {
    const from = at;
    const to = at + textOf(children[i]).length;
    const link = links.find((one) => one.from < to && one.to > from);
    if (!link) {
      out.push(children[i]);
      at = to;
      i++;
      continue;
    }
    // Every child the link reaches into, taken whole.
    let end = at;
    let j = i;
    while (j < children.length && end < link.to) {
      end += textOf(children[j]).length;
      j++;
    }
    const merged = children.slice(i, j);
    const words = merged.filter((child) => child.type === 'word');
    out.push({
      ...(words[0] ?? merged[0]),
      type: 'word',
      value: merged.map(textOf).join(''),
      hasTrailingPunctuation:
        words[words.length - 1]?.hasTrailingPunctuation ?? false,
    });
    at = end;
    i = j;
  }
  return out;
}

/** The same tree, every sentence in it glued. */
export function glueSoftLinks<T>(node: T): T {
  const inline = node as InlineNode;
  if (!Array.isArray(inline.children)) return node;
  if (inline.type === 'sentence') {
    inline.children = gluedSentence(inline.children);
    return node;
  }
  inline.children = inline.children.map((child) => glueSoftLinks(child));
  return node;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/softlink-format.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Check the coverage of the new file**

Run: `mkdir -p node_modules/.vite-temp && npx vitest run --coverage src/softlink-format.test.ts src/softlink.test.ts`
Expected: `src/softlink-format.ts` at 100% statements, functions and lines. If a branch is uncovered, add the test that reaches it rather than lowering a floor.

- [ ] **Step 6: Commit**

```bash
mise exec -- git add src/softlink-format.ts src/softlink-format.test.ts
mise exec -- git commit -m "feat: merge a soft link into one word before it is printed"
```

---

### Task 2: The plugin entry

**Files:**

- Create: `src/prettier-plugin.ts`
- Test: `src/prettier-plugin.test.ts`

**Interfaces:**

- Consumes: `glueSoftLinks` from `./softlink-format`.
- Produces: `parsers` and `printers`, the two exports a Prettier plugin is loaded by. Importable as a plugin object: `prettier.format(text, { plugins: [plugin] })`.

- [ ] **Step 1: Write the failing test**

Create `src/prettier-plugin.test.ts`:

```ts
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
    const text =
      '- lista com ((y|Sl 103.10)) dentro e mais texto para chegar ate a ' +
      'margem de setenta e nove\n';
    const once = await format(text);
    expect(await format(once)).toBe(once);
    expect(once).toContain('((y|Sl 103.10))');
    expect(once.replace(/\s+/g, ' ')).toContain('setenta e nove');
  });

  it('formats a link inside a blockquote without gaining a marker', async () => {
    const text =
      '> citacao com ((w|Sl 2.2)) e um asterisco escapado \\* aqui no meio ' +
      'do texto todo\n';
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
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/prettier-plugin.test.ts`
Expected: FAIL — `Failed to resolve import "./prettier-plugin"`.

- [ ] **Step 3: Write the entry**

Create `src/prettier-plugin.ts`:

```ts
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
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/prettier-plugin.test.ts`
Expected: PASS, 5 tests. If the first test passes but the others fail on drift, the cause is almost always that `parsers` was dropped: without it the printer is never asked for anything.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Run the whole suite with coverage**

Run: `mkdir -p node_modules/.vite-temp && npm run test:coverage`
Expected: PASS, with `src/prettier-plugin.ts` and `src/softlink-format.ts` at 100%. `autoUpdate` may raise the floors in `vitest.config.mts`; commit that change with this task.

- [ ] **Step 7: Commit**

```bash
mise exec -- git add src/prettier-plugin.ts src/prettier-plugin.test.ts vitest.config.mts
mise exec -- git commit -m "feat: a prettier plugin that keeps a soft link whole"
```

---

### Task 3: Building the plugin file

**Files:**

- Modify: `esbuild.config.mjs`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `src/prettier-plugin.ts` from Task 2.
- Produces: `prettier-plugin.mjs` at the repo root, ESM, with `prettier` left external — the file a vault copies.

- [ ] **Step 1: Add the second build**

In `esbuild.config.mjs`, after the existing `const context = await esbuild.context({...})` block, add a second context. The existing one bundles `src/main.ts` to `main.js` as cjs for Obsidian; this one is a separate target and shares none of its externals:

```js
// The Prettier plugin is a second thing built out of this source: a module a
// vault's formatter loads, not something Obsidian ever sees. ESM because that is
// what a `.prettierrc` plugin entry is loaded as, and `prettier` external
// because the plugin extends the very copy that is running it — bundling a
// second one would hand back a printer the running Prettier does not use.
const pluginContext = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/prettier-plugin.ts'],
  bundle: true,
  external: ['prettier', ...builtins],
  format: 'esm',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'prettier-plugin.mjs',
  minify: false,
});
```

Then change the tail of the file so both are built or watched:

```js
if (prod) {
  await context.rebuild();
  await pluginContext.rebuild();
  process.exit(0);
} else {
  await context.watch();
  await pluginContext.watch();
}
```

- [ ] **Step 2: Ignore the build output**

In `.gitignore`, beside the `main.js` line:

```
prettier-plugin.mjs
```

- [ ] **Step 3: Build and check the file exists**

Run: `npm run build && head -12 prettier-plugin.mjs`
Expected: the file exists, starts with the generated-file banner, and holds `import` statements from `prettier/plugins/markdown` rather than a bundled copy of Prettier.

- [ ] **Step 4: Format a file with the built plugin, not the source**

Run:

```bash
printf 'os mesmos ((A-016#^a-16-4|1 Cr 16.4)),((A-016#^a-16-5|5)); e mais prosa depois deles.\n' > /tmp/kcp-check.md
npx prettier --print-width 79 --prose-wrap always --parser markdown --plugin ./prettier-plugin.mjs /tmp/kcp-check.md
```

Expected: both links printed whole, the line overflowing past 79. This is the acceptance criterion of okc-jwm, run against the artifact a vault actually loads.

- [ ] **Step 5: Commit**

```bash
mise exec -- git add esbuild.config.mjs .gitignore
mise exec -- git commit -m "build: bundle the prettier plugin beside the obsidian one"
```

---

### Task 4: Getting it into a vault

**Files:**

- Modify: `scripts/obsidian-link.sh` (the build block at the end of the file)
- Modify: `README.md`

**Interfaces:**

- Consumes: `prettier-plugin.mjs` built by Task 3.
- Produces: `make vault` leaves a copy at `<vault>/.prettier-plugins/obsidian-kingdone-chapel.mjs` and prints the `.prettierrc.json` line to add. It does not edit the vault's Prettier config.

- [ ] **Step 1: Copy the plugin after the build**

In `scripts/obsidian-link.sh`, inside the `if [ "$DO_BUILD" = 1 ]; then` block, after the `npm run --silent build` line and before the `echo "done - Hot Reload picks up the new main.js"`:

```bash
  # The vault's formatter loads this by path, so it needs a copy of its own: the
  # plugin folder is a symlink into a checkout, and a .prettierrc pointing into
  # it would break the day that checkout is removed. The config is left to the
  # reader — unlike community-plugins.json, which Obsidian rewrites anyway, a
  # .prettierrc is a file a person maintains.
  PLUGIN_MJS="$VAULT/.prettier-plugins/obsidian-kingdone-chapel.mjs"
  mkdir -p "$(dirname "$PLUGIN_MJS")"
  cp -f "$TARGET/prettier-plugin.mjs" "$PLUGIN_MJS"
  echo "prettier: copied the plugin to $PLUGIN_MJS"
  if ! grep -q 'prettier-plugins/obsidian-kingdone-chapel.mjs' "$VAULT/.prettierrc.json" 2>/dev/null; then
    echo 'prettier: add it to the vault'"'"'s .prettierrc.json:'
    echo '            "plugins": [".prettier-plugins/obsidian-kingdone-chapel.mjs"]'
  fi
```

- [ ] **Step 2: Run it against a scratch vault**

Run:

```bash
mkdir -p /tmp/kcp-vault/.obsidian
npm run build
scripts/obsidian-link.sh /tmp/kcp-vault
ls -l /tmp/kcp-vault/.prettier-plugins/
```

Expected: the script reports the copy and prints the `.prettierrc.json` line; the file is there. Run it a second time and confirm it neither fails nor duplicates anything.

- [ ] **Step 3: Write the README section**

`README.md` documents formatting around line 625 ("Formatting is Prettier at 80 columns"). Add a section near it, in the README's own voice — prose, saying why before how:

````markdown
### Formatting a vault that holds soft links

Prettier knows a `[[wikilink]]` and prints it whole, letting a line run past the
width rather than breaking inside it. A `((soft link))` is this plugin's own
syntax, which Prettier has never heard of, so it is plain prose to it: the space
inside an alias is a break opportunity like any other, and a link broken across
two lines is a link that no longer resolves.

The plugin ships a Prettier plugin that teaches it the token. `make vault` copies
it into the vault it links, at `.prettier-plugins/obsidian-kingdone-chapel.mjs`;
for a vault that is not linked to a checkout, build it with `npm run build` and
copy `prettier-plugin.mjs` there by hand. Either way the vault's own
`.prettierrc.json` has to name it:

```json
{
  "printWidth": 79,
  "proseWrap": "always",
  "plugins": [".prettier-plugins/obsidian-kingdone-chapel.mjs"]
}
```

The copy is a copy: it is whatever the last build left there, and a vault whose
copy is old formats by the old rules.
````

- [ ] **Step 4: Check the README formats and the whole gate passes**

Run: `mkdir -p node_modules/.vite-temp && npm run precommit`
Expected: PASS — format, build, and the suite with coverage.

- [ ] **Step 5: Commit**

```bash
mise exec -- git add scripts/obsidian-link.sh README.md
mise exec -- git commit -m "feat(vault): copy the prettier plugin into the linked vault"
```

---

### Task 5: The real note

**Files:**

- No source changes expected. This task is the manual acceptance check the issue asks for.

- [ ] **Step 1: Format the note the issue names**

The issue names `Igreja/Comentarios/Shedd/3-OT-Wisdom/Shedd-19-PSA/Shedd-19-PSA-000.md`, lines 108-109 and 113-114, in the vault at `$OBSIDIAN_VAULT` (default `~/Developer/Stingdom`). Copy it aside first, so the check never writes to the vault:

```bash
cp -f "${OBSIDIAN_VAULT:-$HOME/Developer/Stingdom}/Igreja/Comentarios/Shedd/3-OT-Wisdom/Shedd-19-PSA/Shedd-19-PSA-000.md" /tmp/kcp-psa.md
npx prettier --print-width 79 --prose-wrap always --parser markdown --plugin ./prettier-plugin.mjs /tmp/kcp-psa.md > /tmp/kcp-psa.out.md
grep -n '^[0-9]' /tmp/kcp-psa.out.md | head
```

Expected: no line in the output begins with the tail of a broken link (a digit, or `))`). Confirm directly:

```bash
grep -c '^[^(]*))' /tmp/kcp-psa.out.md
```

Expected: `0`.

- [ ] **Step 2: Confirm a second pass changes nothing**

```bash
cp -f /tmp/kcp-psa.out.md /tmp/kcp-psa2.md
npx prettier --print-width 79 --prose-wrap always --parser markdown --plugin ./prettier-plugin.mjs /tmp/kcp-psa2.md > /tmp/kcp-psa2.out.md
diff /tmp/kcp-psa.out.md /tmp/kcp-psa2.out.md && echo STABLE
```

Expected: `STABLE`.

- [ ] **Step 3: Record the result on the issue**

```bash
bd update okc-jwm --notes "Acceptance run over Shedd-19-PSA-000.md with the built prettier-plugin.mjs at printWidth 79 / proseWrap always: every ((...)) on one line, no line starting with a link tail, output stable across a second pass."
```

- [ ] **Step 4: Clean up the scratch files**

```bash
rm -f /tmp/kcp-psa.md /tmp/kcp-psa.out.md /tmp/kcp-psa2.md /tmp/kcp-psa2.out.md /tmp/kcp-check.md
rm -rf /tmp/kcp-vault
```

---

## Notes for the executor

- `okc-jwm` stays `in_progress` until the branch is merged to main. Do not close it on the branch.
- A soft link inside a GFM table cell is split at its `|` into two cells. That is Prettier's own table parsing, happens today without this plugin, and is out of scope.
- If `preprocess` ever stops being exported by `prettier/plugins/markdown`, the fallback recorded in the design is a parser-level wrap with a custom node type — but read the design's "Rejected" section first: it corrupts text unless positions are exactly right.
