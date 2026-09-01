---
saved_at: 2026-09-01T12:52:39Z
session_id: 80777d5c-e314-47eb-a4a5-b2f92b1efdbd
transcript: transcript.jsonl.gz
---

# Tests for the modules that talk to Obsidian

> **Source:** `~/.claude/projects/-Users-kelvinstinghen-Developer-worktrees-obsidian-kingdone-chapel-findings-suggested-fixes-2ab560/80777d5c-e314-47eb-a4a5-b2f92b1efdbd.jsonl` (local; not a public link).

## Goal

The Vitest suite from PR [#13](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/13)
covered the three pure modules and nothing else: whole-project coverage sat at
~14% because `main.ts`, `breadcrumbs.ts`, `suggest.ts`, `view.ts`,
`settings.ts` and `modal.ts` had no tests at all. Every one of them imports
from `obsidian`, and the reason they were untested is that there is nothing to
import. Build something for them to run against, then cover the behaviour that
matters. Work happened on branch `obsidian-module-tests-7f3a91`, PR
[#19](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/19).

## 2026-08-31 — update

- **Branched from `test-framework-setup-6325de`, not `main`.** PR #13 was
  still open at the time and `main` had no Vitest, no `.tool-versions`, no
  gate — nothing to build on.
- **The diagnosis.** `node_modules/obsidian/package.json` carries
  `"main": ""` and `"types": "obsidian.d.ts"`: the package is declarations and
  nothing else. The app supplies the classes at runtime and esbuild marks the
  import external, so under Vitest there is no module to load.
- **How to supply one — three options weighed.**
  - `vi.mock('obsidian', ...)` — rejected: it would have to be repeated in
    every test file, and the factory can't easily hold class identity for the
    `instanceof MarkdownView` / `instanceof TFolder` checks the source makes.
  - A `paths` mapping in `tsconfig.json` — rejected, and this was the
    important one: it would point `obsidian` at the stub for **`src` as well**,
    so `npm run typecheck` would stop answering for the plugin against the real
    API. The whole value of the type-check would go.
  - `resolve.alias` in `vitest.config.mts` — chosen. Runtime only. The source
    keeps compiling against `obsidian.d.ts`; only what Vitest loads is
    swapped.
- **The consequence of that choice, and how it was handled.** Because the
  alias is runtime-only, TypeScript still sees the real classes, so anything
  the stub keeps for a test to assert on (`Plugin.commands`, `notices`,
  `SuggestModal.placeholder`, `MarkdownView.mode`) is invisible to the
  type-checker. Rather than casting at every use, those additions are declared
  once in `test/obsidian-runtime.d.ts` as a `declare module 'obsidian'`
  augmentation — class/interface declaration merging. Objects the tests build
  themselves come from harness helpers that do the stub→real cast internally,
  so the casts live in one file.
- **`test/obsidian.ts`** — the stub: `Component`, `Plugin`, `View`/`ItemView`,
  `MarkdownView`, `Modal`/`SuggestModal`, `EditorSuggest`, `PluginSettingTab`,
  `Setting` with its four component types, `TFile`/`TFolder`/`WorkspaceLeaf`,
  `Notice`, `setIcon`, `MarkdownRenderer`. Each records what it was asked to
  do (`notices`, `Plugin.commands`, `MarkdownRenderer.rendered`,
  `setIcon` writing a `data-icon` attribute), which is how a test reads back a
  notice or a rendered verse with no app to watch.
- **`test/dom.ts`** — the helpers Obsidian installs on the DOM prototypes
  (`createDiv`, `createSpan`, `createEl`, `addClass`, `removeClass`,
  `toggleClass`, `hasClass`, `empty`, `setText`, and the global `createDiv`
  the breadcrumbs mount through). They are not part of the module, so the stub
  alone leaves them undefined. Loaded as `setupFiles`; guarded on
  `typeof HTMLElement !== 'undefined'` so it is a no-op under `node`, where
  the pure modules are still tested. It also fills the two gaps jsdom leaves —
  `Element.prototype.scrollIntoView` and `navigator.clipboard`.
- **Choosing the environment per file.** `environmentMatchGlobs` was rejected:
  deprecated in Vitest 3 and this repo is on Vitest 4. Went with a per-file
  `// @vitest-environment jsdom` docblock on the six new test files, leaving
  `books`/`reference`/`utils` in `node`. `jsdom` added as a dev dependency.
- **`test/harness.ts`** — `FakeVault` (a real folder tree, `mtime` that moves
  on a write, `cachedRead` that _throws_ for a file that has gone away, since
  the plugin is written to expect that rather than an empty string),
  `FakeWorkspace` (leaves, `openLinkText` recorded, `onLayoutReady` that can
  be held back), `FakeMetadataCache`, `FakeEditor` (cursor, selection, a
  `broken` flag for the pane that has been torn down), plus `pane()` and
  `chapter()` builders.
- Six test files written against the behaviour worth keeping: the index and
  what it does with two files claiming one chapter, the verse under the cursor
  and the one being read in reading mode, the jumps and the notices when there
  is nowhere to jump to, the bars and their dropdowns, the reference popup,
  the sidebar, the settings tab.

## 2026-09-01 — update

- **PR #13 had merged while the work was going on**, as a rebase-merge — the
  24 commits are on `main` under new SHAs. `git rebase origin/main` matched
  them by patch-id and dropped all 24, leaving the one commit. Pushed; opened
  PR [#19](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/19).
- **`/kix:rebase!` immediately afterwards found `main` had moved again** —
  `66d2774 feat: link a run of chapters the way a run of verses links` and
  `c319006 fix: link a chapter to itself, written or not`.
- **The conflict was in `vitest.config.mts`,** both sides having raised the
  global floor. Kept ours; that floor is the point of the commit. The per-file
  block above it auto-merged to `main`'s newer wording.
- **The real breakage was not in the conflict.** `66d2774` changed
  `embed`/`link`/`embedLines` to take a `ChapterTarget` (`{chapter, file,
path}`) rather than a `TFile`, and `ParsedRef.chapter` to
  `chapters: number[]`. Three tests failed at runtime — a `TFile` has a
  `.path`, so `linktext` fell through to it and wrote the full vault path —
  and five more failed only under `tsc`, since Vitest does not type-check.
  Both fixed.
- **Covered what the feature added,** rather than lowering the bar to it:
  `chapterTargets` (a run naming a chapter the version has yet to write, a
  book with no example file to copy a name from, a version that is not there),
  `linktext` for a target with no file, and the link/embed rows for a bare
  book reference and for a missing chapter.
- **Floor moved 98.17% → 98.12% on branches**, and deliberately: the new
  `chapterTargets` carries `if (name)` around `chapterFileName`, whose null
  side is unreachable from there — the example basename always comes out of
  the chapter index, so it always ends in `-<digits>`.
- Final: 446 tests, 100% statements / functions / lines, 98.12% branches.
  Commit `84ce9e0`, force-pushed with `--force-with-lease`; PR #19 body
  updated to say what the rebase changed.
- Saved a memory: `git commit` in this repo needs `mise exec --`, because the
  shell's Homebrew Node (25.8.1) does not match the `.tool-versions` pin
  (25.6.1) the pre-commit hook enforces.

## 2026-09-01T12:46:57Z — update

A code review over the whole branch diff (~4,600 added lines: the stub, the
DOM setup, the harness, six test files, the config and the README). Four
findings, all of them tests that cannot fail rather than source bugs — which
is the failure mode a suite this size actually has.

- **`src/view.test.ts:258`** — the Alt-click test asserts
  `world.workspace.opened` is empty _synchronously_. But `jumpTo` awaits
  `findAnchor` before it calls `openLinkText`, so deleting the `return` in
  `view.ts`'s `evt.altKey` branch leaves the assertion passing. Its two
  siblings already had to use `await vi.waitFor(...)` for that very reason.
  The fix is a spy on `plugin.jumpTo` with `not.toHaveBeenCalled()` — exact
  and synchronous, unlike the observable it watches now.
- **`src/main.test.ts:803`** — `'opens the picker on the versions that do'`
  asserts only that no notice was raised. Delete the
  `new VersionSuggestModal(...).open()` from `promptVersion` and it still
  passes. Spy on `SuggestModal.prototype.open` instead.
- **`src/settings.test.ts:111`** — `opens <name> on the setting in force`
  compares the rendered checkbox against the same settings field it was
  rendered from. Swapping `setValue(settings.showBreadcrumbs)` and
  `setValue(settings.followCursor)` in `settings.ts` passes this test _and_
  its `onChange` sibling, because both default to `true`. The same hole
  covers the four fields that share `false`. Render a non-default value and
  assert the literal.
- **`src/breadcrumbs.test.ts:540`** — the teardown calls
  `Reflect.deleteProperty` on `offsetWidth`/`offsetHeight`, which removes
  jsdom's native getters rather than restoring them, and never restores the
  `window.innerWidth`/`innerHeight` that `size()` overwrote (left at 100).
  Any `describe` added below gets `left: NaNpx` out of `CrumbMenu.place`.
  Save the descriptors and put them back.

What was checked and cleared, since knowing what did _not_ turn up is worth as
much as the list above:

- **Missing `await`s across every async call in the tests.** The distinction
  that matters: `openChapter` reaches `openLinkText` before its first `await`,
  so the arrow and book/chapter-menu tests may assert synchronously and are
  correct; `jumpTo` awaits `findAnchor` first, so the version-crumb and
  card-click tests must use `vi.waitFor`, and do. Only `view.test.ts:258` got
  the distinction wrong.
- **Class identity through the alias.** `instanceof MarkdownView` /
  `instanceof TFolder` in the source and `new stub.MarkdownView(...)` in the
  harness resolve to the same module, so the checks are real.
  `Plugin.addCommand` replacing by id matches Obsidian, so the test that calls
  `registerVersionCommands` twice is honest.
- **Cross-test leakage.** `clearNotices()` and `MarkdownRenderer.rendered = []`
  are reset wherever asserted; `breadcrumbs.test.ts` clears `document.body`;
  `view.unload()` stops the polling interval. The `document` click listener
  that `main.test.ts` leaks by never unloading the plugins it loads is inert
  today — `lockPreviewVerse` is called directly there, and a
  `document`-dispatched event has a non-Element target — so it was left off
  the list rather than reported as a bug that does not bite.
- **The reading-mode fixtures.** The `getBoundingClientRect` stubs give the
  binary search in `previewVerse` real, distinguishing geometry rather than
  jsdom's uniform zeros, so those tests measure what they claim to.

## 2026-09-01T12:52:39Z — update

Two of the four review findings applied, each verified by mutation rather than
by the suite going green — a test written to catch a regression is worth only
what it catches, and the whole point of both findings was that the old
assertions caught nothing.

- **`src/view.test.ts`** — the Alt-click test now takes
  `const jump = vi.spyOn(world.plugin, 'jumpTo')` and asserts
  `not.toHaveBeenCalled()`, in place of the synchronous
  `expect(world.workspace.opened).toHaveLength(0)`. A comment says why the
  observable was the wrong one: the jump reads the file for an anchor before
  it opens anything, so nothing is open yet either way. Verified by deleting
  the `return;` from `view.ts`'s `evt.altKey` branch — the test now fails with
  `expected "jumpTo" to not be called at all, but actually been called 1
times`, where before it passed.
- **`src/main.test.ts`** — `'opens the picker on the versions that do'` now
  spies on `SuggestModal.prototype.open` from the stub and asserts it was
  called once, then reads the instance back out of `open.mock.instances[0]` to
  check the picker was opened on the right passage
  (`'Gênesis 1 — pick a version'` — no verse, since the pane the test builds
  has no editor) holding the right versions (`['ARA']`). That last part is why
  the spy is left calling through rather than mocked out: the constructed
  modal is the assertion. Verified by deleting the
  `new VersionSuggestModal(...).open()` line from `promptVersion` — the test
  now fails with `expected "open" to be called 1 times, but got 0 times`.

Both mutations were reverted; `src/view.ts` and `src/main.ts` are untouched by
this branch. The other two findings — the self-referential toggle check in
`settings.test.ts` and the teardown in `breadcrumbs.test.ts` that deletes
jsdom's layout accessors — are still open.

## Open Questions

- [ ] Thirteen branches are still uncovered, all of them fallbacks a stubbed
      Obsidian cannot be put into — a pane with no parent element
      (`breadcrumbs.ts:129`), an event whose target is not a `Node`
      (`breadcrumbs.ts:439,451`), `view.ts:101`, the unreachable
      `chapterFileName` guard in `main.ts`. Mark them with `/* v8 ignore */`
      the way `reference.ts` already does and take the floor to 100%, or leave
      it honest at 98.12%?
- [ ] The stub is checked only by the source compiling against the real
      `obsidian.d.ts` — nothing asserts the stub's own shape matches it. An
      Obsidian API change that the plugin does not use could drift silently.
      Worth a type-level check, or is the compile-time split enough?
- [ ] The review turned up three tests that pass whatever the source does. Is
      that a sign to add a mutation-testing pass (Stryker) over `src`, rather
      than trusting coverage percentages, which were 100% across all three of
      those files?

## Action Items

- [x] Rebase onto `main` and open a PR against it.
  - Commit `84ce9e0`, PR
    [#19](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/19).
- [x] Re-cover the code `main` added while the branch was open.
  - `chapterTargets`, `linktext` with no file, book and missing-chapter rows.
- [ ] Merge PR #19 once `Check` is green — `main` carries a ruleset requiring
      it with `strict: true`, so rebase again rather than merge if `main`
      moves first.
- [x] Fix the synchronous negative assertion at `view.test.ts:258` and the
      picker that is never asserted at `main.test.ts:803`.
  - Both replaced with spies and confirmed by mutating the source they guard.
- [ ] Fix the two review findings still open: the self-referential toggle
      check at `settings.test.ts:111`, and the teardown at
      `breadcrumbs.test.ts:540` that deletes jsdom's layout accessors instead
      of restoring them.
