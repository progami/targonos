#!/bin/bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$COMMON_DIR/../../../.." && pwd)"
CHROME_HELPER="$COMMON_DIR/chrome-devtools-helper.mjs"
TOTP_HELPER="$COMMON_DIR/totp-helper.mjs"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  echo "Node.js not found in PATH=$PATH" >&2
  exit 1
fi

run_chrome_helper() {
  "$NODE_BIN" "$CHROME_HELPER" "$@"
}

ensure_chrome_browser() {
  run_chrome_helper ensure-browser >/dev/null
}

bitwarden_session() {
  if [ -n "${BW_SESSION:-}" ]; then
    printf '%s' "$BW_SESSION"
    return 0
  fi

  local password
  local session

  password="$(security find-generic-password -a "$USER" -s bitwarden-master-password -w)"
  session="$(BW_PASSWORD="$password" bw unlock --passwordenv BW_PASSWORD --raw)"
  export BW_SESSION="$session"
  security add-generic-password -U -a "$USER" -s bitwarden-cli-session -w "$session" >/dev/null
  printf '%s' "$session"
}

bitwarden_login_field() {
  local item_name="$1"
  local login_username="$2"
  local field_name="$3"
  local payload
  local session

  session="$(bitwarden_session)"
  export BW_SESSION="$session"
  payload="$(BW_SESSION="$session" bw list items --search "$item_name")"

  ITEM_NAME="$item_name" LOGIN_USERNAME="$login_username" FIELD_NAME="$field_name" PAYLOAD="$payload" "$PYTHON_BIN" - <<'PY'
import json
import os
import sys

items = json.loads(os.environ["PAYLOAD"])
item_name = os.environ["ITEM_NAME"]
login_username = os.environ["LOGIN_USERNAME"]
field_name = os.environ["FIELD_NAME"]

for item in items:
    if item.get("name") != item_name:
        continue

    login = item.get("login") or {}
    if login.get("username") != login_username:
        continue

    if field_name == "username":
        value = login.get("username")
    elif field_name == "password":
        value = login.get("password")
    else:
        raise SystemExit(1)

    if not value:
        raise SystemExit(1)

    print(value)
    raise SystemExit(0)

raise SystemExit(1)
PY
}

bitwarden_login_item_id() {
  local item_name="$1"
  local login_username="$2"
  local payload
  local session

  session="$(bitwarden_session)"
  export BW_SESSION="$session"
  payload="$(BW_SESSION="$session" bw list items --search "$item_name")"

  ITEM_NAME="$item_name" LOGIN_USERNAME="$login_username" PAYLOAD="$payload" "$PYTHON_BIN" - <<'PY'
import json
import os
import sys

items = json.loads(os.environ["PAYLOAD"])
item_name = os.environ["ITEM_NAME"]
login_username = os.environ["LOGIN_USERNAME"]

for item in items:
    if item.get("name") != item_name:
        continue

    login = item.get("login") or {}
    if login.get("username") != login_username:
        continue

    item_id = item.get("id")
    if not item_id:
        raise SystemExit(1)

    print(item_id)
    raise SystemExit(0)

raise SystemExit(1)
PY
}

bitwarden_login_username() {
  bitwarden_login_field "$1" "$2" "username"
}

bitwarden_login_password() {
  bitwarden_login_field "$1" "$2" "password"
}

bitwarden_login_totp() {
  local item_name="$1"
  local login_username="$2"
  local item_id
  local item_json
  local session
  local totp_value

  session="$(bitwarden_session)"
  export BW_SESSION="$session"
  item_id="$(bitwarden_login_item_id "$item_name" "$login_username")"
  item_json="$(BW_SESSION="$session" bw get item "$item_id")"
  totp_value="$(printf '%s' "$item_json" | jq -r '.login.totp // ""')"

  if [ -z "$totp_value" ]; then
    return 1
  fi

  "$NODE_BIN" "$TOTP_HELPER" generate "$totp_value"
}

load_env_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi

  local export_lines
  export_lines="$("$PYTHON_BIN" - "$file" <<'PY'
from pathlib import Path
import shlex
import sys

path = Path(sys.argv[1])
if not path.exists():
    raise SystemExit(0)

for raw_line in path.read_text().splitlines():
    for line in raw_line.split('\\n'):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith('#'):
            continue

        cleaned = trimmed
        while cleaned and cleaned[0].isdigit():
            cleaned = cleaned[1:]
        if cleaned.startswith('→'):
            cleaned = cleaned[1:]

        if '=' not in cleaned:
            continue

        key, value = cleaned.split('=', 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
          value = value[1:-1]
        if value.endswith('$'):
          value = value[:-1]

        print(f"export {key}={shlex.quote(value)}")
PY
)"

  if [ -n "$export_lines" ]; then
    eval "$export_lines"
  fi
}

load_monitoring_env() {
  load_env_file "$REPO_ROOT/apps/argus/.env.local"
}

