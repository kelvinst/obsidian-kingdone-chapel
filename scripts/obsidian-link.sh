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
main.js (installing dependencies first if the checkout has none). The Hot Reload plugin
then reloads this plugin by itself.

Settings are also backed up to <vault>/.obsidian/<plugin-id>-data.backup.json on every
run, and restored from there if the previously linked checkout has been deleted.

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
    --vault)
      [ $# -ge 2 ] || { echo "--vault needs a path" >&2; usage >&2; exit 2; }
      VAULT="$2"; shift 2 ;;
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
[ -d "$TARGET" ] || { echo "not a plugin checkout: $TARGET" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd -P)"

[ -f "$TARGET/manifest.json" ] || { echo "not a plugin checkout: $TARGET" >&2; exit 1; }
[ -d "$VAULT/.obsidian" ] || { echo "not an Obsidian vault: $VAULT" >&2; exit 1; }

PLUGIN_ID="$(node -p "require('$TARGET/manifest.json').id")"
PLUGIN_DIR="$VAULT/.obsidian/plugins/$PLUGIN_ID"

# Carry settings over from wherever the vault currently points. A worktree that was
# linked and then deleted leaves a dangling symlink, so keep a backup in the vault too:
# that checkout's data.json is deleted along with it and cannot be recovered otherwise.
BACKUP="$VAULT/.obsidian/$PLUGIN_ID-data.backup.json"
CURRENT=""
LINK_BROKEN=0

if [ -L "$PLUGIN_DIR" ]; then
  if [ -d "$PLUGIN_DIR" ]; then
    CURRENT="$(cd "$PLUGIN_DIR" && pwd -P)"
  else
    LINK_BROKEN=1
  fi
elif [ -e "$PLUGIN_DIR" ]; then
  echo "$PLUGIN_DIR exists and is not a symlink — refusing to replace it" >&2
  exit 1
fi

if [ -n "$CURRENT" ] && [ "$CURRENT" != "$TARGET" ] && [ -f "$CURRENT/data.json" ]; then
  # The vault's settings win, but keep whatever the target had so it is recoverable.
  # Never overwrite an existing .bak: on a second switch back it would hold the copy
  # this script wrote, not the settings the checkout started with.
  if [ -f "$TARGET/data.json" ] && [ ! -f "$TARGET/data.json.bak" ]; then
    cp "$TARGET/data.json" "$TARGET/data.json.bak"
    echo "settings: saved the target's own data.json as data.json.bak"
  fi
  cp "$CURRENT/data.json" "$TARGET/data.json"
  echo "settings: copied data.json from $CURRENT"
elif [ "$LINK_BROKEN" = 1 ]; then
  if [ -f "$BACKUP" ] && [ ! -f "$TARGET/data.json" ]; then
    cp "$BACKUP" "$TARGET/data.json"
    echo "settings: previous link target is gone - restored from $BACKUP"
  else
    echo "note: previous link target is gone - settings not carried over" >&2
  fi
fi

mkdir -p "$(dirname "$PLUGIN_DIR")"
ln -sfn "$TARGET" "$PLUGIN_DIR"
echo "linked: $PLUGIN_DIR -> $TARGET"

# Refresh the backup so a later `git worktree remove` cannot take the settings with it.
if [ -f "$TARGET/data.json" ]; then
  cp "$TARGET/data.json" "$BACKUP"
fi

# Make sure the plugin is in the vault's enabled list.
node -e '
const fs = require("fs");
const [file, id] = process.argv.slice(1);
const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
if (!list.includes(id)) {
  list.push(id);
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
  console.log("enabled: added " + id + " to community-plugins.json");
  console.log("note: restart Obsidian - a running one can write this list back from");
  console.log("      memory and drop the entry again");
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
  # A fresh worktree has no node_modules of its own, and the build needs tsc/esbuild.
  if [ ! -d "$TARGET/node_modules" ]; then
    echo "installing dependencies in $TARGET"
    if [ -f "$TARGET/package-lock.json" ]; then
      (cd "$TARGET" && npm ci)
    else
      (cd "$TARGET" && npm install)
    fi
  fi
  echo "building in $TARGET"
  (cd "$TARGET" && npm run --silent build)
  echo "done - Hot Reload picks up the new main.js"
fi
