#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$SCRIPT_DIR/../.." && pwd)"
hardening_sql="$repo_dir/scripts/db/portal-hardening.sql"
audit_sql="$repo_dir/scripts/db/audit-portal-ownership.sql"

external_role="${PORTAL_EXTERNAL_ROLE:-portal_dev_external}"

if [[ ! "$external_role" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid external role name: $external_role" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed." >&2
  exit 1
fi

psql_cmd=(psql)
if [[ -n "${PORTAL_ADMIN_DATABASE_URL:-}" ]]; then
  psql_cmd+=("${PORTAL_ADMIN_DATABASE_URL}")
else
  psql_cmd+=(-d "${PORTAL_DB_NAME:-portal_db}")
fi

echo "Applying portal schema hardening (external_role=$external_role)..."
"${psql_cmd[@]}" \
  -v external_role="$external_role" \
  -f "$hardening_sql"

echo "Running portal ownership audit..."
mismatches="$(
  "${psql_cmd[@]}" \
    -qAt \
    -f "$audit_sql"
)"

if [[ -n "$mismatches" ]]; then
  echo "Portal ownership audit failed after hardening:" >&2
  printf '%s\n' "$mismatches" >&2
  exit 1
fi

echo "Portal schema hardening applied successfully."
