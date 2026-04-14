#!/bin/bash

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
LOCK_FILE="/tmp/argus-wpr-workspace.lock"

if [ "${1:-}" != "--locked" ]; then
  exec /usr/bin/lockf "$LOCK_FILE" /bin/bash "$SCRIPT_PATH" --locked "$@"
fi
shift

TRIGGER="manual"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --trigger)
      TRIGGER="${2:-}"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

PYTHON_BIN="$(command -v python3)"
export PYTHON_BIN

source "$(cd "$(dirname "$0")/../browser" && pwd)/common.sh"
load_monitoring_env

WPR_DATA_DIR="$(require_env WPR_DATA_DIR)"
WPR_WORKSPACE="$(cd "$(dirname "$WPR_DATA_DIR")" && pwd)"
REBUILD_SCRIPT="$WPR_WORKSPACE/rebuild_wpr.py"
BUILD_SCRIPT="$WPR_WORKSPACE/build_intent_cluster_dashboard.py"

if [ ! -f "$REBUILD_SCRIPT" ]; then
  echo "Missing rebuild script: $REBUILD_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$BUILD_SCRIPT" ]; then
  echo "Missing dashboard build script: $BUILD_SCRIPT" >&2
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync starting (trigger=$TRIGGER)"
echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace: $WPR_WORKSPACE"

"$PYTHON_BIN" "$REBUILD_SCRIPT"
"$PYTHON_BIN" "$BUILD_SCRIPT"

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync completed"
