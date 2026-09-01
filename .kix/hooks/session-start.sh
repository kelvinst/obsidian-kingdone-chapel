#!/usr/bin/env bash
# Kix SessionStart hook: make a fresh clone/session self-sufficient — install
# the git hooks, install the dolt + bd CLIs, and bootstrap the beads database.
#
# This script is intentionally agent-neutral. Claude Code invokes it with
# CLAUDE_PROJECT_DIR set; Codex invokes the same script from the repository
# root via .codex/config.toml. Idempotent; safe to run on every session start.
set -euo pipefail

export PATH="${HOME}/.local/bin:${PATH}"

if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  project_dir="$CLAUDE_PROJECT_DIR"
elif project_dir="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  printf 'kix-session-start: skipped (not inside a git repository)\n' >&2
  exit 0
fi

cd "$project_dir"
export CLAUDE_PROJECT_DIR="$project_dir"

# Wire up repo git hooks. Prefer the repo's make target when present because it
# may include repo-specific hook wiring. Fall back to the generic hook install
# logic so fresh repos still work before Makefile targets are merged.
if command -v make >/dev/null 2>&1 && [ -f Makefile ] && grep -Eq '^setup:' Makefile; then
  make setup >/dev/null 2>&1 || true
elif [ -d .beads/hooks ]; then
  git config core.hooksPath .beads/hooks 2>/dev/null || true
  chmod +x .beads/hooks/* 2>/dev/null || true
elif [ -d .git-hooks ] && find .git-hooks -maxdepth 1 -type f 2>/dev/null | grep -q .; then
  hooks_dir="$(git rev-parse --git-path hooks 2>/dev/null || echo .git/hooks)"
  mkdir -p "$hooks_dir"
  cp -f .git-hooks/* "$hooks_dir"/ 2>/dev/null || true
  chmod +x "$hooks_dir"/* 2>/dev/null || true
fi

"$project_dir/.kix/hooks/install-dolt.sh" || true
"$project_dir/.kix/hooks/install-bd.sh" || true
"$project_dir/.kix/hooks/bootstrap-bd.sh" || true

if command -v bd >/dev/null 2>&1; then
  bd prime || true
fi
