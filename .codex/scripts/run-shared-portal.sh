#!/usr/bin/env bash
set -euo pipefail

ROOT="${CODEX_WORKTREE_PATH:?CODEX_WORKTREE_PATH is required}"
ENV_FILE="$ROOT/.codex/generated/ports.env"

sync_worktree() {
  if git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
    git -C "$ROOT" pull --ff-only
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing generated port file: $ENV_FILE" >&2
  exit 1
fi

set -a
. "$ENV_FILE"
set +a

sync_worktree

exec open "$SHARED_PORTAL_ORIGIN"
