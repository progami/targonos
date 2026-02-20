#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$SCRIPT_DIR/../.." && pwd)"
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

mismatches="$(
  "${psql_cmd[@]}" \
    -qAt \
    -f "$audit_sql"
)"

if [[ -n "$mismatches" ]]; then
  echo "Portal schema ownership audit failed:" >&2
  printf '%s\n' "$mismatches" >&2
  exit 1
fi

privilege_issues="$(
  "${psql_cmd[@]}" \
    -qAt \
    -c "
      WITH schemas AS (
        SELECT unnest(ARRAY[
          'auth',
          'auth_dev',
          'atlas',
          'dev_atlas',
          'xplan',
          'xplan_dev',
          'dev_xplan',
          'kairos',
          'chronos',
          'plutus',
          'plutus_dev',
          'dev_talos_us',
          'dev_talos_uk',
          'main_talos_us',
          'main_talos_uk',
          'dev_hermes',
          'main_hermes',
          'dev_argus',
          'argus_dev',
          'main_argus'
        ]) AS schema_name
      ),
      active_schemas AS (
        SELECT n.oid AS schema_oid, s.schema_name
        FROM schemas s
        JOIN pg_namespace n ON n.nspname = s.schema_name
      ),
      issues AS (
        SELECT 'role_superuser=' || r.rolname AS issue
        FROM pg_roles r
        WHERE r.rolname = '${external_role}' AND r.rolsuper
        UNION ALL
        SELECT 'role_db_create=' || '${external_role}' AS issue
        WHERE has_database_privilege('${external_role}', current_database(), 'CREATE')
        UNION ALL
        SELECT 'role_public_create=' || '${external_role}' AS issue
        WHERE has_schema_privilege('${external_role}', 'public', 'CREATE')
        UNION ALL
        SELECT 'role_schema_create=' || '${external_role}' || ' schema=' || a.schema_name AS issue
        FROM active_schemas a
        WHERE has_schema_privilege('${external_role}', a.schema_oid, 'CREATE')
      )
      SELECT issue FROM issues;
    "
)"

if [[ -n "$privilege_issues" ]]; then
  echo "Portal role privilege audit failed (external_role=$external_role):" >&2
  printf '%s\n' "$privilege_issues" >&2
  exit 1
fi

echo "Portal ownership + privilege audit passed (external_role=$external_role)."
