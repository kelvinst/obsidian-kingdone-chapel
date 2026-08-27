# Kingdone Chapel

An [Obsidian](https://obsidian.md) plugin for spiritual life inside your vault — Scripture,
study, and devotional practice in the same place you already take notes.

The plugin is built as a set of features around that theme. The first one shipped is **Bible
version management and navigation**; study and prayer journaling are planned (see
[Roadmap](#roadmap)).

## Features

### Bible versions

Read the same passage across several translations without losing your place. Put the cursor on
a verse and the plugin will show you — or jump you to — that exact verse in every other version
in your vault, keeping chapter *and* verse alignment.

- **Sidebar** listing the current verse in every other version at once, following your cursor
  as you read. Pin it to hold a verse while you scroll.
- **Version picker** (`Open this verse in another version`) with a preview of each version's
  text before you jump.
- **One command per version**, so each translation can get its own hotkey.
- Jumps land on the verse's block anchor (`#^...`), not just the top of the chapter.
- Handles versions that merge verses — if MENS puts verses 1–2 under `**1**`, asking for verse 2
  finds it and labels the card `v.1`.
- Alt-click a card to copy that version's verse text.

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

Inside a chapter file, each verse starts with its number in bold and may carry a block id:

```markdown
**4** Irai-vos e não pequeis; ^ara-19-4-4
```

## Settings

| Setting | Default | What it does |
|---|---|---|
| Bible folder | `Bibles` | Folder holding the version folders |
| Open in new tab | off | Off replaces the current tab |
| Hidden versions | — | Comma-separated version folders to ignore |
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
npm run dev     # watch build, writes main.js
npm run build   # type-check then production build
```

To test against a real vault, symlink this repo into it:

```bash
ln -s /path/to/obsidian-kingdone-chapel /path/to/vault/.obsidian/plugins/kingdone-chapel
```

Releases are cut by pushing a tag matching the `manifest.json` version (e.g. `1.0.0`); CI
attaches `main.js`, `manifest.json` and `styles.css` to the GitHub release.

## License

MIT
