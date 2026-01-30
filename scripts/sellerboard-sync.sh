#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[sellerboard-sync] %s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TARGONOS_REPO_DIR:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"

BASE_URL="${SELLERBOARD_SYNC_BASE_URL:-http://localhost:3008/xplan/api/v1/xplan/sellerboard}"
ENV_FILE="${SELLERBOARD_SYNC_ENV_FILE:-${REPO_ROOT}/apps/xplan/.env.local}"

PSQL_BIN="${PSQL_BIN:-}"
if [[ -z "${PSQL_BIN}" ]]; then
  if command -v psql >/dev/null 2>&1; then
    PSQL_BIN="$(command -v psql)"
  elif [[ -x "/opt/homebrew/bin/psql" ]]; then
    PSQL_BIN="/opt/homebrew/bin/psql"
  elif [[ -x "/usr/local/bin/psql" ]]; then
    PSQL_BIN="/usr/local/bin/psql"
  else
    log "Missing psql in PATH. Set PSQL_BIN=/path/to/psql"
    exit 1
  fi
fi

read_env_var() {
  local key="$1"
  local value

  value="$(grep -E "^${key}=" "$ENV_FILE" | head -n 1 | sed -E "s/^${key}=//")"
  value="${value%$'\r'}"

  if [[ -z "$value" ]]; then
    log "Missing ${key} in ${ENV_FILE}"
    exit 1
  fi

  if [[ "${value}" == "\""*"\"" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "${value}" == "'"*"'" ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "Missing env file: ${ENV_FILE}"
  exit 1
fi

if [[ ! -x "$PSQL_BIN" ]]; then
  log "psql is not executable at: ${PSQL_BIN}"
  exit 1
fi

SELLERBOARD_SYNC_TOKEN="$(read_env_var "SELLERBOARD_SYNC_TOKEN")"
DATABASE_URL="$(read_env_var "DATABASE_URL")"

read -r PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSCHEMA <<EOF_PG
$(DATABASE_URL="$DATABASE_URL" /usr/bin/python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse, parse_qs, unquote

raw = os.environ.get("DATABASE_URL", "")
if not raw:
    sys.exit(1)

try:
    url = urlparse(raw)
except Exception:
    sys.exit(1)

schema = (parse_qs(url.query).get("schema", [""])[0] or "").strip()
host = url.hostname or "localhost"
port = str(url.port or 5432)
user = unquote(url.username or "")
password = unquote(url.password or "")
database = (url.path or "").lstrip("/") or "postgres"

if not user or not password or not database or not schema:
    sys.exit(1)

sys.stdout.write(" ".join([host, port, user, password, database, schema]))
PY
)
EOF_PG

if [[ ! "$PGSCHEMA" =~ ^[a-zA-Z0-9_]+$ ]]; then
  log "Invalid schema name from DATABASE_URL: ${PGSCHEMA}"
  exit 1
fi

export PGPASSWORD

us_strategy_id="$("$PSQL_BIN" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -At -v ON_ERROR_STOP=1 -c "select id from \"${PGSCHEMA}\".\"Strategy\" where region='US' order by \"createdAt\" desc limit 1;")"
uk_strategy_id="$("$PSQL_BIN" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -At -v ON_ERROR_STOP=1 -c "select id from \"${PGSCHEMA}\".\"Strategy\" where region='UK' order by \"createdAt\" desc limit 1;")"

if [[ -z "$us_strategy_id" || -z "$uk_strategy_id" ]]; then
  log "Missing strategy IDs (US='${us_strategy_id}', UK='${uk_strategy_id}')"
  exit 1
fi

request() {
  local url="$1"
  local label="$2"
  local tmp
  tmp="$(mktemp)"

  log "POST ${label}"
  local status
  status="$(/usr/bin/curl -sS -X POST "$url" -H "Authorization: Bearer ${SELLERBOARD_SYNC_TOKEN}" -o "$tmp" -w "%{http_code}")"

  if [[ "$status" != "200" ]]; then
    log "FAILED ${label} (HTTP ${status})"
    cat "$tmp"
    rm -f "$tmp"
    exit 1
  fi

  rm -f "$tmp"
  log "OK ${label}"
}

request "${BASE_URL}/us-actual-sales?strategyId=${us_strategy_id}" "US actual sales"
request "${BASE_URL}/us-dashboard?strategyId=${us_strategy_id}" "US dashboard"
request "${BASE_URL}/uk-actual-sales?strategyId=${uk_strategy_id}" "UK actual sales"
request "${BASE_URL}/uk-dashboard?strategyId=${uk_strategy_id}" "UK dashboard"

log "Done"
