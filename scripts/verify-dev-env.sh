#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

declare -a required_dev_host_files=(
  "apps/sso/.env.dev"
  "apps/talos/.env.dev"
  "apps/xplan/.env.dev"
)

has_error=0

print_error() {
  printf '::error::%s\n' "$1"
  has_error=1
}

require_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! grep -Eq "$pattern" "$repo_root/$file"; then
    print_error "$message ($file)"
  fi
}

forbid_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if grep -Eq "$pattern" "$repo_root/$file"; then
    print_error "$message ($file)"
  fi
}

for file in "${required_dev_host_files[@]}"; do
  if [[ ! -f "$repo_root/$file" ]]; then
    print_error "Missing expected env file: $file"
    continue
  fi
  require_contains "$file" 'https://dev-os\.targonglobal\.com' \
    "Dev host https://dev-os.targonglobal.com must appear in"
  forbid_contains "$file" 'https://os\.targonglobal\.com' \
    "Prod host https://os.targonglobal.com must not appear in"
done

require_contains "apps/sso/.env.dev" '^PORTAL_APPS_CONFIG=dev\.apps\.json$' \
  "PORTAL_APPS_CONFIG must point at dev.apps.json in"
require_contains "apps/sso/.env.local" '^PORTAL_APPS_CONFIG=dev\.apps\.json$' \
  "PORTAL_APPS_CONFIG must point at dev.apps.json in"

if [[ $has_error -eq 1 ]]; then
  printf 'Dev environment configuration checks failed.\n' >&2
  exit 1
fi

printf 'Dev environment configuration checks passed.\n'
