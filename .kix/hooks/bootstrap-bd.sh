#!/usr/bin/env bash
# Bootstrap the beads database on first run of a fresh clone (e.g. cloud
# Claude Code sessions). The Dolt-backed database is runtime state that
# isn't checked into git, so without this `bd prime`, `bd ready`, etc.
# fail with "database not found" until the user runs bootstrap manually.
#
# Idempotent: safe to invoke on every SessionStart.
set -euo pipefail

# Only `session-start.sh` exports CLAUDE_PROJECT_DIR, so fall back the way it
# does — otherwise a hand-run of this script aborts on the unset variable
# before reaching the guards that were meant to make it a no-op.
# The `|| true` keeps `set -e` out of it: outside a git repo `rev-parse` exits
# 128, and an assignment carries its substitution's status.
project_dir="${CLAUDE_PROJECT_DIR:-}"
[ -n "$project_dir" ] || project_dir="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$project_dir" ] || exit 0

beads_dir="${project_dir}/.beads"

[ -d "$beads_dir" ] || exit 0
chmod 700 "$beads_dir" 2>/dev/null || true  # bd warns on group/other-readable .beads
command -v bd >/dev/null 2>&1 || exit 0
command -v dolt >/dev/null 2>&1 || exit 0

# bd 1.0.3 quirk: `bd bootstrap` writes data into .beads/embeddeddolt/,
# but the auto-started Dolt server expects data under .beads/dolt/.
# Pre-creating a symlink makes both paths resolve to the same on-disk data.
if [ ! -e "${beads_dir}/dolt" ] && [ ! -e "${beads_dir}/embeddeddolt" ]; then
  ln -s embeddeddolt "${beads_dir}/dolt"
fi

cd "$project_dir"
bd bootstrap --yes >/dev/null 2>&1 || {
  printf 'bootstrap-bd: bd bootstrap failed (continuing)\n' >&2
}
