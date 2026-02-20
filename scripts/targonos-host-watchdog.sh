#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

log() {
  printf '%s %s\n' "$(date -Is)" "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_brew_services_started() {
  if ! require_cmd brew; then
    log "brew not found; skipping brew services check"
    return 0
  fi

  local services_csv="${TARGONOS_BREW_SERVICES_CSV:-nginx,redis,cloudflared,pgbouncer,postgresql@14}"
  local IFS=,
  local svc status
  for svc in $services_csv; do
    status="$(brew services list | awk -v s="$svc" '$1==s {print $2; exit}' || true)"
    if [[ "$status" != "started" ]]; then
      log "starting brew service: ${svc} (current: ${status:-missing})"
      brew services start "$svc"
    fi
  done
}

ensure_pm2_alive() {
  if ! require_cmd pm2; then
    log "pm2 not found"
    exit 1
  fi

  if ! pm2 ping >/dev/null 2>&1; then
    log "pm2 not responding; resurrecting"
    pm2 resurrect >/dev/null
  fi
}

pm2_describe_field() {
  local pm_name="$1"
  local field="$2"
  pm2 describe "$pm_name" 2>/dev/null | awk -F'│' -v f="$field" '$2 ~ (" " f " ") {gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3; exit}'
}

maybe_build_next_app_if_missing() {
  local pm_name="$1"
  local cwd="$2"

  if [[ -z "$cwd" || ! -f "$cwd/package.json" ]]; then
    return 0
  fi

  local uses_next
  uses_next="$(PKG_JSON="$cwd/package.json" node -e "const p=require(process.env.PKG_JSON); const deps={...(p.dependencies||{}),...(p.devDependencies||{})}; process.stdout.write(String(Boolean(deps.next)));")"
  if [[ "$uses_next" != "true" ]]; then
    return 0
  fi

  if [[ -f "$cwd/.next/BUILD_ID" ]]; then
    return 0
  fi

  local pkg_name repo_root
  pkg_name="$(PKG_JSON="$cwd/package.json" node -e "console.log(require(process.env.PKG_JSON).name)")"
  repo_root="$(dirname "$(dirname "$cwd")")"

  log "missing build for ${pm_name} (${pkg_name}); running pnpm build"
  pnpm -C "$repo_root" --filter "$pkg_name" build
}

ensure_pm2_processes_healthy() {
  local processes_csv="${TARGONOS_PM2_PROCESSES_CSV:-main-targonos,main-talos,main-website,main-atlas,main-xplan,main-kairos,main-kairos-ml,main-plutus,main-hermes,main-argus,dev-targonos,dev-talos,dev-website,dev-atlas,dev-xplan,dev-kairos,dev-kairos-ml,dev-plutus,dev-hermes,dev-argus}"
  local IFS=,
  local pm_name
  for pm_name in $processes_csv; do
    local status cwd
    status="$(pm2_describe_field "$pm_name" "status")"
    cwd="$(pm2_describe_field "$pm_name" "exec cwd")"

    if [[ -z "$status" || -z "$cwd" ]]; then
      log "pm2 missing process: ${pm_name}"
      continue
    fi

    if [[ "$status" != "online" ]]; then
      maybe_build_next_app_if_missing "$pm_name" "$cwd"
      log "pm2 restarting: ${pm_name} (status: ${status})"
      pm2 restart "$pm_name" --update-env
    fi
  done
}

check_http_not_502() {
  local url="$1"
  local code rc
  set +e
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$url")"
  rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    log "unhealthy: ${url} (curl rc=${rc})"
    return 1
  fi

  if [[ "$code" == "502" ]]; then
    log "unhealthy: ${url} (502)"
    return 1
  fi

  return 0
}

check_nginx_routes() {
  check_http_not_502 "http://127.0.0.1:8080/" || exit 1
  check_http_not_502 "http://127.0.0.1:8081/" || exit 1

  local base p
  for base in "http://127.0.0.1:8080" "http://127.0.0.1:8081"; do
    for p in "/talos/" "/xplan/" "/atlas/" "/kairos/" "/plutus/" "/hermes/" "/argus/"; do
      check_http_not_502 "${base}${p}" || exit 1
    done
  done
}

main() {
  ensure_brew_services_started
  ensure_pm2_alive
  ensure_pm2_processes_healthy
  check_nginx_routes
}

main "$@"
