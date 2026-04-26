#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/talos-db-common.sh"

owner_role="${TALOS_OWNER_ROLE:-portal_talos}"
external_role="${TALOS_EXTERNAL_ROLE:-portal_dev_external}"

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
hardening_sql="$repo_dir/scripts/db/talos-hardening.sql"
audit_sql="$repo_dir/scripts/db/audit-talos-ownership.sql"

echo "Applying Talos DB hardening (owner=$owner_role external=$external_role)..."
psql "$database_url" \
  -v owner_role="$owner_role" \
  -v external_role="$external_role" \
  -f "$hardening_sql"

echo "Running ownership audit..."
mismatches="$(
  psql "$database_url" \
    -v expected_owner="$owner_role" \
    -qAt \
    -f "$audit_sql"
)"

if [[ -n "$mismatches" ]]; then
  echo "Ownership audit failed after hardening:" >&2
  printf '%s\n' "$mismatches" >&2
  exit 1
fi

echo "Talos DB hardening applied successfully."
