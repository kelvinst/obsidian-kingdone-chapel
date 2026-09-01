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

# Fail soft like every other guard here: a resumed session can name a checkout
# that has since been renamed or removed, and that is nothing to do, not an
# error to report.
cd "$project_dir" 2>/dev/null || exit 0

# `bd` keeps one .beads/ per repository, at the primary checkout — a worktree
# shares it rather than getting its own. Anchor on the same directory it does,
# or a session opened in a worktree bootstraps a database bd will never look
# at, and leaves the symlink below dangling beside it. `--git-common-dir` is
# the primary checkout's .git, but it answers relatively (`.git`) when that is
# where we already stand, so resolve it rather than taking `dirname` on faith.
common_dir="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$common_dir" ] && [ -d "$common_dir" ]; then
  beads_root="$(cd "$(dirname "$common_dir")" && pwd)"
else
  beads_root="$project_dir"
fi

beads_dir="${beads_root}/.beads"

[ -d "$beads_dir" ] || exit 0
chmod 700 "$beads_dir" 2>/dev/null || true  # bd warns on group/other-readable .beads
command -v bd >/dev/null 2>&1 || exit 0
command -v dolt >/dev/null 2>&1 || exit 0

# bd 1.0.3 quirk: `bd bootstrap` writes data into .beads/embeddeddolt/,
# but the auto-started Dolt server expects data under .beads/dolt/.
# Pre-creating a symlink makes both paths resolve to the same on-disk data.
# `-L` as well as `-e`: a bootstrap that failed left this link pointing at an
# `embeddeddolt` that was never created, and `-e` follows it to the missing
# target and reports absent — so `ln` would refuse, `set -e` would abort, and
# the retry below could never run.
if [ ! -e "${beads_dir}/dolt" ] && [ ! -L "${beads_dir}/dolt" ] &&
  [ ! -e "${beads_dir}/embeddeddolt" ]; then
  ln -s embeddeddolt "${beads_dir}/dolt"
fi

cd "$beads_root"

# Only when there is no database yet: `bd bootstrap` clones from the remote and
# refuses once `okc` exists, so running it unconditionally would report a
# failure on every session start after the first and teach everyone to ignore
# the one time it means something.
if [ ! -d "${beads_dir}/embeddeddolt" ]; then
  bd bootstrap --yes >/dev/null 2>&1 || {
    printf 'bootstrap-bd: bd bootstrap failed (continuing)\n' >&2
  }
fi

# The remote lives in the Dolt database, which is runtime state and not in git,
# so a fresh clone has none however it was configured. `sync.remote` in the
# committed config.yaml is the versioned record of it — register it here, or
# `bd dolt push` is a no-op that says "pushing is optional" and exits 0, and
# issues pile up locally without ever reaching DoltHub.
remote_url="$(awk -F'"' '/^sync\.remote:/{print $2}' "${beads_dir}/config.yaml" 2>/dev/null || true)"
if [ -n "$remote_url" ] && ! bd dolt remote list 2>/dev/null | grep -q '^origin[[:space:]]'; then
  bd dolt remote add origin "$remote_url" >/dev/null 2>&1 || {
    printf 'bootstrap-bd: could not register the Dolt remote (continuing)\n' >&2
  }
fi

# `beads.role` lives in .git/config, which no clone inherits, so every bd
# command in a fresh checkout leads with a "not configured" warning. Default it
# once, and leave an explicit choice — `contributor` on a fork — alone.
git config --get beads.role >/dev/null 2>&1 ||
  git config beads.role maintainer 2>/dev/null ||
  true