week_context_for_end_date() {
  local end_date="$1"

  "$PYTHON_BIN" - "$end_date" <<'PY'
from datetime import date, timedelta
import sys

base_start = date(2025, 12, 28)
week_end = date.fromisoformat(sys.argv[1])
week_start = week_end - timedelta(days=6)
week_number = ((week_start - base_start).days // 7) + 1
week_code = f"W{week_number:02d}"
print(f"{week_code}|{week_start.isoformat()}|{week_end.isoformat()}|{week_code}_{week_end.isoformat()}")
PY
}

latest_complete_week_context() {
  "$PYTHON_BIN" <<'PY'
from datetime import date, timedelta

base_start = date(2025, 12, 28)
today = date.today()
weekday = today.weekday()
days_back = 7 if weekday == 5 else (weekday - 5) % 7
week_end = today - timedelta(days=days_back)
week_start = week_end - timedelta(days=6)
week_number = ((week_start - base_start).days // 7) + 1
week_code = f"W{week_number:02d}"
print(f"{week_code}|{week_start.isoformat()}|{week_end.isoformat()}|{week_code}_{week_end.isoformat()}")
PY
}

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "${value// }" ]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
  printf '%s' "$value"
}

js_string_literal() {
  "$PYTHON_BIN" - "$1" <<'PY'
import json
import sys

print(json.dumps(sys.argv[1]))
PY
}

is_amazon_login_url() {
  local url="${1:-}"
  [[ "$url" == *"amazon.com/ap/"* || "$url" == *"signin"* ]]
}

copy_file_with_node() {
  local source="$1"
  local target="$2"

  "$NODE_BIN" -e '
const fs = require("node:fs");
const path = require("node:path");
const source = process.argv[1];
const target = process.argv[2];
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
' "$source" "$target"
}

write_stdin_to_file_with_node() {
  local target="$1"

  "$NODE_BIN" -e '
const fs = require("node:fs");
const path = require("node:path");
const target = process.argv[1];
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.concat(chunks));
});
' "$target"
}

latest_matching_file() {
  local pattern="$1"

  "$PYTHON_BIN" - "$pattern" <<'PY'
from pathlib import Path
import sys

pattern = sys.argv[1]

if pattern.startswith("~/"):
    base = Path.home()
    glob_pattern = pattern.replace(str(Path.home()) + "/", "").replace("~/", "")
elif pattern.startswith("/"):
    base = Path("/")
    glob_pattern = pattern.lstrip("/")
else:
    base = Path.cwd()
    glob_pattern = pattern

matches = sorted(
    (
        path for path in base.glob(glob_pattern)
        if not path.name.endswith(".download") and not path.name.endswith(".crdownload")
    ),
    key=lambda path: max(path.stat().st_ctime, path.stat().st_mtime),
    reverse=True,
)
if not matches:
    raise SystemExit(0)
latest = matches[0]
stat = latest.stat()
print(f"{latest}|{stat.st_mtime}|{stat.st_ctime}|{stat.st_size}")
PY
}

wait_for_new_matching_file() {
  local pattern="$1"
  local baseline_path="${2:-}"
  local baseline_mtime="${3:-0}"
  local baseline_ctime="${4:-0}"
  local baseline_size="${5:-0}"
  local timeout_seconds="${6:-90}"

  "$PYTHON_BIN" - "$pattern" "$baseline_path" "$baseline_mtime" "$baseline_ctime" "$baseline_size" "$timeout_seconds" <<'PY'
from pathlib import Path
import sys
import time

pattern = sys.argv[1]
baseline_path = sys.argv[2]
baseline_mtime = float(sys.argv[3])
baseline_ctime = float(sys.argv[4])
baseline_size = int(float(sys.argv[5]))
timeout_seconds = float(sys.argv[6])

if pattern.startswith("~/"):
    base = Path.home()
    glob_pattern = pattern[2:]
elif pattern.startswith("/"):
    base = Path("/")
    glob_pattern = pattern[1:]
else:
    base = Path.cwd()
    glob_pattern = pattern

deadline = time.time() + timeout_seconds
while time.time() <= deadline:
    matches = sorted(
        (
            path for path in base.glob(glob_pattern)
            if not path.name.endswith(".download") and not path.name.endswith(".crdownload")
        ),
        key=lambda path: max(path.stat().st_ctime, path.stat().st_mtime),
        reverse=True,
    )
    if matches:
        latest = matches[0]
        stat = latest.stat()
        latest_mtime = stat.st_mtime
        latest_ctime = stat.st_ctime
        latest_size = stat.st_size
        if (
            str(latest) != baseline_path
            or latest_mtime > baseline_mtime
            or latest_ctime > baseline_ctime
            or latest_size != baseline_size
        ):
            print(str(latest))
            raise SystemExit(0)
    time.sleep(2)

raise SystemExit(1)
PY
}

delete_matching_files() {
  local pattern="$1"

  "$PYTHON_BIN" - "$pattern" <<'PY'
from pathlib import Path
import sys

pattern = sys.argv[1]

if pattern.startswith("~/"):
    base = Path.home()
    glob_pattern = pattern[2:]
elif pattern.startswith("/"):
    base = Path("/")
    glob_pattern = pattern[1:]
else:
    base = Path.cwd()
    glob_pattern = pattern

for path in base.glob(glob_pattern):
    if path.is_file():
        path.unlink()
PY
}
