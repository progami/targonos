#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: refresh-dev-app.sh <app-key>" >&2
  echo "Known apps: talos, sso, website, xplan, atlas, kairos, plutus, hermes" >&2
  exit 1
fi

app_key="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$app_key" in
  talos)
    workspace="@targon/talos"
    app_dir="$repo_root/apps/talos"
    pm2_name="dev-talos"
    ;;
  sso|targon)
    workspace="@targon/sso"
    app_dir="$repo_root/apps/sso"
    pm2_name="dev-targonos"
    ;;
  website)
    workspace="@targon/website"
    app_dir="$repo_root/apps/website"
    pm2_name="dev-website"
    ;;
  xplan)
    workspace="@targon/xplan"
    app_dir="$repo_root/apps/xplan"
    pm2_name="dev-xplan"
    ;;
  kairos)
    workspace="@targon/kairos"
    app_dir="$repo_root/apps/kairos"
    pm2_name="dev-kairos"
    ;;
  atlas)
    workspace="@targon/atlas"
    app_dir="$repo_root/apps/atlas"
    pm2_name="dev-atlas"
    ;;
  plutus)
    workspace="@targon/plutus"
    app_dir="$repo_root/apps/plutus"
    pm2_name="dev-plutus"
    ;;
  hermes)
    workspace="@targon/hermes"
    app_dir="$repo_root/apps/hermes"
    pm2_name="dev-hermes"
    ;;
  *)
    echo "Unknown app key: $app_key" >&2
    exit 1
    ;;
 esac

log() { printf '\e[36m[refresh-%s]\e[0m %s\n' "$app_key" "$*"; }
warn() { printf '\e[33m[refresh-%s]\e[0m %s\n' "$app_key" "$*"; }

log "Stopping $pm2_name if running"
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop "$pm2_name" >/dev/null 2>&1 || warn "$pm2_name was not running"
else
  warn "pm2 not available; skipping stop"
fi

log "Cleaning build caches"
if command -v pnpm >/dev/null 2>&1; then
  pnpm --filter "$workspace" clean >/dev/null 2>&1 || warn "pnpm clean failed; continuing"
else
  warn "pnpm not available; skipping pnpm clean"
fi
rm -rf "$app_dir/.next" "$app_dir/.turbo" "$app_dir/.cache" "$app_dir/.swc" "$app_dir/.servenext" "$app_dir/.parcel-cache" 2>/dev/null || true

log "Restarting $pm2_name"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 start "$pm2_name" --update-env >/dev/null 2>&1; then
    log "$pm2_name started"
  elif pm2 restart "$pm2_name" --update-env >/dev/null 2>&1; then
    log "$pm2_name restarted"
  else
    warn "Could not start $pm2_name; check PM2 config"
  fi
else
  warn "pm2 not available; start $pm2_name manually"
fi

log "Done"
