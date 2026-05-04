#!/bin/bash

set -euo pipefail

DEBUG_PORT="${ARGUS_CHROME_DEBUG_PORT:-9223}"
BROWSER_URL="${ARGUS_CHROME_BROWSER_URL:-http://127.0.0.1:${DEBUG_PORT}}"
PROFILE_DIR="${ARGUS_CHROME_USER_DATA_DIR:-$HOME/.chrome-devtools-mcp-profile}"

if curl -fsS "${BROWSER_URL}/json/version" >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$PROFILE_DIR"

open -na "Google Chrome" --args \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$DEBUG_PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  about:blank >/dev/null

for _ in $(seq 1 60); do
  if curl -fsS "${BROWSER_URL}/json/version" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "Chrome DevTools endpoint did not become ready at ${BROWSER_URL}" >&2
exit 1
