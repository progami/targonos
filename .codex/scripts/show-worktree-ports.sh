#!/usr/bin/env bash
set -euo pipefail

ROOT="${CODEX_WORKTREE_PATH:?CODEX_WORKTREE_PATH is required}"
ENV_FILE="$ROOT/.codex/generated/ports.env"
MAP_FILE="$ROOT/.codex/generated/dev.worktree.apps.json"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing generated port file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$MAP_FILE" ]; then
  echo "Missing generated app map: $MAP_FILE" >&2
  exit 1
fi

cat "$ENV_FILE"
printf '\n'
cat "$MAP_FILE"
