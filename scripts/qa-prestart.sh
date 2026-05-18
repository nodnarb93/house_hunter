#!/usr/bin/env bash
# Frees the configured PORT, then execs the dev server. Used by Playwright's
# webServer.command so npm start can bind even when a stale process still
# holds the port without responding on the health-check URL.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3001}"
export PORT

bash "$SCRIPT_DIR/qa-free-port.sh"

exec npm start
