---
saved_at: 2026-09-01T06:10:00Z
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

## Open Questions

- [ ] Should the positional auto-detect instead (a directory holding
      `.obsidian` is a vault, one holding `manifest.json` is a checkout)? It
      would take the breakage to zero, but was passed over as less explicit.

## Action Items

- [ ] Nothing outstanding — the change is self-contained in
      `scripts/obsidian-link.sh`.
