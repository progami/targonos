#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--yes-wipe-dev" ]]; then
  echo "Refusing to run without explicit confirmation." >&2
  echo "This will DROP and recreate the dev schemas in your local DEV DB by copying from the MAIN DB." >&2
  echo "" >&2
  echo "Usage:" >&2
  echo "  scripts/db/refresh-dev-from-main.sh --yes-wipe-dev" >&2
  exit 1
fi

DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
MAIN_DB_NAME="${PORTAL_MAIN_DB_NAME:-portal_db}"
DEV_DB_NAME="${PORTAL_DEV_DB_NAME:-portal_db_dev}"
DEV_DB_ROLE="${PORTAL_DEV_DB_ROLE:-portal_dev_external}"
PORTAL_TALOS_ROLE="${PORTAL_TALOS_ROLE:-portal_talos}"

rewrite_script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rewrite-pgdump-schema.mjs"

log() { printf '\e[36m[refresh-dev]\e[0m %s\n' "$*"; }

grant_schema_access_sql() {
  local schema="$1"
  local role="$2"

  cat <<SQL
GRANT USAGE, CREATE ON SCHEMA "$schema" TO $role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "$schema" TO $role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "$schema" TO $role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "$schema" TO $role;
SQL
}

refuse_if_unsafe_target() {
  if [[ "$DEV_DB_NAME" == "$MAIN_DB_NAME" ]]; then
    echo "Refusing to run: PORTAL_DEV_DB_NAME matches PORTAL_MAIN_DB_NAME ($DEV_DB_NAME)" >&2
    exit 1
  fi

  if [[ "$DEV_DB_NAME" != *dev* ]]; then
    echo "Refusing to run: PORTAL_DEV_DB_NAME must include \"dev\" (got: $DEV_DB_NAME)" >&2
    exit 1
  fi
}

ensure_dev_database() {
  refuse_if_unsafe_target

  log "Ensure dev database exists: $DEV_DB_NAME"
  if ! psql -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 -qtAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DEV_DB_NAME' LIMIT 1" | grep -q 1; then
    log "Create database: $DEV_DB_NAME"
    psql -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DEV_DB_NAME\";"
  fi

  # Needed for Talos migrations (gen_random_uuid()).
  psql -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB_NAME" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

  # Ensure the dev app role can connect.
  psql -h "$DB_HOST" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE \"$DEV_DB_NAME\" TO $DEV_DB_ROLE;"
}

cleanup_portal_talos_access() {
  local schema="$1"

  psql -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB_NAME" -v ON_ERROR_STOP=1 \
    -v deprecated_role="$PORTAL_TALOS_ROLE" \
    -v target_schema="$schema" <<'SQL'
DO $$
DECLARE
  deprecated_role text := :'deprecated_role';
  target_schema text := :'target_schema';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = deprecated_role) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = target_schema) THEN
    RETURN;
  END IF;

  EXECUTE format('REVOKE USAGE, CREATE ON SCHEMA %I FROM %I', target_schema, deprecated_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', target_schema, deprecated_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', target_schema, deprecated_role);
  EXECUTE format('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM %I', target_schema, deprecated_role);
END
$$;
SQL
}

clone_schema() {
  local from_schema="$1"
  local to_schema="$2"

  log "Clone ${MAIN_DB_NAME}.${from_schema} -> ${DEV_DB_NAME}.${to_schema}"
  psql -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB_NAME" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS \"$to_schema\" CASCADE;"

  pg_dump -h "$DB_HOST" -p "$DB_PORT" -d "$MAIN_DB_NAME" -n "$from_schema" --no-owner --no-privileges \
    | node "$rewrite_script" "$from_schema" "$to_schema" \
    | psql -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB_NAME" -v ON_ERROR_STOP=1

  # Restores are run as the local OS user, so re-grant schema/object privileges back to app DB roles.
  local grant_roles=("$DEV_DB_ROLE")
  case "$to_schema" in
    auth_dev)
      grant_roles+=("portal_auth")
      ;;
    dev_atlas)
      grant_roles+=("portal_atlas")
      ;;
    dev_xplan)
      grant_roles+=("portal_xplan")
      ;;
    dev_talos_us|dev_talos_uk)
      grant_roles+=("portal_talos")
      ;;
    plutus_dev)
      grant_roles+=("portal_plutus")
      ;;
  esac

  log "Grant privileges on schema $to_schema -> ${grant_roles[*]}"
  psql -h "$DB_HOST" -p "$DB_PORT" -d "$DEV_DB_NAME" -v ON_ERROR_STOP=1 <<SQL
$(for role in "${grant_roles[@]}"; do grant_schema_access_sql "$to_schema" "$role"; done)
SQL

  cleanup_portal_talos_access "$to_schema"
}

ensure_dev_database

clone_schema "main_talos_us" "dev_talos_us"
clone_schema "main_talos_uk" "dev_talos_uk"
clone_schema "atlas" "dev_atlas"
clone_schema "xplan" "dev_xplan"
clone_schema "kairos" "kairos"
clone_schema "auth" "auth_dev"
clone_schema "plutus" "plutus_dev"
clone_schema "main_argus" "argus_dev"
clone_schema "main_hermes" "dev_hermes"

log "Done"
