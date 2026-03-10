#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') — ABORT: Node.js not found in PATH=$PATH" >> /tmp/daily-visuals.log
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/collect.mjs"
