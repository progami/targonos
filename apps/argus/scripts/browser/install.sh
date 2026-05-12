#!/bin/bash
# Backward-compatible entrypoint for the unified Argus runner LaunchAgent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_INSTALL="$SCRIPT_DIR/../runner/install.sh"

UNINSTALL="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --market)
      if [ "$#" -lt 2 ]; then
        echo "--market requires us or uk." >&2
        exit 1
      fi
      case "$2" in
        us|uk)
          ;;
        *)
          echo "Unsupported market: $2" >&2
          exit 1
          ;;
      esac
      shift
      ;;
    --uninstall)
      UNINSTALL="true"
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$UNINSTALL" = "true" ]; then
  exec /bin/bash "$RUNNER_INSTALL" --uninstall
fi

exec /bin/bash "$RUNNER_INSTALL"
