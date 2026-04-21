#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_HOME="$TMP_DIR/home"
FAKE_SECRET_DIR="$FAKE_HOME/.config/codex/secrets"
FAKE_BIN_DIR="$TMP_DIR/bin"
mkdir -p "$FAKE_SECRET_DIR" "$FAKE_BIN_DIR"

cat > "$FAKE_SECRET_DIR/bitwarden-master-password" <<'EOF'
test-master-password
EOF

cat > "$FAKE_BIN_DIR/bw" <<'EOF'
#!/bin/bash
set -euo pipefail

COUNT_FILE="${TEST_BW_COUNT_FILE:?}"

if [ "$1" = "status" ]; then
  printf '{"status":"locked","userEmail":"jarrar@targonglobal.com","serverUrl":"https://vault.bitwarden.com"}'
  exit 0
fi

if [ "$1" = "list" ] && [ "$2" = "items" ] && [ "$3" = "--search" ] && [ "$4" = "sellercentral.amazon.com" ]; then
  cat <<'JSON'
[{"id":"sellercentral-item","name":"Seller Central / UK + US / shoaib","login":{"username":"shoaibgondal@targonglobal.com","password":"sellercentral-password","uris":[{"uri":"https://sellercentral.amazon.com/"},{"uri":"https://sellercentral.amazon.co.uk/"}]}}]
JSON
  exit 0
fi

if [ "$1" = "get" ] && [ "$2" = "item" ] && [ "$3" = "sellercentral-item" ]; then
  cat <<'JSON'
{"login":{"totp":"BASE32SECRET"}}
JSON
  exit 0
fi

if [ "$1" = "unlock" ] && [ "$2" = "--passwordenv" ] && [ "$3" = "BW_PASSWORD" ] && [ "$4" = "--raw" ]; then
  count="$(cat "$COUNT_FILE")"
  printf '%s' $((count + 1)) > "$COUNT_FILE"
  if [ "${BW_PASSWORD:-}" != "test-master-password" ]; then
    echo "unexpected password: ${BW_PASSWORD:-}" >&2
    exit 1
  fi
  printf 'session-from-unlock'
  exit 0
fi

echo "unexpected bw invocation: $*" >&2
exit 1
EOF
chmod +x "$FAKE_BIN_DIR/bw"
printf '0' > "$TMP_DIR/bw-count"

HOME="$FAKE_HOME" \
ARGUS_BITWARDEN_SECRET_DIR="$FAKE_SECRET_DIR" \
BW_BIN="$FAKE_BIN_DIR/bw" \
TEST_BW_COUNT_FILE="$TMP_DIR/bw-count" \
bash -lc '
set -euo pipefail
source "'"$SCRIPT_DIR"'/common.sh"

bitwarden_session >/dev/null
if [ "${BW_SESSION:-}" != "session-from-unlock" ]; then
  echo "expected unlock session, got: ${BW_SESSION:-}" >&2
  exit 1
fi

bitwarden_session >/dev/null
if [ "${BW_SESSION:-}" != "session-from-unlock" ]; then
  echo "expected env session reuse, got: ${BW_SESSION:-}" >&2
  exit 1
fi

cached_session="$(cat "'"$FAKE_SECRET_DIR"'/bitwarden-cli-session")"
if [ "$cached_session" != "session-from-unlock" ]; then
  echo "expected cached session file" >&2
  exit 1
fi
' >/dev/null

if [ "$(cat "$TMP_DIR/bw-count")" != "1" ]; then
  echo "expected bw unlock to run once per shell session" >&2
  exit 1
fi

HOME="$FAKE_HOME" \
ARGUS_BITWARDEN_SECRET_DIR="$FAKE_SECRET_DIR" \
BW_BIN="$FAKE_BIN_DIR/bw" \
TEST_BW_COUNT_FILE="$TMP_DIR/bw-count" \
bash -lc '
set -euo pipefail
source "'"$SCRIPT_DIR"'/common.sh"

if [ "$(bitwarden_login_username "sellercentral.amazon.com" "shoaibgondal@targonglobal.com")" != "shoaibgondal@targonglobal.com" ]; then
  echo "expected sellercentral URI host match for username lookup" >&2
  exit 1
fi

if [ "$(bitwarden_login_password "sellercentral.amazon.com" "shoaibgondal@targonglobal.com")" != "sellercentral-password" ]; then
  echo "expected sellercentral URI host match for password lookup" >&2
  exit 1
fi

if [ "$(bitwarden_login_item_id "sellercentral.amazon.com" "shoaibgondal@targonglobal.com")" != "sellercentral-item" ]; then
  echo "expected sellercentral URI host match for item id lookup" >&2
  exit 1
fi
' >/dev/null

WAIT_DIR="$TMP_DIR/wait-for-download"
mkdir -p "$WAIT_DIR"
(
  sleep 1
  printf 'part' > "$WAIT_DIR/test.csv"
  sleep 3
  printf 'ial' >> "$WAIT_DIR/test.csv"
) &
WAIT_WRITER_PID=$!

HOME="$FAKE_HOME" \
ARGUS_BITWARDEN_SECRET_DIR="$FAKE_SECRET_DIR" \
BW_BIN="$FAKE_BIN_DIR/bw" \
TEST_BW_COUNT_FILE="$TMP_DIR/bw-count" \
bash -lc '
set -euo pipefail
source "'"$SCRIPT_DIR"'/common.sh"

downloaded_file="$(wait_for_new_matching_file "'"$WAIT_DIR"'/*.csv" "" 0 0 0 12)"
if [ "$downloaded_file" != "'"$WAIT_DIR"'/test.csv" ]; then
  echo "expected stable download path, got: $downloaded_file" >&2
  exit 1
fi

download_size="$(wc -c < "$downloaded_file" | tr -d '[:space:]')"
if [ "$download_size" != "7" ]; then
  echo "expected wait_for_new_matching_file to wait for final size, got: $download_size" >&2
  exit 1
fi
' >/dev/null

wait "$WAIT_WRITER_PID"

echo "common.sh tests passed"
