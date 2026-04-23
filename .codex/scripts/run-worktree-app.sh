#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: run-worktree-app.sh <app>" >&2
  exit 1
fi

ROOT="${CODEX_WORKTREE_PATH:?CODEX_WORKTREE_PATH is required}"
ENV_FILE="$ROOT/.codex/generated/ports.env"
APP_ID="$1"

sync_worktree() {
  if [ "${CODEX_SKIP_GIT_PULL:-0}" = "1" ]; then
    return
  fi

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

PORTAL_ORIGIN="$SHARED_PORTAL_ORIGIN"

export COOKIE_DOMAIN="localhost"
export HOST="0.0.0.0"
export PORTAL_AUTH_URL="$PORTAL_ORIGIN"
export NEXT_PUBLIC_PORTAL_AUTH_URL="$PORTAL_ORIGIN"
export AUTH_TRUST_HOST="true"

case "$APP_ID" in
  sso)
    export PORT="$PORT_SSO"
    export NEXTAUTH_URL="$PORTAL_ORIGIN"
    export NEXT_PUBLIC_APP_URL="$PORTAL_ORIGIN"
    cd "$ROOT/apps/sso"
    exec node ../../scripts/run-dev-with-logs.js sso -- pnpm exec next dev -p "$PORT_SSO"
    ;;
  talos)
    export PORT="$PORT_TALOS"
    export BASE_PATH="/talos"
    export NEXT_PUBLIC_BASE_PATH="/talos"
    export NEXTAUTH_URL="http://localhost:${PORT_TALOS}/talos"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_TALOS}/talos"
    export CSRF_ALLOWED_ORIGINS="${PORTAL_ORIGIN},http://localhost:${PORT_TALOS}"
    cd "$ROOT/apps/talos"
    exec node ../../scripts/run-dev-with-logs.js talos -- pnpm exec next dev -p "$PORT_TALOS"
    ;;
  website)
    export PORT="$PORT_WEBSITE"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_WEBSITE}"
    cd "$ROOT/apps/website"
    exec node ../../scripts/run-dev-with-logs.js website -- pnpm exec next dev -p "$PORT_WEBSITE"
    ;;
  atlas)
    export PORT="$PORT_ATLAS"
    export BASE_PATH="/atlas"
    export NEXT_PUBLIC_BASE_PATH="/atlas"
    export NEXTAUTH_URL="http://localhost:${PORT_ATLAS}/atlas"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_ATLAS}/atlas"
    cd "$ROOT/apps/atlas"
    exec node ../../scripts/run-dev-with-logs.js atlas -- pnpm exec next dev --webpack -p "$PORT_ATLAS"
    ;;
  xplan)
    export PORT="$PORT_XPLAN"
    export BASE_PATH="/xplan"
    export NEXT_PUBLIC_BASE_PATH="/xplan"
    export NEXTAUTH_URL="http://localhost:${PORT_XPLAN}/xplan"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_XPLAN}/xplan"
    cd "$ROOT/apps/xplan"
    exec pnpm exec next dev -p "$PORT_XPLAN"
    ;;
  kairos)
    export PORT="$PORT_KAIROS"
    export BASE_PATH="/kairos"
    export NEXT_PUBLIC_BASE_PATH="/kairos"
    export NEXTAUTH_URL="http://localhost:${PORT_KAIROS}/kairos"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_KAIROS}/kairos"
    export KAIROS_ML_URL="http://localhost:${PORT_KAIROS_ML}"
    cd "$ROOT/apps/kairos"
    exec pnpm exec next dev -p "$PORT_KAIROS"
    ;;
  plutus)
    export PORT="$PORT_PLUTUS"
    export BASE_PATH="/plutus"
    export NEXT_PUBLIC_BASE_PATH="/plutus"
    export NEXTAUTH_URL="http://localhost:${PORT_PLUTUS}/plutus"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_PLUTUS}/plutus"
    cd "$ROOT/apps/plutus"
    exec node ../../scripts/run-dev-with-logs.js plutus -- pnpm exec next dev -p "$PORT_PLUTUS"
    ;;
  hermes)
    export PORT="$PORT_HERMES"
    export BASE_PATH="/hermes"
    export NEXT_PUBLIC_BASE_PATH="/hermes"
    export NEXTAUTH_URL="http://localhost:${PORT_HERMES}/hermes"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_HERMES}/hermes"
    cd "$ROOT/apps/hermes"
    exec pnpm exec next dev -p "$PORT_HERMES"
    ;;
  argus)
    export PORT="$PORT_ARGUS"
    export BASE_PATH="/argus"
    export NEXT_PUBLIC_BASE_PATH="/argus"
    export NEXTAUTH_URL="http://localhost:${PORT_ARGUS}/argus"
    export NEXT_PUBLIC_APP_URL="http://localhost:${PORT_ARGUS}/argus"
    cd "$ROOT/apps/argus"
    exec node ../../scripts/run-dev-with-logs.js argus -- pnpm exec next dev -p "$PORT_ARGUS"
    ;;
  *)
    echo "Unsupported app: $APP_ID" >&2
    exit 1
    ;;
esac
