#!/usr/bin/env bash
# Point the test vault's plugin folder at a checkout (worktree or main) and rebuild.
# The Hot Reload plugin (pjeby/hot-reload) watches the linked folder and reloads this
# plugin on its own when main.js changes, so nothing here touches the Obsidian UI.
set -euo pipefail

VAULT="${OBSIDIAN_VAULT:-$HOME/Developer/Stingdom}"
TARGET=""
DO_BUILD=1

usage() {
  cat <<'USAGE'
Usage: scripts/obsidian-link.sh [options] [checkout-path]

Links <vault>/.obsidian/plugins/<plugin-id> to the given checkout (default: the
checkout this script lives in), copies data.json over so settings survive, and builds
main.js. The Hot Reload plugin then reloads this plugin by itself.

Options:
  --main            link the main checkout instead of the current worktree
  --vault PATH      vault to link into (default: $OBSIDIAN_VAULT or ~/Developer/Stingdom)
  --no-build        skip the production build
  -h, --help        show this help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --main) TARGET="__MAIN__"; shift ;;
    --vault) VAULT="$2"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

if [ "$TARGET" = "__MAIN__" ]; then
  # The first `git worktree list` entry is always the main checkout.
  TARGET="$(git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
elif [ -z "$TARGET" ]; then
  TARGET="$REPO_ROOT"
fi
TARGET="$(cd "$TARGET" && pwd)"

[ -f "$TARGET/manifest.json" ] || { echo "not a plugin checkout: $TARGET" >&2; exit 1; }
[ -d "$VAULT/.obsidian" ] || { echo "not an Obsidian vault: $VAULT" >&2; exit 1; }

PLUGIN_ID="$(node -p "require('$TARGET/manifest.json').id")"
PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"

# Carry settings over from wherever the vault currently points.
if [ -L "$PLUGIN_DIR" ]; then
  CURRENT="$(cd "$(dirname "$PLUGIN_DIR")" && cd "$(readlink "$PLUGIN_DIR")" && pwd)"
  if [ "$CURRENT" != "$TARGET" ] && [ -f "$CURRENT/data.json" ]; then
    cp "$CURRENT/data.json" "$TARGET/data.json"
    echo "settings: copied data.json from $CURRENT"
  fi
elif [ -e "$PLUGIN_DIR" ]; then
  echo "$PLUGIN_DIR exists and is not a symlink — refusing to replace it" >&2
  exit 1
fi

mkdir -p "$(dirname "$PLUGIN_DIR")"
ln -sfn "$TARGET" "$PLUGIN_DIR"
echo "linked: $PLUGIN_DIR -> $TARGET"

# Make sure the plugin is in the vault's enabled list.
node -e '
const fs = require("fs");
const [file, id] = process.argv.slice(1);
const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
if (!list.includes(id)) {
  list.push(id);
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
  console.log("enabled: added " + id + " to community-plugins.json");
}
' "$VAULT/.obsidian/community-plugins.json" "$PLUGIN_ID"

# Hot Reload arms any plugin folder holding .hotreload (or .git), so drop the marker in.
touch "$TARGET/.hotreload"

if [ ! -f "$VAULT/.obsidian/plugins/hot-reload/main.js" ]; then
  echo "note: Hot Reload plugin is not installed in $VAULT - this plugin will not reload itself" >&2
elif ! grep -q '"hot-reload"' "$VAULT/.obsidian/community-plugins.json" 2>/dev/null; then
  echo "note: Hot Reload is installed but not enabled - enable it in Community plugins" >&2
fi

if [ "$DO_BUILD" = 1 ]; then
  echo "building in $TARGET"
  (cd "$TARGET" && npm run --silent build)
  echo "done - Hot Reload picks up the new main.js"
fi
