#!/bin/bash

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
LOCK_FILE="/tmp/argus-wpr-workspace.lock"

if [ "$#" -eq 0 ]; then
  exec /usr/bin/lockf "$LOCK_FILE" /bin/bash "$SCRIPT_PATH" --locked
fi

if [ "$1" != "--locked" ]; then
  exec /usr/bin/lockf "$LOCK_FILE" /bin/bash "$SCRIPT_PATH" --locked "$@"
fi
shift

TRIGGER="manual"
MARKET="us"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --trigger)
      if [ "$#" -lt 2 ]; then
        echo "--trigger requires a value." >&2
        exit 1
      fi
      TRIGGER="$2"
      shift
      ;;
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

PYTHON_BIN="$(command -v python3)"
export PYTHON_BIN

source "$(cd "$(dirname "$0")/../browser" && pwd)/common.sh"
load_monitoring_env

case "$MARKET" in
  us)
    WPR_DATA_ENV_NAME="WPR_DATA_DIR_US"
    ;;
  uk)
    WPR_DATA_ENV_NAME="WPR_DATA_DIR_UK"
    ;;
  *)
    echo "Unsupported market: $MARKET" >&2
    exit 1
    ;;
esac

WPR_DATA_DIR="$(require_env "$WPR_DATA_ENV_NAME")"
export WPR_DATA_DIR
export ARGUS_MARKET="$MARKET"
WPR_WORKSPACE="$(cd "$(dirname "$WPR_DATA_DIR")" && pwd)"
REBUILD_SCRIPT="$REPO_ROOT/apps/argus/scripts/wpr/rebuild_wpr.py"
BUILD_SCRIPT="$REPO_ROOT/apps/argus/scripts/wpr/build_intent_cluster_dashboard.py"

if [ ! -f "$REBUILD_SCRIPT" ]; then
  echo "Missing rebuild script: $REBUILD_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$BUILD_SCRIPT" ]; then
  echo "Missing dashboard build script: $BUILD_SCRIPT" >&2
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync starting (market=$MARKET, trigger=$TRIGGER)"
echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace: $WPR_WORKSPACE"

"$PYTHON_BIN" "$REBUILD_SCRIPT"
"$PYTHON_BIN" "$BUILD_SCRIPT"

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync completed"
