# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on
this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full
workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or
  markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT
complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs
   follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on
confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i`
(interactive) mode on some systems, causing the agent to hang indefinitely
waiting for y/n input.

**Use these forms instead:**

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**

- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Build & Test

This is an Obsidian plugin: TypeScript bundled by esbuild, tested with Vitest.

```bash
npm run dev            # esbuild watch build
npm run build          # tsc --noEmit + production bundle
npm test               # vitest run
npm run test:coverage  # vitest run --coverage (enforces the coverage floors)
npm run format         # prettier --write .
npm run format:check   # prettier --check .
npm run precommit      # format + build + test:coverage — what the hook runs
npm run vault          # symlink the built plugin into the Obsidian vault
```

`.tool-versions` pins Node; `mise install` (or asdf) provides it. The
pre-commit hook refuses a commit made on any other version, because CI answers
for the commit on the pinned one.

## Git Hooks

`.git-hooks/` holds the hooks; `make install-git-hooks` copies them into the
git hooks directory (asking git where that is, so worktrees work). Run it once
per clone — the SessionStart hook does it for agent sessions.

`pre-commit` is beads' DB → JSONL sync (the managed section between the
`BEGIN/END BEADS INTEGRATION` markers) followed by the repo gate: reject a
dirty tree, check the Node pin, run `make precommit`, then fold the rewrites
back into the commit they were run for.

## Beads & Dolt Bootstrap

Beads data lives in a Dolt database that is **not** in git — the DoltHub remote
`kelvinst/obsidian-kingdone-chapel` is the source of truth. Only the config and
the ignore rules are versioned — `.beads/config.yaml`, `.beads/metadata.json`,
`.beads/README.md`, and `.beads/.gitignore`; the database itself is not.

`.kix/hooks/session-start.sh` makes a fresh clone self-sufficient: it installs
the git hooks, downloads pinned `dolt` and `bd` binaries into `~/.local/bin`
when they are missing, and runs `bd bootstrap`. Claude Code invokes it from
`.claude/settings.json`, Codex from `.codex/config.toml`.
