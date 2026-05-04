#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${TARGONOS_MAIN_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

log() {
  printf '%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1
}

deploy_in_progress() {
  if ! require_cmd pgrep; then
    return 1
  fi
  pgrep -f "scripts/deploy-app.sh" >/dev/null 2>&1
}

repo_root_from_pm2() {
  local pm_name="$1"
  local cwd
  cwd="$(pm2_describe_field "$pm_name" "exec cwd")"
  if [[ -z "$cwd" ]]; then
    return 1
  fi
  dirname "$(dirname "$cwd")"
}

deploy_lock_present() {
  local repo_root="$1"
  local lock_dir="$repo_root/tmp/deploy-locks"
  if [[ ! -d "$lock_dir" ]]; then
    return 1
  fi
  compgen -G "$lock_dir/*" >/dev/null
}

ensure_brew_services_started() {
  if ! require_cmd brew; then
    log "brew not found; skipping brew services check"
    return 0
  fi

  local services_csv="${TARGONOS_BREW_SERVICES_CSV:-nginx,redis,pgbouncer,postgresql@14}"
  local IFS=,
  local svc status
  for svc in $services_csv; do
    status="$(brew services list | awk -v s="$svc" '$1==s {print $2; exit}')"
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

  if [[ -z "$cwd" ]]; then
    return 0
  fi

  if [[ ! -f "$cwd/package.json" ]]; then
    return 0
  fi

  local uses_next
  uses_next="$(PKG_JSON="$cwd/package.json" node -e "const p=require(process.env.PKG_JSON); const deps={...(p.dependencies ?? {}),...(p.devDependencies ?? {})}; process.stdout.write(String(Boolean(deps.next)));")"
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

    if [[ -z "$status" ]]; then
      log "pm2 missing process: ${pm_name}"
      continue
    fi

    if [[ -z "$cwd" ]]; then
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

check_http_not_5xx() {
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

  if [[ "$code" =~ ^5 ]]; then
    log "unhealthy: ${url} (${code})"
    return 1
  fi

  return 0
}

check_next_build_manifest() {
  local base_url="$1"
  local base_path="$2"
  local pm_name="$3"

  local cwd
  cwd="$(pm2_describe_field "$pm_name" "exec cwd")"
  if [[ -z "$cwd" ]]; then
    log "unhealthy: missing exec cwd for ${pm_name}"
    return 1
  fi

  local build_id_file="$cwd/.next/BUILD_ID"
  if [[ ! -f "$build_id_file" ]]; then
    log "unhealthy: missing BUILD_ID for ${pm_name} (${cwd})"
    return 1
  fi

  local build_id
  build_id="$(cat "$build_id_file")"
  if [[ -z "$build_id" ]]; then
    log "unhealthy: empty BUILD_ID for ${pm_name} (${cwd})"
    return 1
  fi

  local url="${base_url}${base_path}/_next/static/${build_id}/_buildManifest.js"

  local code rc
  set +e
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$url")"
  rc=$?
  set -e

  if [[ $rc -ne 0 ]]; then
    log "unhealthy: ${url} (curl rc=${rc})"
    return 1
  fi

  if [[ "$code" != "200" ]]; then
    log "unhealthy: ${url} (${code})"
    return 1
  fi

  return 0
}

ensure_no_deploy_lock() {
  if deploy_in_progress; then
    log "deploy in progress (deploy-app.sh running); skipping watchdog actions"
    exit 0
  fi

  local main_root=""
  if main_root="$(repo_root_from_pm2 "main-targonos" 2>/dev/null)"; then
    if deploy_lock_present "$main_root"; then
      log "deploy lock detected (${main_root}/tmp/deploy-locks); skipping watchdog actions"
      exit 0
    fi
  fi

  local dev_root=""
  if dev_root="$(repo_root_from_pm2 "dev-targonos" 2>/dev/null)"; then
    if deploy_lock_present "$dev_root"; then
      log "deploy lock detected (${dev_root}/tmp/deploy-locks); skipping watchdog actions"
      exit 0
    fi
  fi
}

check_nginx_routes() {
  if ! check_http_not_5xx "http://127.0.0.1:8080/"; then exit 1; fi
  if ! check_http_not_5xx "http://127.0.0.1:8081/"; then exit 1; fi

  local base p
  for base in "http://127.0.0.1:8080" "http://127.0.0.1:8081"; do
    for p in "/talos/" "/xplan/" "/atlas/" "/kairos/" "/plutus/" "/hermes/" "/argus/"; do
      if ! check_http_not_5xx "${base}${p}"; then exit 1; fi
    done
  done

  if ! check_next_build_manifest "http://127.0.0.1:8080" "" "main-targonos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/talos" "main-talos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/xplan" "main-xplan"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/atlas" "main-atlas"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/kairos" "main-kairos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/plutus" "main-plutus"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/hermes" "main-hermes"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8080" "/argus" "main-argus"; then exit 1; fi

  if ! check_next_build_manifest "http://127.0.0.1:8081" "" "dev-targonos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/talos" "dev-talos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/xplan" "dev-xplan"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/atlas" "dev-atlas"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/kairos" "dev-kairos"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/plutus" "dev-plutus"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/hermes" "dev-hermes"; then exit 1; fi
  if ! check_next_build_manifest "http://127.0.0.1:8081" "/argus" "dev-argus"; then exit 1; fi
}

run_host_stack_verifier() {
  node "$REPO_ROOT/scripts/verify-host-stack.mjs" --env all
}

main() {
  ensure_brew_services_started
  ensure_pm2_alive
  ensure_no_deploy_lock
  ensure_pm2_processes_healthy
  check_nginx_routes
  run_host_stack_verifier
}

main "$@"
