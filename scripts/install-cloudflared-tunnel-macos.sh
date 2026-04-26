#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LABEL="${CLOUDFLARED_TUNNEL_LABEL:-com.targonglobal.cloudflared-tunnel}"
DOMAIN="gui/$(id -u)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${LAUNCH_AGENTS_DIR}/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs"
STDOUT_PATH="${LOG_DIR}/cloudflared-tunnel.out.log"
STDERR_PATH="${LOG_DIR}/cloudflared-tunnel.err.log"

HOMEBREW_LABEL="homebrew.mxcl.cloudflared"
HOMEBREW_PLIST_PATH="${LAUNCH_AGENTS_DIR}/${HOMEBREW_LABEL}.plist"

CLOUDFLARED_PROGRAM="${CLOUDFLARED_PROGRAM:-/opt/homebrew/opt/cloudflared/bin/cloudflared}"
CLOUDFLARED_CONFIG_PATH="${CLOUDFLARED_CONFIG_PATH:-${HOME}/.cloudflared/config.yml}"
CLOUDFLARED_METRICS_ADDRESS="${CLOUDFLARED_METRICS_ADDRESS:-127.0.0.1:20241}"
CLOUDFLARED_TUNNEL_ID="${CLOUDFLARED_TUNNEL_ID:-cdb60dd3-b875-4735-9f5d-21ebc0f42b46}"

wait_for_service_absent() {
  local label="$1"

  for _ in {1..20}; do
    if ! launchctl print "${DOMAIN}/${label}" >/dev/null 2>&1; then
      return 0
    fi

    sleep 0.5
  done

  printf 'launchd service did not unload: %s/%s\n' "$DOMAIN" "$label" >&2
  exit 1
}

wait_for_service_running() {
  local label="$1"

  for _ in {1..60}; do
    if launchctl print "${DOMAIN}/${label}" 2>/dev/null | grep -Fq -- 'state = running'; then
      return 0
    fi

    sleep 1
  done

  printf 'launchd service did not reach running state: %s/%s\n' "$DOMAIN" "$label" >&2
  exit 1
}

wait_for_tunnel_ready() {
  local ready_url="http://${CLOUDFLARED_METRICS_ADDRESS}/ready"

  for _ in {1..60}; do
    if curl -fsS --max-time 2 "$ready_url" >/dev/null; then
      return 0
    fi

    sleep 1
  done

  printf 'cloudflared tunnel metrics endpoint did not become ready: %s\n' "$ready_url" >&2
  exit 1
}

if [[ ! -x "$CLOUDFLARED_PROGRAM" ]]; then
  printf 'cloudflared executable not found or not executable: %s\n' "$CLOUDFLARED_PROGRAM" >&2
  exit 1
fi

if [[ ! -f "$CLOUDFLARED_CONFIG_PATH" ]]; then
  printf 'cloudflared config file not found: %s\n' "$CLOUDFLARED_CONFIG_PATH" >&2
  exit 1
fi

mkdir -p "$LAUNCH_AGENTS_DIR"
mkdir -p "$LOG_DIR"

if launchctl print "${DOMAIN}/${HOMEBREW_LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${DOMAIN}/${HOMEBREW_LABEL}"
  wait_for_service_absent "$HOMEBREW_LABEL"
fi

if [[ -f "$HOMEBREW_PLIST_PATH" ]]; then
  rm -f "$HOMEBREW_PLIST_PATH"
fi

node "$SCRIPT_DIR/cloudflared-tunnel-launchd.mjs" render \
  --program "$CLOUDFLARED_PROGRAM" \
  --config "$CLOUDFLARED_CONFIG_PATH" \
  --metrics "$CLOUDFLARED_METRICS_ADDRESS" \
  --tunnel-id "$CLOUDFLARED_TUNNEL_ID" \
  --stdout "$STDOUT_PATH" \
  --stderr "$STDERR_PATH" >"$PLIST_PATH"

plutil -lint "$PLIST_PATH" >/dev/null

if launchctl print "${DOMAIN}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "${DOMAIN}/${LABEL}"
  wait_for_service_absent "$LABEL"
fi

launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
wait_for_service_running "$LABEL"
wait_for_tunnel_ready

printf 'Installed Cloudflared tunnel LaunchAgent:\n'
printf '%s\n' "- Label: ${LABEL}"
printf '%s\n' "- LaunchAgent: ${PLIST_PATH}"
printf '%s\n' "- Metrics: http://${CLOUDFLARED_METRICS_ADDRESS}/ready"
printf '%s\n' "- Logs: ${STDOUT_PATH}, ${STDERR_PATH}"
