#!/bin/sh
set -e

CODEX_DIR="${HOME:-/home/node}/.codex"
mkdir -p "$CODEX_DIR"

if [ -f /codex-auth/auth.json ]; then
  cp /codex-auth/auth.json "$CODEX_DIR/auth.json"
  chmod 600 "$CODEX_DIR/auth.json"
fi

exec "$@"
