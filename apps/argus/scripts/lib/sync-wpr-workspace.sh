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
NODE_BIN="$(command -v node)"
export PYTHON_BIN
export NODE_BIN

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
if [[ "$WPR_DATA_DIR" == *"/Library/CloudStorage/"* ]]; then
  echo "$WPR_DATA_ENV_NAME must be local, not a Google Drive mount: $WPR_DATA_DIR" >&2
  exit 1
fi
export WPR_DATA_DIR
export ARGUS_MARKET="$MARKET"
mkdir -p "$WPR_DATA_DIR"
WPR_WORKSPACE="$(cd "$(dirname "$WPR_DATA_DIR")" && pwd)"
REBUILD_SCRIPT="$REPO_ROOT/apps/argus/scripts/wpr/rebuild_wpr.py"
BUILD_SCRIPT="$REPO_ROOT/apps/argus/scripts/wpr/build_intent_cluster_dashboard.py"
VALIDATE_SCRIPT="$REPO_ROOT/apps/argus/scripts/wpr/validate_sources.py"
ENQUEUE_WPR_DRIVE_SYNC_SCRIPT="$REPO_ROOT/apps/argus/scripts/lib/enqueue-wpr-drive-sync.mjs"

if [ ! -f "$REBUILD_SCRIPT" ]; then
  echo "Missing rebuild script: $REBUILD_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$VALIDATE_SCRIPT" ]; then
  echo "Missing source validation script: $VALIDATE_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$BUILD_SCRIPT" ]; then
  echo "Missing dashboard build script: $BUILD_SCRIPT" >&2
  exit 1
fi

if [ ! -f "$ENQUEUE_WPR_DRIVE_SYNC_SCRIPT" ]; then
  echo "Missing WPR Drive sync enqueue script: $ENQUEUE_WPR_DRIVE_SYNC_SCRIPT" >&2
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync starting (market=$MARKET, trigger=$TRIGGER)"
echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace: $WPR_WORKSPACE"

"$PYTHON_BIN" "$VALIDATE_SCRIPT"
"$PYTHON_BIN" "$REBUILD_SCRIPT"
"$PYTHON_BIN" "$BUILD_SCRIPT"
"$NODE_BIN" "$ENQUEUE_WPR_DRIVE_SYNC_SCRIPT" --market "$MARKET"

echo "$(date '+%Y-%m-%d %H:%M:%S') — WPR workspace sync completed"
