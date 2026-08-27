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
  while editing and your scroll position while reading — click a verse in reading mode to hold
  it there. Pin it to hold a verse while you scroll.
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

Used by the Bible version features. Version folders live under one Bible folder, each holding
book folders, each holding one file per chapter:

```
<bibleFolder>/<VERSION>/<NN-Book>/<VERSION>-<NN-Book>-<CCC>.md
```

For example, `Bibles/ARA/19-Salmos/ARA-19-Salmos-004.md`. Chapter numbers may be zero-padded to
three digits or not; commentaries that keep a single file per book can use `-000`.

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

Versions are detected from the folder structure. Use **Reload version list** after adding one.

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
