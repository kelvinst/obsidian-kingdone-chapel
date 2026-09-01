---
saved_at: 2026-09-01T09:45:00Z
session_id: fe9efe60-3c0e-466d-9fb3-ab13db813937
---

# npm run vault takes a vault directory

> **Source:**
> `~/.claude/projects/-Users-kelvinstinghen-Developer-worktrees-obsidian-kingdone-chapel-genesis-embed-command-56dc1e/fe9efe60-3c0e-466d-9fb3-ab13db813937.jsonl`
> (local; not a public link).

## Goal

Make `npm run vault` accept a directory argument, so a second Obsidian vault
can be pointed at a worktree without editing the script or exporting
`OBSIDIAN_VAULT`.

## 2026-09-01 — update

Section body written with the `caveman` compression skill (ultra), which was
active for the whole session.

- Read `scripts/obsidian-link.sh`. It already took a positional
  `[checkout-path]` plus `--vault PATH`, so the ask was ambiguous: "a directory
  I want to copy the vault to" could mean either side of the link.
- Probed npm's argument forwarding before changing anything.
  `npm run vault /nope/nope` printed `not a plugin checkout: /nope/nope`, so
  npm 7+ does forward bare positionals — the positional path already worked.
- Found a real trap in the same probe: `npm run vault --vault /tmp/x` had npm
  swallow `--vault` as its own config and pass `/tmp/x` through as the
  **checkout**, silently doing the wrong thing. Options need a `--` separator.
- Asked which directory the positional should mean rather than guessing, since
  the three readings (checkout path / vault path / worktree name) lead to
  different scripts. User chose **vault path**.
- Swapped the positional: the `*)` case now assigns `VAULT` instead of
  `TARGET`. Added `--checkout PATH` to keep the old positional job reachable;
  `--main` and `--vault PATH` stay as they were, `--vault` now an alias of the
  positional.
- Rewrote the usage block for the new shape and documented the npm `--`
  separator with both forms spelled out, since the failure it prevents is
  silent.
- Verified against a throwaway vault in the scratchpad: positional linked
  `FakeVault/.obsidian/plugins/kingdone-chapel` at this worktree, `/nope/nope`
  gave `not an Obsidian vault: /nope/nope` (exit 1), and
  `-- --checkout /nope` gave `not a plugin checkout: /nope` (exit 1). Fake
  vault removed afterwards.
- Noted the breakage for the record: `npm run vault ../some-worktree` now
  reads that path as a vault and fails loudly with `not an Obsidian vault`.
  Loud failure was judged acceptable over silently changing meaning, and
  `-- --checkout ../some-worktree` is the replacement.

## 2026-09-01T09:30:00Z — update

Section body written with the `caveman` compression skill (ultra), active all
session.

