#!/usr/bin/env bash
# Launch the Little Ridge Node live-bus host (lrtc_node), which loads the
# node_core framework and the node_am auction module from the deployment tree
# prepared by install.sh / start.sh. Serves http://127.0.0.1:8787.
set -euo pipefail

CURSOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOS_DIR="$(cd "$CURSOR_DIR/../.." && pwd)"

cd "$REPOS_DIR/lrtc_node"
exec npm run dev
