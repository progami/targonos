#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
MARKET="us"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --market)
      if [ "$#" -lt 2 ]; then
        echo "--market requires us or uk." >&2
        exit 1
      fi
      MARKET="$2"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

case "$MARKET" in
  us|uk)
    export ARGUS_MARKET="$MARKET"
    ;;
  *)
    echo "Unsupported market: $MARKET" >&2
    exit 1
    ;;
esac

if ! NODE_BIN="$(command -v node)"; then
  if [ "$MARKET" = "us" ]; then
    LOG="/tmp/daily-visuals.log"
  else
    LOG="/tmp/daily-visuals-$MARKET.log"
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') — ABORT: Node.js not found in PATH=$PATH" >> "$LOG"
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/collect.mjs" --market "$MARKET"