- Opened [PR #20](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/20)
  for the script change, then reviewed it.
- Review turned up one real defect and it was the PR's own subject: npm keeps
  any option not behind a `--`, exporting it as `npm_config_*` and dropping it
  from argv. Probed it with a throwaway `__probe` script in `package.json`:
  `--main` arrived as empty argv plus `npm_config_main=true`, `--no-build` as
  `npm_config_build=` with the flag gone. So `npm run vault --main` linked the
  current worktree rather than main, and `--no-build` built anyway. Moving the
  vault to the positional slot made the mix more likely to be typed, not less.
- Fixed in `7961ab1` by reading those two variables back before the parse loop,
  so a surviving argv option still overrides. Written as `if` statements, not
  `[ ... ] && ...`, which under `set -e` exits the script whenever the test is
  false. Path options left alone — recovering a path npm may have normalised is
  a guess — and the usage text now says which options still need the separator.
- Verified all four cases against a throwaway vault: eaten flags took effect
  (linked the main checkout, skipped the build), explicit `-- --checkout .`
  still won, a plain run kept the default checkout, and a run with no
  `npm_config_*` at all exited 0.
- User asked that no `transcript.jsonl` be committed and that it be gitignored.
  Surveyed first: one tracked blob, 687 KB, in the `2026-08-31-vitest-...`
  archive on `main`, inherited by all eight branches cut from it. My own
  session's transcript was dropped by amending the commit.
- User chose a full history rewrite over a forward-only delete. Prepared it
  without pushing: bundled every ref as a backup, mirror-cloned, dropped the 27
  read-only `refs/pull/*` refs, ran `git filter-branch --index-filter`, and
  checked the result — rewritten `main` differed from the old one by exactly
  the blob and nothing else. A first verification pass was wrong because
  `git log --all` included filter-branch's own `refs/original/*`; re-checked
  against heads and tags only.
- Abandoned the rewrite at the push. `main`'s ruleset answered
  `Cannot force-push to this branch`, and the other seven branches were left
  unpushed on purpose — rewritten branches against an unrewritten `main` would
  have made every open PR an unmergeable full-repo diff.
- Two facts changed the decision and were put to the user: the rewrite touched
  8 branches and 9 local worktrees rather than the 2 first estimated, and it
  would not have erased anything — GitHub keeps `refs/pull/*` read-only and
  indefinitely, so PRs #1–#20 still reach the blob. Only GitHub Support can
  purge those.
- User switched to the forward-only delete.
  [PR #21](https://github.com/kelvinst/obsidian-kingdone-chapel/pull/21)
  (`d38b27a`) removes the blob, drops the dangling `transcript:` frontmatter
  field, and gitignores `transcript.jsonl` + `transcript.jsonl.gz`. The seven
  other branches inherit the deletion on merge; none had a transcript of its
  own.
- Moved the `.gitignore` lines out of PR #20 into PR #21 so the two cannot
  conflict on that file, and amended PR #20 again.

## 2026-09-01T09:45:00Z — update

Section body written with the `caveman` compression skill (ultra), active all
session.

- Second review pass over the whole of PR #20, now three commits.
- Checked the `npm_config_*` seeding by testing the assumption it rests on
  rather than trusting it: a plain `npm run` leaves both `npm_config_main` and
  `npm_config_build` unset, and neither `~/.npmrc` nor the repo `.npmrc`
  defines them. Had either been set by default, the seeding would have skipped
  every build silently. It does not, so the fix stands.
- Also confirmed `${npm_config_build-unset}` is the right set-but-empty test
  for npm's `--no-build` normalisation, that both expansions are `set -u`-safe,
  and that argv still overrides because the loop runs afterwards.
- One finding, and it is pre-existing rather than from this diff: the backup
  guard at `scripts/obsidian-link.sh:107` skips saving the target's
  `data.json` whenever any `data.json.bak` already exists, so the copy at line
  111 overwrites live settings with nothing holding the old content.
- It is the bug that ate this worktree's `data.json` earlier in the session, so
  it is confirmed by having happened rather than by reading. `4c1dcc1` added
  the guard deliberately, to keep the first `.bak` as the checkout's original
  settings — the intent is right, the consequence is a silent loss on the
  second switch into the same checkout.
- This PR does not touch that code but does make it fire far more often:
  putting the vault in the positional slot exists to encourage pointing several
  vaults at several checkouts, and every switch runs that copy.
- Suggested fix keeps both properties: leave the `.bak` rule alone, and add an
  unguarded copy to `data.json.prev` immediately before the overwrite, so the
  original and the just-clobbered state are both recoverable. `data.json.prev`
  would need a `.gitignore` line beside the existing `data.json.bak`.

## Open Questions

- [ ] Should the positional auto-detect instead (a directory holding
      `.obsidian` is a vault, one holding `manifest.json` is a checkout)? It
      would take the breakage to zero, but was passed over as less explicit.
- [x] Can the transcript blobs actually be removed from GitHub?
  - No. A branch rewrite is blocked by `main`'s ruleset, and even with it
    lifted the blobs stay reachable through `refs/pull/*`, which GitHub serves
    read-only and keeps indefinitely. Only GitHub Support can purge them.
- [ ] Should `--vault` and `--checkout` also be recovered from `npm_config_*`?
      Left out of the review fix as a guess at a path npm may have normalised;
      the usage text documents the `--` separator instead.

## Action Items

- [x] Fix the npm flag-swallowing found in review.
  - `7961ab1` on PR #20.
- [x] Stop committing session transcripts and gitignore them.
  - `d38b27a` on PR #21.
- [ ] Merge PR #21 before PR #20, or rebase #20 after, so the branch stops
      carrying the inherited 687 KB blob.
- [x] `data.json` in this worktree was overwritten with the main checkout's
      copy by a verification run of the link script (its `data.json.bak` is an
      unrelated Aug 30 snapshot, so the original is not recoverable from it).
  - Root-caused in the second review: the `[ ! -f "$TARGET/data.json.bak" ]`
    guard at `scripts/obsidian-link.sh:107` suppressed the backup. Not an
    accident of the test run — a real bug any second switch reaches.
- [ ] Fix that guard: add an unguarded `cp` to `data.json.prev` before the
      overwrite at `scripts/obsidian-link.sh:111`, and gitignore
      `data.json.prev`. Left out of this PR, which does not otherwise touch
      the settings-carry code.
- [ ] Reset this worktree's `data.json` from Obsidian if its settings mattered;
      it currently holds the main checkout's copy.
