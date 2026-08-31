---
saved_at: 2026-08-31T17:56:00Z
session_id: b94027d1-7d14-47e7-bfe6-70594b821584
transcript: transcript.jsonl.gz
---

# Vitest suite, coverage floors, and the CI that guards them

> **Source:** `~/.claude/projects/-Users-kelvinstinghen-Developer-worktrees-obsidian-kingdone-chapel-test-framework-setup-6325de/b94027d1-7d14-47e7-bfe6-70594b821584.jsonl` (local; not a public link).

## Goal

The repo had no test framework at all, and nothing between a mistake and
`main`. Pick a framework, write a suite over the parsing the plugin is built
on, and add the checks that keep it honest — a pre-commit hook that fixes what
it can, and CI that only reads. Work happened on branch
`test-framework-setup-6325de`, PR
[#13](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/13).

## 2026-08-30 — update

- **Framework: Vitest.** Offered against Jest + ts-jest and the built-in
  `node:test`. Vitest won on reading TypeScript and ESM as they already are —
  no config file at all is needed here, since its defaults already find
  `src/*.test.ts` and run them in node. Jest would have wanted ts-jest plus ESM
  workarounds; `node:test` would have wanted a separate compile step and has no
  module mocking for a future `obsidian` stub.
- **Tests sit next to what they cover** (`src/reference.test.ts`), so
  `tsc --noEmit` type-checks them with the rest of `src` and the bundle never
  sees them — esbuild starts from `main.ts`.
- First suite in `4de32a7`: 75 cases over `reference.ts` (`@` reference
  parsing, half-typed references, the 50-verse cap returning null rather than a
  truncated passage), `utils.ts` (chapter/book file names, verse lines where
  the block id is believed over the written number) and `books.ts` (table
  integrity, and the ranking where `jo` offers João then Jó while `jó` reverses
  them).
- One test was written wrong first — asserting canonical order meant
  alphabetical code order. Corrected to assert ascending `book.index`, which is
  what "canonical" means here.
- Node bumped `18.x` → `22.x` in the workflows: Vitest 4 requires `>=20`. Both
  workflows moved together so they could not drift.

## 2026-08-30 — update

- **Coverage** (`4374c3c`): `@vitest/coverage-v8`, counting every file under
  `src` rather than only imported ones, so untested modules show as the zeroes
  they are.
- Asked which gate to use; the answer was **both**, plus a ratchet: per-file
  100% on the three tested modules to protect what is covered, _and_ a
  whole-project floor that `autoUpdate` raises whenever a run reaches higher.
  The stated intent — coverage up raises the floor, coverage down fails.
- The one unreachable line (`marked.index ?? 0`, where `String.match` always
  sets `index`) got `/* v8 ignore next */` with a comment, at the user's
  suggestion, rather than being left to erode the number. All three tested
  modules then sat at 100% on every metric.
- Both gates were **watched failing before being trusted**: an uncovered
  `unusedProbe` function took the per-file and project floors down together and
  the run exited 1.
- `c5e2e31`: esbuild `^0.25` → `^0.28`. Vite 8 (via Vitest) asks for
  `esbuild@^0.27 || ^0.28` as an optional peer; the old pin did not answer it,
  so npm 11 left the second copy out of the lock file while npm 10 — what the
  runners ship — installed it and then refused a lock that never recorded it.
  `npm ci` failed on CI for exactly that. Verified against `npm@10.9.4`.

## 2026-08-31 — update

- **Prettier at 80 columns** (`efe9032`). Offered 80/100/120/140 with measured
  churn for each (1439 / 714 / 372 / 282 changed lines); 80 was chosen, matching
  the `line_length: 79` of the sibling Elixir repo `../kingdone`. The book table
  is most of the diff — every row was a line of its own and none fit. Build and
  all tests unchanged afterward.
- **Pre-commit hook + CI** (`c9bde4c`), modelled on `../kingdone`: `.git-hooks/`
  plus `make install-git-hooks`, a hook that refuses a commit with unstaged or
  untracked changes and then runs `make precommit`, and a `Check` workflow.
  The restaging after the checks is safe only because of that refusal —
  everything was staged a moment earlier, so anything differing was written by
  the checks. Both paths were exercised for real: the rejection, and an
  intentionally mangled `chapterKey` signature that landed in the commit
  formatted.
- `install-git-hooks` uses `git rev-parse --git-path hooks` rather than
  `.git/hooks`, because `.git` is a file inside a worktree. Worktrees share one
  hooks directory, so installing here installed for the main checkout too.

## 2026-08-31 — update

- **Review round one** produced six findings; three were applied and three were
  deliberately not.
  - `524a603` — `Check` ran on pull requests only, so nothing answered for
    `main` itself.
  - `3d6f543` — the gate ran as one `npm run check`, so a red run did not say
    which check failed. Split into named steps; `build` was split into
    `typecheck` and `bundle` so the workflows could name each step without
    re-spelling `tsc`/esbuild flags. The `check` script was then **removed
    outright**, following the user's own argument: local and CI are
    deliberately different — local autofixes, CI verifies — so a read-only local
    script was the wrong shape, and its
    `--coverage.thresholds.autoUpdate=false` belonged in the CI yaml.
  - `d402e76` — a tag built and published without running the suite.
  - Not applied: the coverage floor's exact precision (the user reaffirmed the
    behaviour as intended), and two `.git-hooks/pre-commit` findings that remain
    open.

## 2026-08-31 — update

