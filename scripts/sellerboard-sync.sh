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
$(DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const raw = process.env.DATABASE_URL;
if (!raw) process.exit(1);

let url;
try {
  url = new URL(raw);
} catch {
  process.exit(1);
}

const schema = (url.searchParams.get('schema') || '').trim();
const host = url.hostname || 'localhost';
const port = url.port || '5432';
const user = decodeURIComponent(url.username || '');
const password = decodeURIComponent(url.password || '');
const database = (url.pathname || '').replace(/^\//, '') || 'postgres';

if (!user || !password || !database || !schema) process.exit(1);
process.stdout.write([host, port, user, password, database, schema].join(' '));
NODE
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
