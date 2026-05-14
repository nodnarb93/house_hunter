#!/usr/bin/env bash
# Orchestrates Playwright JSON output + qa-summarize.mjs. Playwright's exit
# code is the authoritative pass/fail (see BIZ-169 / BIZ-170).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

rm -rf qa/last-run
mkdir -p qa/last-run

export PLAYWRIGHT_JSON_OUTPUT_NAME=qa/last-run/results.json

npx playwright test --reporter=json
PW_EXIT=$?

node scripts/qa-summarize.mjs \
  --exit-code="$PW_EXIT" \
  --json=qa/last-run/results.json \
  --out=qa/last-run || true

rm -f qa/last-run/results.json

exit "$PW_EXIT"
