#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/talos-db-common.sh"

expected_owner="${TALOS_OWNER_ROLE:-portal_talos}"
external_role="${TALOS_EXTERNAL_ROLE:-portal_dev_external}"

if [[ ! "$external_role" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid external role name: $external_role" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed." >&2
  exit 1
fi

if ! load_talos_env_if_needed; then
  echo "Unable to resolve Talos DB environment variables for TALOS_ENV_MODE (default local)." >&2
  exit 1
fi

if ! database_url="$(resolve_talos_database_url)"; then
  echo "No Talos database URL found. Set TALOS_ADMIN_DATABASE_URL or DATABASE_URL_US/DATABASE_URL_UK/DATABASE_URL." >&2
  exit 1
fi

repo_dir="$(talos_repo_dir)"
audit_sql="$repo_dir/scripts/db/audit-talos-ownership.sql"

mismatches="$(
  psql "$database_url" \
    -v expected_owner="$expected_owner" \
    -qAt \
    -f "$audit_sql"
)"

if [[ -n "$mismatches" ]]; then
  echo "Talos ownership audit failed (expected_owner=$expected_owner):" >&2
  printf '%s\n' "$mismatches" >&2
  exit 1
fi

privilege_issues="$(
  psql "$database_url" \
    -qAt \
    -c "
      WITH schemas AS (
        SELECT unnest(ARRAY['dev_talos_us', 'dev_talos_uk', 'main_talos_us', 'main_talos_uk']) AS schema_name
      ),
      issues AS (
        SELECT 'role_superuser=' || r.rolname AS issue
        FROM pg_roles r
        WHERE r.rolname = '${external_role}' AND r.rolsuper
        UNION ALL
        SELECT 'role_db_create=' || '${external_role}' AS issue
        WHERE has_database_privilege('${external_role}', current_database(), 'CREATE')
        UNION ALL
        SELECT 'role_schema_create=' || '${external_role}' || ' schema=' || s.schema_name AS issue
        FROM schemas s
        WHERE has_schema_privilege('${external_role}', s.schema_name, 'CREATE')
      )
      SELECT issue FROM issues;
    "
)"

if [[ -n "$privilege_issues" ]]; then
  echo "Talos role privilege audit failed (external_role=$external_role):" >&2
  printf '%s\n' "$privilege_issues" >&2
  exit 1
fi

echo "Talos ownership + privilege audit passed (expected_owner=$expected_owner external_role=$external_role)."
