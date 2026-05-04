#!/usr/bin/env bash
set -euo pipefail

ROOT="${CODEX_WORKTREE_PATH:?CODEX_WORKTREE_PATH is required}"
SOURCE_ROOT="${CODEX_SOURCE_TREE_PATH:?CODEX_SOURCE_TREE_PATH is required}"
RUNTIME_DIR="$ROOT/.codex/generated/runtime"

mkdir -p "$RUNTIME_DIR"

start_process() {
  local name="$1"
  shift

  local pid_file="$RUNTIME_DIR/$name.pid"
  local log_file="$RUNTIME_DIR/$name.log"

  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "$name already running"
      return
    fi
    rm -f "$pid_file"
  fi

  nohup bash -lc '
    export CODEX_WORKTREE_PATH="$1"
    export CODEX_SOURCE_TREE_PATH="$2"
    export CODEX_SKIP_GIT_PULL=1
    shift 2
    exec "$@"
  ' bash "$ROOT" "$SOURCE_ROOT" "$@" >"$log_file" 2>&1 < /dev/null &
  echo "$!" > "$pid_file"
  echo "started $name"
}

start_process sso "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" sso
start_process talos "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" talos
start_process website "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" website
start_process atlas "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" atlas
start_process xplan "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" xplan
start_process kairos "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" kairos
start_process kairos-ml "$SOURCE_ROOT/.codex/scripts/run-kairos-ml.sh"
start_process plutus "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" plutus
start_process hermes "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" hermes
start_process argus "$SOURCE_ROOT/.codex/scripts/run-worktree-app.sh" argus
