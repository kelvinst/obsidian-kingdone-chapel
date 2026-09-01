---
saved_at: 2026-09-01T13:22:00Z
session_id: ce745136-1681-4d15-a513-2998b2dbc40e
---

# Install beads with a DoltHub remote, mirroring kix-agents

> **Source:** `~/.claude/projects/-Users-kelvinstinghen-Developer-worktrees-obsidian-kingdone-chapel-test-framework-setup-6325de/ce745136-1681-4d15-a513-2998b2dbc40e.jsonl` (local; not a public link).
>
> The gzipped transcript is **not** in this folder — copying it out of the
> Claude projects directory was refused by the permission classifier. See the
> Action Items.

## Goal

Install beads in `obsidian-kingdone-chapel`, pointed at the DoltHub repo
`kelvinst/obsidian-kingdone-chapel`, wired the way `../kix-agents` wires it —
taking the bd, dolt, and gitignore configuration from there.

## 2026-09-01 — survey of kix-agents

- Read the whole kix-agents install before touching anything: `.beads/`
  (tracked: `.gitignore`, `README.md`, `config.yaml`, `metadata.json`,
  `hooks/*`), `.kix/hooks/` (`install-dolt.sh`, `install-bd.sh`,
  `bootstrap-bd.sh`, `session-start.sh`), `.claude/settings.json`,
  `.codex/config.toml`, and the root `.gitignore`.
- Key facts that shaped the port:
  - `.beads/metadata.json` says `"dolt_mode": "embedded"` — the local Dolt DB
    is the source of truth and DoltHub is a push/pull remote, not a
    replacement for local storage.
  - `.beads/config.yaml` carries `sync.remote`, but that alone does not
    register the remote — `bd dolt remote add origin <url>` writes into the
    Dolt DB itself, which is gitignored, so each clone re-registers it.
  - `docs/sessions/2026-08-31-confirm-beads-dolthub-remote-stop-tracking-issues-c3df7b2e/log.md`
    records the decision behind kix's `.beads/.gitignore` carrying
    `issues.jsonl`: the Dolt remote is the source of truth, so the
    auto-exported JSONL must not ride into commits. That line is the only
    difference between kix's `.beads/.gitignore` and the one `bd init`
    generates — it was carried over deliberately.
  - `AGENTS.md` is a **symlink** to `CLAUDE.md` in kix-agents, not a copy.

## 2026-09-01 — install

- Copied `.kix/hooks/*` from kix-agents verbatim (pinned `dolt` 2.0.0 and `bd`
  1.0.3 downloads into `~/.local/bin`, plus the `bd bootstrap` +
  `.beads/dolt → embeddeddolt` symlink workaround for the bd 1.0.3 layout
  quirk).
- Ran `bd init --prefix okc --skip-hooks --role maintainer --non-interactive`.
  Prefix `okc` chosen as the three-letter analogue of kix's `kxa`.
  `--skip-hooks` because this repo already has its own hook system (see the
  next section).
- **bd is worktree-aware**: invoked from the
  `test-framework-setup-6325de` worktree, it created `.beads/` at the _primary_
  checkout (`~/Developer/obsidian-kingdone-chapel`), not in the worktree. The
  runtime Dolt data lives there and is shared. The four tracked config files
  were copied into the worktree so they could be committed on this branch;
  `bd ready` was re-run afterwards to confirm bd still resolves to the primary
  checkout's data rather than treating the worktree copy as a second install.
  It does.
- Set `sync.remote` in `.beads/config.yaml` to
  `https://doltremoteapi.dolthub.com/kelvinst/obsidian-kingdone-chapel`,
  replaced `.beads/.gitignore` with kix's, and appended kix's beads/dolt block
  to the root `.gitignore` (`.dolt/`, `*.db`, `.beads-credential-key`,
  `.beads/dolt`). Skipped their `.claude/worktrees/` line — not beads config,
  and this repo keeps worktrees outside the tree anyway.
- Verified every runtime path is ignored via `git check-ignore -v`:
  `issues.jsonl`, `interactions.jsonl`, `backup/`, `embeddeddolt/`, and the
  `.beads/dolt` symlink all resolve to a rule.

## 2026-09-01 — two deliberate divergences from kix-agents

