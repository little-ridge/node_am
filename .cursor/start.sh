#!/usr/bin/env bash
# Per-boot setup: expose the live repo checkouts to the host loader.
#
# The lrtc_node loader discovers modules by reading real directories (it skips
# symlinks), so we bind-mount the node_core and node_am checkouts onto the
# deployment-tree mountpoints. Bind mounts are runtime state and do not persist
# across boots/snapshots, so this runs on every start. It is idempotent.
set -euo pipefail

CURSOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AM_REPO="$(cd "$CURSOR_DIR/.." && pwd)"
REPOS_DIR="$(cd "$AM_REPO/.." && pwd)"

CORE="$REPOS_DIR/node_core"
MODULES="$REPOS_DIR/lrtc_node_app/modules/@little-ridge"

# Self-heal if a fresh boot did not carry install's disk state.
if [ ! -d "$CORE/node_modules" ] || [ ! -d "$MODULES" ]; then
  "$CURSOR_DIR/install.sh"
fi

mkdir -p "$MODULES/node_core" "$MODULES/node_am" 2>/dev/null || {
  sudo mkdir -p "$MODULES/node_core" "$MODULES/node_am"
  sudo chown -R "$(id -u):$(id -g)" "$REPOS_DIR/lrtc_node_app"
}

bind() {
  local src="$1" dst="$2"
  if mountpoint -q "$dst"; then
    return 0
  fi
  sudo mount --bind "$src" "$dst"
  echo "bound $src -> $dst"
}

bind "$CORE" "$MODULES/node_core"
bind "$AM_REPO" "$MODULES/node_am"

echo "==> node_am environment start complete"
