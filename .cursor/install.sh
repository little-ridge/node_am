#!/usr/bin/env bash
# Idempotent setup for the Little Ridge Node live-bus stack.
#
# node_am is a drop-in auction module. It runs inside the lrtc_node host, which
# loads modules (node_core framework + node_am) from a sibling deployment tree:
#   <repos>/lrtc_node_app/modules/@little-ridge/{node_core,node_am}
# The host imports that path directly, so the modules must be present there as
# real directories. install.sh prepares dependencies and the (empty) module
# mountpoints; start.sh bind-mounts the live repo checkouts onto them per boot.
set -euo pipefail

CURSOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AM_REPO="$(cd "$CURSOR_DIR/.." && pwd)"
REPOS_DIR="$(cd "$AM_REPO/.." && pwd)"

CORE="$REPOS_DIR/node_core"
HOST="$REPOS_DIR/lrtc_node"
MODULES_ROOT="$REPOS_DIR/lrtc_node_app/modules"
MODULES="$MODULES_ROOT/@little-ridge"

for d in "$CORE" "$HOST"; do
  if [ ! -f "$d/package.json" ]; then
    echo "ERROR: required sibling repo missing: $d" >&2
    echo "This environment needs lrtc_node and node_core cloned next to node_am." >&2
    exit 1
  fi
done

# /agent/repos is root-owned; create the deployment tree with sudo, then hand it
# to the current user so npm and bind mounts can manage it without sudo.
if [ ! -d "$MODULES" ]; then
  sudo mkdir -p "$MODULES"
  sudo chown -R "$(id -u):$(id -g)" "$REPOS_DIR/lrtc_node_app"
fi
mkdir -p "$MODULES/node_core" "$MODULES/node_am"

echo "==> installing node_core dependencies"
npm install --prefix "$CORE"
echo "==> installing lrtc_node dependencies"
npm install --prefix "$HOST"

# Host runtime config. .env.example points SPRUCE_NODE_MODULES at the production
# path (/var/www/...); repoint it at this workspace's deployment tree.
if [ ! -f "$HOST/.env" ]; then
  cp "$HOST/.env.example" "$HOST/.env"
fi
sed -i "s#^SPRUCE_NODE_MODULES=.*#SPRUCE_NODE_MODULES=$MODULES_ROOT#" "$HOST/.env"

# Per-site dev secrets (gitignored). In production WordPress supplies the real
# JWT/webhook secrets; for local dev we generate a consistent pair so the
# bundled verify scripts can sign webhooks against the running host.
if [ ! -f "$HOST/sites.json" ]; then
  JWT="$(openssl rand -hex 24)"
  HOOK="$(openssl rand -hex 24)"
  cat > "$HOST/sites.json" <<EOF
{
  "sites": [
    {
      "origin": "https://am.local",
      "jwtSecret": "$JWT",
      "webhookSecret": "$HOOK",
      "wpBaseUrl": "https://am.local",
      "modules": ["am"]
    }
  ]
}
EOF
fi

echo "==> node_am environment install complete"
