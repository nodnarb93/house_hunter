#!/usr/bin/env bash
# Frees the configured PORT (default 3001) of any stale listener.
set -u

PORT="${PORT:-3001}"
export PORT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 1
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORT}" 2>/dev/null | xargs -r kill -9 || true
  sleep 1
else
  node "$SCRIPT_DIR/qa-free-port.mjs"
fi