- **Workflow shape, decided by going out and back.** `53a9cef` split `main` into
  its own workflow to stop `cancel-in-progress` from cancelling main pushes;
  `a8977a3` extracted the repeated steps into a composite action at
  `.github/actions/gate` (a `workflow_call` reusable workflow was rejected
  because it runs as its own job, and `Create release` needs the `main.js` that
  `Bundle` writes into the same workspace); `6ff6203` then folded the second
  workflow back on the user's call, since the only real difference was two lines
  of concurrency.
- The final key is `group: check-${{ github.head_ref || github.sha }}` with
  `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Both halves
  are load-bearing: `false` alone only queues, and GitHub cancels an already
  pending run when a third arrives — so two rapid merges would have been safe
  and three would have lost the middle commit.

## 2026-08-31 — update

- **Review round two.** `b053b53` pinned one Node for the hook and CI via
  `.tool-versions` (the user asked for that file over `.nvmrc`; it is what
  `../kingdone` uses and what mise and asdf read). Pinned `25.6.1` rather than
  22 after `mise ls node` showed 25.6.1 installed and 25.8.1 missing — writing
  the machine's Homebrew 25.8.1 made mise error on every command in the repo.
  This moved CI from LTS 22 to Current 25.
- `cfc8606` — the four checks stopped at the first failure. Each now carries
  `!cancelled() && steps.install.outcome == 'success'`; the install half stops a
  failed `npm ci` from becoming four failures saying the same thing.
- **Review round three** found the pin was inert where it mattered: git runs
  hooks through a plain shell, and `sh -c 'node -v'` reports 25.8.1 here while
  the pin is 25.6.1. `40a5f8d` added an assertion to the hook; `2ab5ce7`
  narrowed `engines.node` from `>=22` to `>=25 <26`, since `>=22` could not warn
  the contributor it was added for.
- Every verification in these rounds was run rather than reasoned: the `--`
  passthrough was proven to disable `autoUpdate` under both npm 11/zsh and
  npm 10/bash, the workflows were parsed with `js-yaml`, and `engines` was shown
  to actually emit `EBADENGINE` by temporarily setting it to `>=99`.

## 2026-08-31 — update

- Pushed the branch (18 commits) and the first real CI run of everything this
  session changed came back **green**:
  [run 33421891411](https://github.com/kelvinst/obsidian-kingdone-chapel/actions/runs/33421891411).
  Every workflow change since `6015d54` had been unexercised until now.
- **`setup-node` does read `.tool-versions`.** The log shows
  `Resolved .tool-versions as 25.6.1`, then
  `Acquiring 25.6.1 - x64 from https://nodejs.org/dist/v25.6.1/...`, then
  `node: v25.6.1`. Both halves of that open question — parsing and availability
  of a non-manifest Current release — answered by observation.
- **The composite action collapses the gate into one step, and that was claimed
  otherwise.** When the reusable workflow was rejected in favour of a composite
  action (`a8977a3`), the stated reason included that composite steps still
  appear individually in the run list. They do not. The run has six top-level
  steps — `Set up job`, `checkout`, `Run ./.github/actions/gate`,
  the two `Post Run`s, `Complete job` — with all four checks inside the third
  as 125 lines of grouped log. The commands are findable in the text, but
  `Format`, `Type check`, `Bundle` and `Test` are not steps the UI names, which
  is what splitting them was for. The commit message for `a8977a3` records the
  wrong claim.
- Whether a failing step inside the composite action still fails the calling
  `uses:` step remains unverified — an all-green run cannot show it.

## Open Questions

- [x] Does `actions/setup-node@v4` parse `.tool-versions`, and is Node `25.6.1`
      available to it? Supported since v4.1 and we pin `@v4`, but it is
      unexercised — it would fail loudly at the setup step.
  - Yes to both, observed in run 33421891411: `Resolved .tool-versions as
    25.6.1`, acquired from `nodejs.org/dist`, `node: v25.6.1`.
- [ ] Does a failing step inside a composite action still fail the calling
      `uses:` step now that later steps run past it? `release.yml` depends on
      it: `Create release` has no `if:`, so it is skipped only if the gate step
      is marked failed. Getting this wrong means a release ships on a red gate.
- [ ] Does the gate belong in a composite action at all, now that it is known
      to collapse the four checks into one step in the run list? The
      alternatives both cost something: a `workflow_call` reusable workflow
      names each step but needs artifact plumbing to get `main.js` to
      `Create release`, and inlining restores the duplication across the two
      workflows.
- [ ] Is moving CI from LTS 22 to Current 25 the intent? It followed from
      pinning the version already installed locally, not from a decision about
      release toolchains.
- [ ] Should the coverage ratchet handle parallel branches? Two branches that
      both raise the floor conflict in `vitest.config.mts`, and after rebasing
      the loser fails against a floor it did not reach — even though it
      increased coverage relative to its base. Raised but not decided.

## Action Items

- [x] Push the 17 commits and watch `Check` go green. **No CI work in this
      session has run on GitHub** — every workflow change since `6015d54` is
      unexercised.
  - Pushed as `e39fe94`; run 33421891411 succeeded.
- [ ] Run `make install-git-hooks` to activate the Node assertion. It will
      reject commits on this machine until the committing shell resolves to
      25.6.1 (`mise install`, then commit from an activated shell).
- [ ] Address or close the two open `.git-hooks/pre-commit` findings: `git add -A`
      sweeps unrelated reformatted files into a commit, and it dirties the index
      under `git rebase --exec`, which `/kix:rebase` runs. They share a line and
      would land as one rewrite.
- [ ] Cover the untested modules — `main.ts` (955 lines), `breadcrumbs.ts`
      (577), `suggest.ts` (352), `view.ts`, `modal.ts`, `settings.ts`. Each needs
      a stubbed `obsidian` module (`resolve.alias`) and `environment: 'jsdom'`.
      The project floor exists to be climbed by this.
