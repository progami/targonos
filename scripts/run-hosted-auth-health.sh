#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_environment="${1:?Usage: scripts/run-hosted-auth-health.sh <dev|main>}"

case "$target_environment" in
  dev)
    portal_base_url="https://dev-os.targonglobal.com"
    pm2_process_name="dev-targonos"
    ;;
  main)
    portal_base_url="https://os.targonglobal.com"
    pm2_process_name="main-targonos"
    ;;
  *)
    printf 'Unsupported hosted auth health environment: %s\n' "$target_environment" >&2
    exit 1
    ;;
esac

cd "$repo_root"

pm2_runtime_json="$(pm2 jlist)"
nextauth_secret="$(
  printf '%s' "$pm2_runtime_json" | node -e 'const fs=require("fs"); const processes=JSON.parse(fs.readFileSync(0,"utf8")); const app=processes.find((entry)=>entry.name===process.argv[1]); if (!app) { throw new Error(process.argv[1] + " pm2 process not found"); } const secret=app.pm2_env?.NEXTAUTH_SECRET; if (typeof secret !== "string" || secret.trim() === "") { throw new Error(process.argv[1] + " NEXTAUTH_SECRET is missing"); } process.stdout.write(secret.trim());' "$pm2_process_name"
)"
portal_db_url="$(
  printf '%s' "$pm2_runtime_json" | node -e 'const fs=require("fs"); const processes=JSON.parse(fs.readFileSync(0,"utf8")); const app=processes.find((entry)=>entry.name===process.argv[1]); if (!app) { throw new Error(process.argv[1] + " pm2 process not found"); } const value=app.pm2_env?.PORTAL_DB_URL; if (typeof value !== "string" || value.trim() === "") { throw new Error(process.argv[1] + " PORTAL_DB_URL is missing"); } process.stdout.write(value.trim());' "$pm2_process_name"
)"

export NEXTAUTH_SECRET="$nextauth_secret"
export PORTAL_DB_URL="$portal_db_url"
export PORTAL_BASE_URL="$portal_base_url"
export E2E_PORTAL_USER_ID="user-jarrar"
export E2E_PORTAL_EMAIL="jarrar@targonglobal.com"
export E2E_PORTAL_NAME="Jarrar Amjad"
export E2E_ACTIVE_TENANT="US"

pnpm exec tsx apps/sso/scripts/ensure-hosted-smoke-user.ts
pnpm --filter @targon/sso test:hosted-smoke