- **Hooks.** kix-agents points `core.hooksPath` at `.beads/hooks/` and has
  deleted its `.git-hooks/`. This repo goes the other way: `.git-hooks/` plus
  `make install-git-hooks`, and its `pre-commit` is doing real work (Node-pin
  check against `.tool-versions`, staged-path capture so the formatter's
  unrelated rewrites don't get folded in, rebase guard). Overwriting that to
  match kix would have thrown it away, so instead the beads managed block was
  prepended above the existing gate and the four beads-only hooks
  (`post-checkout`, `post-merge`, `pre-push`, `prepare-commit-msg`) were
  dropped into `.git-hooks/`. Considered and rejected: switching this repo to
  `core.hooksPath`.
- **Makefile.** `session-start.sh` looks for a `setup:` target by name before
  falling back to copying `.git-hooks/` itself. Added `setup: install-git-hooks`
  so the named path is the one that runs — same result, but the hook takes its
  intended branch instead of the fallback.
- `.prettierignore` gained `.beads/` (kix ignores the whole directory) after
  `prettier --check` flagged three bd-generated files it wanted to reformat.
- `bd init` wrote a `CLAUDE.md` (none existed here) with placeholder
  `_Add your build commands here_` sections; those were replaced with this
  repo's actual npm scripts, the Node-pin explanation, and how the hooks and
  the beads/dolt bootstrap fit together. `AGENTS.md` was made a symlink to it,
  matching kix.

## 2026-09-01 — DoltHub blocker

- `bd dolt push` failed: `PermissionDenied`. First read of
  `curl -o /dev/null -w %{http_code} https://www.dolthub.com/repositories/kelvinst/obsidian-kingdone-chapel`
  returned `200` and was taken as proof the repo existed — that was wrong,
  DoltHub is an SPA and returns 200 for any path.
- The authoritative check is the API:
  `https://www.dolthub.com/api/v1alpha1/kelvinst/obsidian-kingdone-chapel`
  returns `"no such repository"`, while the same call for `kelvinst/kix-agents`
  lists its tables. The repo has to be created on dolthub.com first; `dolt` has
  no CLI verb for it and the REST path needs the user's token.
- Everything else is verified working: `bd ready`, `bd create` (left `okc-8gc`
  as a round-trip marker), `make setup` installing all five hooks,
  `prettier --check .` clean.

## 2026-09-01 — the remote goes live

- User created `kelvinst/obsidian-kingdone-chapel` on DoltHub. Confirmed by the
  API error moving from `"no such repository"` to `"branch not found"` — the
  repo exists and is empty.
- They asked for `bd remote add origin kelvinst/obsidian-kingdone-chapel`.
  There is no `bd remote` command — `bd` answers
  `unknown command "remote"` and suggests `promote`. The verb is
  `bd dolt remote add`, and `origin` was already registered in the previous
  turn with the full `https://doltremoteapi.dolthub.com/...` URL, which is the
  form it takes rather than a short `owner/repo`. Nothing to redo.
- `bd dolt push` → `Push complete.` Verified from DoltHub's side rather than
  taking bd's word for it: the SQL API over `main` returns `okc-8gc` in the
  `issues` table. `bd dolt pull` is clean too, so the trip works both ways.
- Closed `okc-8gc`, pushed again, and re-queried: DoltHub shows
  `status: closed`, `closed_at: 2026-09-01 13:19:47`. That is the round trip
  the issue existed to prove.

## Open Questions

- [ ] Does `bd bootstrap` read `sync.remote` from `.beads/config.yaml` and
      register the Dolt remote on a fresh clone, or does every clone need a
      manual `bd dolt remote add origin <url>`? kix-agents has both set, so its
      behavior doesn't disambiguate.
- [x] `bd` printed `auto-export: git add failed: exit status 1` and
      `failed to commit config change: exit status 1` on write commands — the
      expected consequence of `issues.jsonl` now being gitignored, but worth
      confirming kix-agents shows the same and that nothing else is failing
      behind that message.
  - Confirmed harmless. Running the add by hand in the primary checkout
    reproduces it exactly: `git add .beads/issues.jsonl` →
    `The following paths are ignored by one of your .gitignore files`, exit 1.
    That is the `issues.jsonl` rule doing its job; bd just reports the refusal
    rather than swallowing it. Nothing else hides behind the message.

## Action Items

- [x] Create `kelvinst/obsidian-kingdone-chapel` on
      https://www.dolthub.com/repositories/new, then run `bd dolt push`. The
      `origin` remote is already registered locally.
  - Repo created by the user; `bd dolt push` complete and verified against the
    DoltHub SQL API.
- [x] Close `okc-8gc` ("Verify DoltHub remote round-trip") once that push
      lands.
  - `bd close okc-8gc`, pushed; DoltHub reflects `status: closed`.
- [ ] Add this session's `transcript.jsonl.gz`. Retried after the remote work
      and refused again — the permission classifier blocks reading
      `~/.claude/projects/…/ce745136-*.jsonl`, so `gzip -c … > …` never runs.
      Needs a Bash permission rule allowing reads under `~/.claude/projects/`;
      until then this archive is the log only. Every re-save of this session
      hits the same wall, so fix the rule rather than retrying.
