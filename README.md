# Kingdone Chapel

An [Obsidian](https://obsidian.md) plugin for spiritual life inside your vault — Scripture,
study, and devotional practice in the same place you already take notes.

The plugin is built as a set of features around that theme. The ones shipped so far are
**Bible version management and navigation** and **`@` references**; study and prayer
journaling are planned (see [Roadmap](#roadmap)).

## Features

### Bible versions

Read the same passage across several translations without losing your place. Put the cursor on
a verse and the plugin will show you — or jump you to — that exact verse in every other version
in your vault, keeping chapter _and_ verse alignment.

- **Sidebar** listing the current verse in every other version at once, following your cursor
  while editing and your scroll position while reading — click a verse in reading mode to hold
  it there. Pin it to hold a verse while you scroll.
- **Version picker** (`Open this verse in another version`) with a preview of each version's
  text before you jump.
- **One command per version**, so each translation can get its own hotkey.
- Jumps land on the verse's block anchor (`#^...`), not just the top of the chapter.
- Handles versions that merge verses — if MENS puts verses 1–2 under `**1**`, asking for verse 2
  finds it and labels the card `v.1`.
- Alt-click a card to copy that version's verse text.

### Writing a version

A study Bible, a commentary, a set of notes on the text — each of them is a version whose
chapters answer a translation's chapters one for one, and none of them is worth typing out by
hand. **Create a Bible version from a translation** asks for five things:

|              |                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Based on** | The translation it answers. Its folders, its file names and its verses are what the new version is written from.    |
| **Folder**   | Where the version folder is made. Made if it is not there.                                                          |
| **Code**     | Names the folder, starts every file name, and opens every block id — what `@Shedd Joao 1.1` calls it.               |
| **Name**     | What a reader sees. Follows the code until you write over it.                                                       |
| **Heading**  | What it is listed under, beside the translations rather than among them. Left empty it is listed first, under none. |

It then copies the translation's layout, renaming only the segments that carry the version —
`5-NT-Gospels/ARA-41-MRK/ARA-41-MRK-014.md` becomes `5-NT-Gospels/Shedd-41-MRK/Shedd-41-MRK-014.md`
— and writes each chapter as an embed of every verse the translation anchored, each under a
block id of the new version's own:

```markdown
# Marcos 14

## [[ARA-41-MRK-014|ARA]]

![[ARA-41-MRK-014#^ara-mrk-14-1|flat]]
^shedd-mrk-14-1

![[ARA-41-MRK-014#^ara-mrk-14-2|flat]]
^shedd-mrk-14-2
```

The id sits on the line under its embed, with a blank line before the next: the id belongs to
the block above it, so anything you write between the two is written inside that verse — and
`@Shedd Mc 14.1` links straight to it. The text itself is never copied, only embedded, so the
new version stays notes about a translation rather than another copy of one.

Each embed is marked [`flat`](#-references), so a verse of the new version is framed once by
whatever quotes it rather than twice — once for the version and once for the translation
inside it.

A note declaring the folder is written beside the chapters, so the new version is
[one the plugin knows](#versions-kept-somewhere-else) wherever you put it:

```yaml
---
bible: true
complete: true
translation: ARA
group: Versões
code: Shedd
name: Bíblia Shedd
---
```

`complete: true` because a generated version has a file for every chapter its translation
has, so `@Shedd Sl 1.1` links to it from the moment it exists. `translation` records what it
was written from — the plugin does not read it back, it is there so the folder says where its
embeds point.

### Chapter breadcrumbs

Every chapter you open gets a bar above it naming the passage, and each part of it is a way
out of the chapter:

```
ARA  ›  João  ›  ‹ 3 ›
```

- **Version** lists every version in the vault and opens the same chapter — and the same
  verse, wherever you are in the chapter — in the one you pick. Versions missing that
  chapter are greyed out, and picking one says what it is missing.
- **Book** lists every book that version has under **Antigo Testamento** and **Novo
  Testamento** — in the language you chose — and opens the first chapter of the one you pick.
  Turn on **Group books by category** to break the testaments down the way a Bible's contents
  page does: Lei, Históricos, Sabedoria, Profetas, Evangelhos, Cartas Paulinas and Gerais.
- **Chapter** lists the book's chapters in a grid, five to a row, so a whole book fits in a
  glance rather than a scroll.
- **The arrows** walk the version chapter by chapter, on into the next book when a book runs
  out — the arrow after Genesis 50 is Exodus 1. They stop at either end of the version.

A list longer than a handful opens with a search field: type to narrow it (`joao` finds João,
`sam` finds 1 Samuel), walk what is left with the arrow keys, and press Enter to open it.
Headings go with the books under them, so a search that leaves one empty takes it down too.

Any of them opens in the pane you clicked from; hold Ctrl/Cmd to open in a new tab instead.
Turn the bar off under **Chapter breadcrumbs**.

### `@` references

Type `@` and a reference anywhere in a note to link to it. The suggestion list shows the
books you could have meant with the opening verse of the passage, and picking one replaces
what you typed with ordinary internal links. Each row reads as the reference it will write,
so what you pick is what the note ends up saying. Enter inserts it; Tab inserts the same
thing and leaves the label selected, so the next thing you type renames the link — `@Sl 1.1`
then Tab writes `[[ARA-19-Salmos-001#^ara-psa-1-1|Sl 1.1]]` with `Sl 1.1` highlighted, ready
to become `Salmo 1` or anything else. A run of verses writes a link each and Tab selects the
first label, the only one spelling the reference out; embeds carry no label, so there Tab
inserts the way Enter does.

| You type      | You get                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `@Joao`       | `[[NVI-43-Joao\|João]]` — the note listing the book's chapters          |
| `@Joao 1`     | `[[NVI-43-JHN-001\|João 1]]`                                            |
| `@Joao 1.1`   | `[[NVI-43-JHN-001#^nvi-jhn-1-1\|João 1.1]]`                             |
| `@Joao 1.1,2` | `[[#^nvi-jhn-1-1-2\|João 1.1,2]]` — one link, to a quote of the passage |
| `@Joao 1.1-3` | `[[#^nvi-jhn-1-1-3\|João 1.1-3]]` — the same, written as the run it is  |

A reference to more than one verse is written as a single link, the way it is read out loud,
and the verses it stands for go into a quote under a `## Citações` heading at the end of the
note — one embed per verse, exactly what `!@` would have written inline:

```markdown
## Citações

> [!quote]+ João 1.1-3 - NVI
> ![[NVI-43-JHN-001#^nvi-jhn-1-1]]
> ![[NVI-43-JHN-001#^nvi-jhn-1-2]]
> ![[NVI-43-JHN-001#^nvi-jhn-1-3]] ^nvi-jhn-1-1-3
```

The line you are writing keeps the reference and nothing else, hovering it shows the whole
passage at once rather than a verse at a time, and every verse is still linked, inside the
quote. The heading is named in the language set under **Language** — `## Quotes` in English —
and is written only where the note has neither name yet; a note that already keeps quotes
gets the new one at the end of that section, before whatever section follows it. The quote is
named after the passage and the version it quotes, whichever way the reference itself was
written; referring to the same passage again links to the quote already there rather than
writing a second one.

References are chained with a semicolon on paper — `Jn 2.9; Ap 7.10` — and the second of a
pair names its book only when it is a different one. Write it the same way here: after a
`;`, a reference may be numbers alone and it carries the book, the chapter and the version
on from the link right before the semicolon. The books still answer under those rows, so
`;@3` is verse 3 of the chapter being carried as much as it is the start of `3 João`.

| You type, after `[[NVI-43-JHN-002\|João 2.9]];` | You get                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| `@3.1`                                          | `[[NVI-43-JHN-003#^nvi-jhn-3-1\|3.1]]` — John again, chapter 3             |
| `@10`                                           | `[[NVI-43-JHN-002#^nvi-jhn-2-10\|10]]` — another verse of the same chapter |
| `@3.1,2`                                        | one link per verse, the way a spelled-out reference writes them            |

Each of those comes twice: once labelled with the numbers as you typed them, once with the
reference spelled out (`João 3.1`), for when the sentence needs the book said again.

Put a `!` in front — `!@Joao 1.1` — and the same reference comes back as embeds, showing the
text in the note instead of pointing at it. An embed carries no label, so a book's
abbreviation and its full name write the same thing and the popup offers each book once,
under its name. `!@` reads as one thing wherever it appears, so `Que texto!@Joao 1.1` embeds
too — put a space between the two to link after an exclamation mark instead.

| You type       | You get                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `!@Joao`       | `![[NVI-43-Joao]]`                                                                                         |
| `!@Joao 1.1`   | `![[NVI-43-JHN-001#^nvi-jhn-1-1]]`                                                                         |
| `!@Joao 1.1-3` | one embed per verse, a line each                                                                           |
| `!@Joao 1`     | your pick of _whole file_ (`![[NVI-43-JHN-001]]`) or _verse by verse_ — one embed per verse of the chapter |

Every embed draws a bar and an indent down its left side, and a version written on top of a
translation is made of embeds itself — so referring to one of its verses shows two of each,
the version's and the translation's inside it. Mark the embed `flat` —
`![[ARA-19-Salmos-001#^ara-psa-1-1|flat]]` — and it draws neither. The marker is an ordinary
link alias, which Obsidian puts on the embed for this plugin's stylesheet to find and every
other reader ignores, so a note written this way still opens anywhere. Flat carries inward:
an embed marked flat flattens the embeds inside it too.

Books are matched in Portuguese and English, by full name, by the two-letter Portuguese
abbreviations (`Gn`, `Jz`, `Sl`, `Tg`, `Ap`), by the usual English ones (`Ps`, `Rev`,
`1Cor`), and by their USFM code (`JHN`). Accents are optional — `@Joao` and `@João` both
work — but writing them helps: `@Jo` offers João first and `@Jó` offers Jó first. A partial
name lists every book it could still become, so `@Jo` also offers Josué, Joel and Jonas.

Writing an abbreviation gets each book twice: once keeping the abbreviation, once spelling
the name out. `@Jn 1.1` offers `Jn 1.1` and `Jonas 1.1`, then `Jn 1.1` and `John 1.1` — `Jn`
is Jonas in Portuguese and John in English, and the name is written in the language the
abbreviation belongs to — so the rows carrying an abbreviation name the book they point at.

**Language** cuts that down to the language you write in: set to Portuguese, `@Jn` only
offers Jonas, and English book names stop matching altogether. It starts on _No
preference_, where every language answers. USFM codes are named the same everywhere, so
`@JHN` keeps working either way, labelled in the language you chose.

The same setting names books everywhere else the plugin does — the sidebar header, the
version picker, the notices — which have only the one name to write and so use the chosen
language, falling back to Portuguese when none is set.

References link to the version set in **Default version for @ references**, which starts on
_Automatic_: the version of the note you are writing in when that note is itself a chapter,
otherwise the first version in the vault. Name a version in the reference itself to override
it for one link — `@ARA Joao 1.1`. Where a version merges verses, the link lands on the
anchor covering the verse asked for, the same way the sidebar does.

## Roadmap

Planned additions, all sharing the same vault-native, no-lock-in approach:

- **Study journaling** — notes tied to the passage you are reading.
- **Prayer journaling** — recording requests and answers over time.
- More devotional tooling as it takes shape.

## Expected vault layout

Used by the Bible version features. Only two things are structural:

1. A **version** is a folder — each direct subfolder of the translations folder, plus any
   folder anywhere in the vault that [says so itself](#versions-kept-somewhere-else).
2. Chapter files are named `<VERSION>-<NN>-<Book>-<CCC>.md` — version, book number, book name,
   chapter.

```
<translationsFolder>/<VERSION>/<any folders you like>/<VERSION>-<NN>-<Book>-<CCC>.md
```

Everything between the version folder and the file is ignored, so each version can be laid out
its own way — flat, split by testament, grouped by category — and versions do not have to agree
with each other:

```
Bibles/ARA/19-Salmos/ARA-19-Salmos-004.md
Bibles/NVI/Antigo Testamento/Poéticos/NVI-19-Salmos-004.md
Bibles/KJV/KJV-19-Psalms-4.md
```

Books are matched across versions by their number, not by folder or book name. Chapter numbers
may be zero-padded to three digits or not; commentaries that keep a single file per book can
use `-000`. A file name must start with its version folder's name, and no two files inside one
version may point at the same chapter — when they do, the plugin skips that chapter and tells
you which files to sort out.

Inside a chapter file, each verse starts with its number — as an ordered list, or in bold —
and may carry a block id:

```markdown
4. Irai-vos e não pequeis; ^ara-psa-4-4
```

A book may also have a note listing its chapters, named `<VERSION>-<NN>-<Book>.md` — no
chapter number. That is what a bare `@Joao` links to; without one it falls back to the
book's first chapter. Nothing separates such a note from an ordinary one that happens to
be named the same way, so two of them claiming one book are reported and skipped, just
like two files claiming one chapter.

### Versions kept somewhere else

Filing every version in one folder is fine while they are all translations, and wrong as soon
as they are not: a study Bible is a version verse for verse, but it belongs with the
commentaries rather than with the translation it is built on.

So a folder can say it is a version itself. Any note sitting **directly in the folder** — the
one it probably already keeps — saying `bible` in its frontmatter and naming a `code` makes
that folder a version, wherever in the vault it is and however deeply it is buried:

```yaml
---
bible: true
code: Shedd
group: Editions
name: Bíblia Shedd
---
```

The `code` is what makes a file the version's own: a note under that folder belongs to Shedd
when it is named `Shedd-41-MRK-014`, and is an ordinary note when it is named anything else.
So the folder can hold more than the version, and the code has to be written rather than read
off the folder's name — a folder can be called whatever you like.

| Key           |                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bible`       | Declares the folder a version, together with `code`. Written at all is enough; `bible: false` is the one way to write it and mean no.                                                |
| `complete`    | Whether the version answers for the whole Bible. Read off where the folder sits when left out — see below.                                                                           |
| `group`       | The heading the version is listed under. No heading when left out.                                                                                                                   |
| `code`        | **Required.** What the version's file names start with, and what `@ARA Joao 1.1` calls it. A folder may be called `Almeida Revista e Atualizada` and still hold `ARA-01-GEN-001.md`. |
| `name`        | Name to show wherever the version is named. The code when left out.                                                                                                                  |
| `translation` | Which translation a generated version was written from. Recorded by the create command for the reader; the plugin does not read it back.                                             |

`bible` and `code` are what a note has to say; the rest are read off where the folder sits
and what it is called, so the shortest declaration is those two lines. `bible` is a key of
its own rather than one of the others doing double duty, because presence is what declares
and every note in the vault is asked: `code`, `name` and `group` are among the most written
frontmatter keys there are, and reading one of them as the marker would have vaults growing
versions they never asked for. `code` has to be written because nothing else can supply it —
the folder's own name is a name someone chose for a folder, and the vault root has none at
all.

A note that says `bible` and names no code declares nothing, and the folder stays an ordinary
folder.

The heading is the vault's to name, not the plugin's: `Editions`, `Comentários`, anything —
except the one the translations folder gives its own, which the plugin writes in the language
book names are read in (**Traduções**, **Translations**). Headings are listed alphabetically
and the versions under each by their code, so nothing has to be numbered. Naming no heading
sorts before naming one, so those versions are listed first.

Declaring is optional and adds to the translations folder rather than replacing it, so a vault
that keeps every version in one place needs none of it:

```
Igreja/Biblias/ARA/…                        a version by where it sits
Igreja/Comentarios/Shedd/Shedd.md           a version because it says so
Igreja/Comentarios/Shedd/…/Shedd-19-PSA-003.md
```

Everything else is the same either way: the same file names, the same book numbers, the same
breadcrumbs, the same sidebar, the same `@` references.

#### Versions that are not the whole Bible

Notes on the four chapters you have got to are worth keeping beside a translation, and a
commentary you are still writing is a version whether or not it has reached Obadiah. Both are
versions here, and a partial one differs in exactly one way:

- They are **read and walked through like any other** — listed in the sidebar, offered by the
  breadcrumb, given their own `Open this verse in ...` command, and picked from the version
  picker. Moving across the files a partial version _does_ have is the whole point of keeping
  it.
- They are **never linked to**. `@` will not offer one, will not complete one from `-kel`,
  will not accept one named in full, and will not fall back to one — not even while you are
  writing inside it. They cannot be chosen as the **Default version for `@` references**
  either, and **Detected versions** lists them as `Kelvin (partial)`.

The reason is the one thing a reference does that reading does not: it writes a link naming a
chapter, and a version that has not written that chapter yet would be linked to a file that
is not there. A dead link now for a note that may be written next year is worse than no link
at all.

Which versions are partial is read off **where they sit**, so most vaults never write the key:

| Where the version is                | Taken as      |
| ----------------------------------- | ------------- |
| A folder in the translations folder | a whole Bible |
| Declared anywhere else              | partial       |

A translation is the whole of a Bible by virtue of being filed with the translations, and a
folder declared out among the commentaries is the sort of thing written a book at a time. The
key is for the folder that is the exception to the company it keeps — `complete: true` on a
study Bible that does run end to end, `complete: false` on a draft translation that does not
yet — and it wins over where the folder sits, either way.

**Create a Bible version from a translation** writes `complete: true` outright rather than
leaving it to where the folder lands: a generated version has a file for every chapter its
translation has, so it is linkable from the moment it is written, wherever you filed it.

## Settings

| Setting                          | Default       | What it does                                          |
| -------------------------------- | ------------- | ----------------------------------------------------- |
| Language                         | No preference | Language book names are read and written in           |
| Translations folder              | `Bibles`      | Folder holding one folder per translation             |
| Default version for @ references | Automatic     | Version `@` references link to                        |
| Open in new tab                  | off           | Off replaces the current tab                          |
| Chapter breadcrumbs              | on            | The `Version > Book > Chapter` bar above each chapter |
| Group books by category          | off           | Sub-headings inside the testaments in the book list   |
| Follow cursor                    | on            | Off updates the sidebar only when you switch notes    |
| Show the version you are reading | off           | Include the current version in the list               |
| Open sidebar on startup          | off           |                                                       |

Versions are the subfolders of the translations folder that hold chapter files, plus every
folder that declares itself one. Use **Reload version list** after adding one.

## Install

Not in the community plugin store. Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT.
2. `BRAT: Add a beta plugin for testing` → `kelvinst/obsidian-kingdone-chapel`.
3. Enable **Kingdone Chapel** in Community plugins.

## Development

```bash
npm install
make install-git-hooks # see below — do this once per clone

npm run dev        # watch build, writes main.js
npm run typecheck  # tsc only
npm run bundle     # production build, writes main.js
npm run build      # both of the above
npm test           # run the test suite once
npm run test:watch # re-run tests as files change
npm run test:coverage
npm run format     # write the formatting
npm run precommit  # everything, fixing what it can fix
```

There is no read-only `check` to run by hand. Locally the point is to be
fixed, not told: `precommit` formats rather than complains, and a run that
raises coverage writes the higher floor back. CI is the one that only reads,
and it says so in its own steps.

Tests are [Vitest](https://vitest.dev) files sitting next to what they cover
(`src/reference.test.ts`), and cover the whole plugin: the parsing it is built
on — `@` references, chapter and verse file names, the book table — and then
the indexing, the sidebar, the breadcrumb bars, the reference popup and the
settings tab. `npm run build` type-checks them along with the rest of `src`.

Every one of those modules imports from `obsidian`, which is type declarations
and no code — the app supplies the classes at runtime, and the bundle leaves
the import for it to fill in. Under Vitest there is no app, so `resolve.alias`
points the name at `test/obsidian.ts`, a stub holding just enough of the API to
run against and a note of what it was asked to do, for a test to read back.
Beside it, `test/dom.ts` installs the helpers Obsidian puts on the DOM
prototypes (`createDiv`, `addClass`, ...), which are not part of the module at
all, and `test/harness.ts` builds a vault, a workspace and a plugin out of a
list of files. Only the tests ever see the stub: the source still type-checks
against the real declarations, which is what keeps the stub from drifting into
an API Obsidian does not have. A test file that needs a DOM opens with
`// @vitest-environment jsdom`, and the ones over the pure modules stay in
`node`.

Formatting is [Prettier](https://prettier.io) at 80 columns, over everything
but the bundle and the lock file.

### Coverage

`npm run test:coverage` prints a table and writes a browsable report to
`coverage/index.html`. It counts every file under `src`, so a module nothing
covers shows up as the zero it is rather than going unmentioned.

Two floors have to hold, and both are in `vitest.config.mts`:

- **The parsing the plugin is built on** — `books.ts`, `reference.ts` and
  `utils.ts` — is at 100% of statements, branches, functions and lines, and has
  to stay there.
  A line that genuinely cannot run is marked `/* v8 ignore next */` with a
  comment saying why, rather than being left to erode the number.
- **The project as a whole** has a floor too, and it only ever climbs:
  `autoUpdate` raises it to whatever a run reaches whenever a run reaches
  higher, writing the new numbers back into the config. When `npm run
precommit` bumps them, commit that along with the tests that earned it. CI
  never writes them.

### Git hooks

`.git-hooks/` holds hooks that run the checks before a commit is made. A clone
does not install them, so install them once:

```sh
make install-git-hooks
```

#### `pre-commit`

Rejects a commit that has unstaged or untracked changes, so the checks always
run against exactly what is being committed. To commit a subset deliberately,
set the rest aside first:

```sh
git stash push --keep-index --include-untracked -m pre-commit
git commit
git stash apply && git stash drop
```

Then it runs `make precommit`, which formats, type-checks, builds and runs the
suite with both coverage floors. Because the tree was staged whole a moment
earlier, anything the formatter rewrote — or any coverage floor that went up —
is staged into the same commit.

To test against a real vault, symlink this repo into it:

```bash
ln -s /path/to/obsidian-kingdone-chapel /path/to/vault/.obsidian/plugins/kingdone-chapel
```

### CI

`Check` answers pull requests that are not drafts and every push to `main`, so
a commit that never went through a pull request is still answered for.
`Release` answers a tag before the release is created. Both run the same four
steps — `Format`, `Type check`, `Bundle`, `Test` — from one composite action in
`.github/actions/gate`, one command to a step rather than one script, so a
failure names itself in the run's own list and neither workflow can drift into
checking something the other does not.

`Check` cancels a superseded run on a pull request, which is only ever asked
about its latest commit, and never on `main`, where each commit is answered for
on its own. Both halves of the concurrency key say so: the group is the branch
for a pull request and the commit for a push, and cancelling is switched off
outside a pull request. The group is what does the work — switching cancelling
off alone would queue instead, and a queued run is cancelled when a third merge
arrives, which loses the commit one merge further out.

Two things differ from the local run, on purpose: CI checks the formatting
instead of writing it, and it passes `--coverage.thresholds.autoUpdate=false`,
so it can only ever read the coverage floors. Raising them stays the hook's job.

Releases are cut by pushing a tag matching the `manifest.json` version (e.g. `1.0.0`); CI
attaches `main.js`, `manifest.json` and `styles.css` to the GitHub release.

## License

MIT
