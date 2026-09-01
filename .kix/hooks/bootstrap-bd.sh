#!/usr/bin/env bash
# Bootstrap the beads database on first run of a fresh clone (e.g. cloud
# Claude Code sessions). The Dolt-backed database is runtime state that
# isn't checked into git, so without this `bd prime`, `bd ready`, etc.
# fail with "database not found" until the user runs bootstrap manually.
#
# Idempotent: safe to invoke on every SessionStart.
set -euo pipefail

beads_dir="${CLAUDE_PROJECT_DIR}/.beads"

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

cd "$CLAUDE_PROJECT_DIR"
bd bootstrap --yes >/dev/null 2>&1 || {
  printf 'bootstrap-bd: bd bootstrap failed (continuing)\n' >&2
}
