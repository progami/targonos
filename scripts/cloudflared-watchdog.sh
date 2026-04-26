#!/usr/bin/env bash
set -euo pipefail

# macOS watchdog for the Targon-owned Cloudflare Tunnel LaunchAgent.
# It refuses to recover a misconfigured service, because starting bare
# cloudflared recreates Cloudflare 1033 while looking superficially loaded.

LAUNCHD_LABEL="${CLOUDFLARED_LABEL:-com.targonglobal.cloudflared-tunnel}"
LAUNCHD_DOMAIN="gui/$(id -u)"

CLOUDFLARED_PROGRAM="${CLOUDFLARED_PROGRAM:-/opt/homebrew/opt/cloudflared/bin/cloudflared}"
CLOUDFLARED_CONFIG_PATH="${CLOUDFLARED_CONFIG_PATH:-${HOME}/.cloudflared/config.yml}"
CLOUDFLARED_METRICS_ADDRESS="${CLOUDFLARED_METRICS_ADDRESS:-127.0.0.1:20241}"
CLOUDFLARED_TUNNEL_ID="${CLOUDFLARED_TUNNEL_ID:-cdb60dd3-b875-4735-9f5d-21ebc0f42b46}"
CLOUDFLARED_READY_URL="${CLOUDFLARED_READY_URL:-http://${CLOUDFLARED_METRICS_ADDRESS}/ready}"

COOLDOWN_SECONDS="${CLOUDFLARED_RESTART_COOLDOWN_SECONDS:-90}"

log() {
  printf '%s %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

lock_dir="${TMPDIR:-/tmp}/cloudflared-watchdog.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null' EXIT

restart_stamp="${TMPDIR:-/tmp}/cloudflared-watchdog.last_restart"

assert_launchd_command() {
  local launchd_output
  launchd_output="$(launchctl print "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}")"

  local required_tokens=(
    "$CLOUDFLARED_PROGRAM"
    "tunnel"
    "--config"
    "$CLOUDFLARED_CONFIG_PATH"
    "--metrics"
    "$CLOUDFLARED_METRICS_ADDRESS"
    "run"
    "$CLOUDFLARED_TUNNEL_ID"
  )

  local token
  for token in "${required_tokens[@]}"; do
    if ! printf '%s\n' "$launchd_output" | grep -Fq -- "$token"; then
      log "misconfigured ${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}: missing ProgramArguments token '${token}'"
      exit 1
    fi
  done
}

restart_cloudflared() {
  local reason="${1:?reason is required}"
  local now last
  now="$(date +%s)"
  last="0"
  if [[ -f "$restart_stamp" ]]; then
    last="$(cat "$restart_stamp")"
  fi

  if [[ "$last" =~ ^[0-9]+$ ]] && (( now - last < COOLDOWN_SECONDS )); then
    log "skip restart (cooldown ${COOLDOWN_SECONDS}s): ${reason}"
    return 0
  fi

  printf '%s' "$now" >"$restart_stamp"
  log "restarting ${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}: ${reason}"
  launchctl kickstart -k "${LAUNCHD_DOMAIN}/${LAUNCHD_LABEL}"
}

assert_launchd_command

ready_json=""
set +e
ready_json="$(curl -fsS --max-time 3 "$CLOUDFLARED_READY_URL" 2>/dev/null)"
ready_rc=$?
set -e

if [[ "$ready_rc" -ne 0 ]]; then
  restart_cloudflared "ready endpoint failed (${CLOUDFLARED_READY_URL}, curl rc=${ready_rc})"
  exit 0
fi

ready_connections="$(printf '%s' "$ready_json" | sed -nE 's/.*"readyConnections":([0-9]+).*/\1/p')"
if [[ -z "$ready_connections" ]]; then
  restart_cloudflared "could not parse readyConnections from ${CLOUDFLARED_READY_URL}"
  exit 0
fi

if [[ "$ready_connections" -lt 1 ]]; then
  restart_cloudflared "readyConnections=${ready_connections}"
  exit 0
fi

tunnel_info=""
set +e
tunnel_info="$("$CLOUDFLARED_PROGRAM" tunnel info "$CLOUDFLARED_TUNNEL_ID" 2>&1)"
tunnel_info_rc=$?
set -e

if [[ "$tunnel_info_rc" -ne 0 ]]; then
  restart_cloudflared "cloudflared tunnel info failed (rc=${tunnel_info_rc})"
  exit 0
fi

if [[ "$tunnel_info" == *"does not have any active connection"* ]]; then
  restart_cloudflared "Cloudflare reports no active connection"
fi
