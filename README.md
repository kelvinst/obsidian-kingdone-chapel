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
in your vault, keeping chapter *and* verse alignment.

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
so what you pick is what the note ends up saying.

| You type | You get |
|---|---|
| `@Joao` | `[[NVI-43-Joao\|João]]` — the note listing the book's chapters |
| `@Joao 1` | `[[NVI-43-JHN-001\|João 1]]` |
| `@Joao 1.1` | `[[NVI-43-JHN-001#^nvi-jhn-1-1\|João 1.1]]` |
| `@Joao 1.1,2` | `[[NVI-43-JHN-001#^nvi-jhn-1-1\|João 1.1]],[[NVI-43-JHN-001#^nvi-jhn-1-2\|2]]` — one link per verse |
| `@Joao 1.1-3` | the same as `1.1,2,3` |

Put a `!` in front — `!@Joao 1.1` — and the same reference comes back as embeds, showing the
text in the note instead of pointing at it. An embed carries no label, so a book's
abbreviation and its full name write the same thing and the popup offers each book once,
under its name. `!@` reads as one thing wherever it appears, so `Que texto!@Joao 1.1` embeds
too — put a space between the two to link after an exclamation mark instead.

| You type | You get |
|---|---|
| `!@Joao` | `![[NVI-43-Joao]]` |
| `!@Joao 1.1` | `![[NVI-43-JHN-001#^nvi-jhn-1-1]]` |
| `!@Joao 1.1-3` | one embed per verse, a line each |
| `!@Joao 1` | your pick of *whole file* (`![[NVI-43-JHN-001]]`) or *verse by verse* — one embed per verse of the chapter |

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
offers Jonas, and English book names stop matching altogether. It starts on *No
preference*, where every language answers. USFM codes are named the same everywhere, so
`@JHN` keeps working either way, labelled in the language you chose.

The same setting names books everywhere else the plugin does — the sidebar header, the
version picker, the notices — which have only the one name to write and so use the chosen
language, falling back to Portuguese when none is set.

References link to the version set in **Default version for @ references**, which starts on
*Automatic*: the version of the note you are writing in when that note is itself a chapter,
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

1. Each direct subfolder of the Bible folder is a **version**.
2. Chapter files are named `<VERSION>-<NN>-<Book>-<CCC>.md` — version, book number, book name,
   chapter.

```
<bibleFolder>/<VERSION>/<any folders you like>/<VERSION>-<NN>-<Book>-<CCC>.md
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

## Settings

| Setting | Default | What it does |
|---|---|---|
| Language | No preference | Language book names are read and written in |
| Bible folder | `Bibles` | Folder holding the version folders |
| Default version for @ references | Automatic | Version `@` references link to |
| Open in new tab | off | Off replaces the current tab |
| Chapter breadcrumbs | on | The `Version > Book > Chapter` bar above each chapter |
| Group books by category | off | Sub-headings inside the testaments in the book list |
| Follow cursor | on | Off updates the sidebar only when you switch notes |
| Show the version you are reading | off | Include the current version in the list |
| Open sidebar on startup | off | |

Versions are the subfolders of the Bible folder that hold chapter files. Use **Reload version
list** after adding one.

## Install

Not in the community plugin store. Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT.
2. `BRAT: Add a beta plugin for testing` → `kelvinst/obsidian-kingdone-chapel`.
3. Enable **Kingdone Chapel** in Community plugins.

## Development

```bash
npm install
npm run dev        # watch build, writes main.js
npm run build      # type-check then production build
npm test           # run the test suite once
npm run test:watch # re-run tests as files change
npm run test:coverage
```

Tests are [Vitest](https://vitest.dev) files sitting next to what they cover
(`src/reference.test.ts`), and cover the parsing the plugin is built on: `@`
references, chapter and verse file names, and the book table. `npm run build`
type-checks them along with the rest of `src`.

`npm run test:coverage` prints a table and writes a browsable report to
`coverage/index.html`. It counts every file under `src`, so the modules that
have no tests yet — `main.ts` and the views — show up as the zeroes they are
rather than going unmentioned.

To test against a real vault, symlink this repo into it:

```bash
ln -s /path/to/obsidian-kingdone-chapel /path/to/vault/.obsidian/plugins/kingdone-chapel
```

Releases are cut by pushing a tag matching the `manifest.json` version (e.g. `1.0.0`); CI
attaches `main.js`, `manifest.json` and `styles.css` to the GitHub release.

## License

MIT
