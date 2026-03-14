#!/bin/bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$COMMON_DIR/../../../.." && pwd)"
SAFARI_HELPER="$COMMON_DIR/safari-helper.applescript"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! NODE_BIN="$(command -v node)"; then
  echo "Node.js not found in PATH=$PATH" >&2
  exit 1
fi

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

parse_tab_info() {
  local input="$1"
  IFS='|' read -r SAFARI_WINDOW_ID SAFARI_TAB_INDEX SAFARI_TAB_URL <<<"$input"
  export SAFARI_WINDOW_ID SAFARI_TAB_INDEX SAFARI_TAB_URL
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
matches = sorted(
    Path.home().glob(pattern.replace(str(Path.home()) + "/", "").replace("~/", "")) if pattern.startswith("~/") else Path("/").glob(pattern.lstrip("/")),
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
if not matches:
    raise SystemExit(0)
latest = matches[0]
print(f"{latest}|{latest.stat().st_mtime}")
PY
}

wait_for_new_matching_file() {
  local pattern="$1"
  local baseline_path="${2:-}"
  local baseline_mtime="${3:-0}"
  local timeout_seconds="${4:-90}"

  "$PYTHON_BIN" - "$pattern" "$baseline_path" "$baseline_mtime" "$timeout_seconds" <<'PY'
from pathlib import Path
import sys
import time

pattern = sys.argv[1]
baseline_path = sys.argv[2]
baseline_mtime = float(sys.argv[3])
timeout_seconds = float(sys.argv[4])

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
        (path for path in base.glob(glob_pattern) if not path.name.endswith(".download")),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if matches:
        latest = matches[0]
        latest_mtime = latest.stat().st_mtime
        if str(latest) != baseline_path or latest_mtime > baseline_mtime:
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
