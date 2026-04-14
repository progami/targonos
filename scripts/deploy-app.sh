#!/usr/bin/env bash
# Deploy script for CI/CD - pulls, clears caches, builds, and restarts an app
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: deploy-app.sh <app-key> <environment>" >&2
  echo "  app-key: talos, sso, website, xplan, kairos, atlas, plutus, hermes, argus" >&2
  echo "  environment: dev, main" >&2
  exit 1
fi

app_key="$1"
environment="$2"

is_truthy() {
  case "${1:-}" in
    [Tt][Rr][Uu][Ee] | 1 | [Yy][Ee][Ss]) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_script_repo_dir() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$script_dir/.." >/dev/null
  pwd
}

resolve_named_repo_dir() {
  local repo_name="$1"
  local configured_dir="$2"

  if [[ -n "$configured_dir" ]]; then
    printf '%s' "$configured_dir"
    return 0
  fi

  local script_repo_dir
  script_repo_dir="$(resolve_script_repo_dir)"

  if [[ "$(basename "$script_repo_dir")" == "$repo_name" ]]; then
    printf '%s' "$script_repo_dir"
    return 0
  fi

  local sibling_repo_dir
  sibling_repo_dir="$(dirname "$script_repo_dir")/${repo_name}"
  if [[ -d "$sibling_repo_dir" ]]; then
    printf '%s' "$sibling_repo_dir"
    return 0
  fi

  return 1
}

compute_changed_files() {
  changed_files_available="false"
  changed_files=()

  cd "$REPO_DIR"

  local base="${deploy_base_sha:-}"
  local head="${deploy_head_sha:-}"

  if [[ -z "$head" ]]; then
    head="$(git rev-parse HEAD)"
  fi

	  if [[ -n "$base" && "$base" != "$ZERO_SHA" ]]; then
	    if git cat-file -e "$base^{commit}" 2>/dev/null && git cat-file -e "$head^{commit}" 2>/dev/null; then
	      while IFS= read -r file; do
	        [[ -n "$file" ]] && changed_files+=("$file")
	      done < <(git diff --name-only "$base" "$head" || true)
	      changed_files_available="true"
	      return 0
	    fi

    warn "Could not compute changed files for range $base..$head"
    return 1
  fi

	  if [[ "$base" == "$ZERO_SHA" ]]; then
	    while IFS= read -r file; do
	      [[ -n "$file" ]] && changed_files+=("$file")
	    done < <(git ls-files)
	    changed_files_available="true"
	    return 0
  fi

  # Best-effort fallback for manual runs without an explicit range.
	  if git rev-parse --verify -q "${head}^" >/dev/null 2>&1; then
	    base="$(git rev-parse "${head}^")"
	    while IFS= read -r file; do
	      [[ -n "$file" ]] && changed_files+=("$file")
	    done < <(git diff --name-only "$base" "$head" || true)
	    changed_files_available="true"
	    deploy_base_sha="$base"
	    deploy_head_sha="$head"
	    return 0
  fi

  return 1
}

any_changed() {
  local pattern="$1"
  local file
  for file in "${changed_files[@]-}"; do
    if [[ "$file" == $pattern ]]; then
      return 0
    fi
  done
  return 1
}

any_changed_under() {
  local prefix="$1"
  local file
  for file in "${changed_files[@]-}"; do
    if [[ "$file" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

join_commands() {
  local joined=""
  local command

  for command in "$@"; do
    if [[ -z "$joined" ]]; then
      joined="$command"
    else
      joined="$joined && $command"
    fi
  done

  printf '%s' "$joined"
}

build_talos_changed_migrate_cmd() {
  if any_changed "apps/talos/prisma/schema.prisma"; then
    printf '%s' "$talos_full_migrate_cmd"
    return 0
  fi

  local commands=()

  any_changed "apps/talos/scripts/migrations/ensure-talos-tenant-schema.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:tenant-schema")
  any_changed "apps/talos/scripts/migrations/add-sku-dimension-columns.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-dimensions")
  any_changed "apps/talos/scripts/migrations/add-sku-reference-fee-columns.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-reference-fee-columns")
  any_changed "apps/talos/scripts/migrations/add-sku-subcategory.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-subcategory")
  any_changed "apps/talos/scripts/migrations/add-sku-amazon-reference-weight.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-amazon-reference-weight")
  any_changed "apps/talos/scripts/migrations/add-sku-amazon-listing-price.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-amazon-listing-price")
  any_changed "apps/talos/scripts/migrations/add-sku-amazon-category-columns.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-amazon-categories")
  any_changed "apps/talos/scripts/migrations/add-sku-amazon-item-dimensions.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:sku-amazon-item-dimensions")
  any_changed "apps/talos/scripts/migrations/add-supplier-default-columns.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:supplier-defaults")
  any_changed "apps/talos/scripts/migrations/add-warehouse-billing-config.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:warehouse-billing-config")
  any_changed "apps/talos/scripts/migrations/add-warehouse-sku-storage-configs.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:warehouse-sku-storage-configs")
  any_changed "apps/talos/scripts/migrations/add-purchase-order-document-table.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:purchase-order-documents")
  any_changed "apps/talos/scripts/migrations/add-fulfillment-orders-foundation.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:fulfillment-orders-foundation")
  any_changed "apps/talos/scripts/migrations/add-fulfillment-orders-amazon-fields.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:fulfillment-orders-amazon-fields")
  any_changed "apps/talos/scripts/migrations/replace-batch-with-lot-ref.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:replace-batch-with-lot-ref")
  any_changed "apps/talos/scripts/migrations/add-po-product-assignments.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:po-product-assignments")
  any_changed "apps/talos/scripts/migrations/supply-chain-reference-convention.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:supply-chain-reference-convention")
  any_changed "apps/talos/scripts/migrations/ensure-erd-v10-views.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:erd-v10-views")
  any_changed "apps/talos/scripts/migrations/normalize-po-base-currency.ts" &&
    commands+=("pnpm --filter $workspace db:migrate:po-base-currency")

  if [[ ${#commands[@]} -eq 0 ]]; then
    return 1
  fi

  join_commands "${commands[@]}"
}

skip_git="${DEPLOY_SKIP_GIT:-false}"
skip_install="${DEPLOY_SKIP_INSTALL:-false}"
skip_pm2_save="${DEPLOY_SKIP_PM2_SAVE:-false}"
prep_only="${DEPLOY_PREP_ONLY:-false}"
deploy_git_sha="${DEPLOY_GIT_SHA:-}"
deploy_base_sha="${DEPLOY_BASE_SHA:-}"
deploy_head_sha="${DEPLOY_HEAD_SHA:-}"
migrate_cmd=""
talos_full_migrate_cmd=""
install_mode=""
changed_files_available="false"
changed_files=()
ZERO_SHA="0000000000000000000000000000000000000000"
initial_next_public_version="${NEXT_PUBLIC_VERSION-}"
initial_next_public_release_url="${NEXT_PUBLIC_RELEASE_URL-}"
initial_next_public_commit_sha="${NEXT_PUBLIC_COMMIT_SHA-}"
initial_build_time="${BUILD_TIME-}"

# Prevent the host watchdog from restarting stopped PM2 processes mid-deploy.
# The watchdog checks for any files under: <worktree>/tmp/deploy-locks/*
lock_dir=""
lock_file=""
acquire_deploy_lock() {
  lock_dir="${REPO_DIR}/tmp/deploy-locks"
  mkdir -p "$lock_dir"
  lock_file="${lock_dir}/${environment}-${app_key}-$$.lock"
  printf '%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ") pid=$$ app=$app_key env=$environment" >"$lock_file"
}

release_deploy_lock() {
  if [[ -n "${lock_file:-}" ]]; then
    rm -f "$lock_file"
  fi
}

if ! TARGONOS_DEV_DIR="$(resolve_named_repo_dir "targonos-dev" "${TARGONOS_DEV_DIR:-${TARGON_DEV_DIR:-}}")"; then
  echo "Missing repo directory for targonos-dev." >&2
  echo "Set TARGONOS_DEV_DIR (or legacy TARGON_DEV_DIR)." >&2
  exit 1
fi

if ! TARGONOS_MAIN_DIR="$(resolve_named_repo_dir "targonos-main" "${TARGONOS_MAIN_DIR:-${TARGON_MAIN_DIR:-}}")"; then
  echo "Missing repo directory for targonos-main." >&2
  echo "Set TARGONOS_MAIN_DIR (or legacy TARGON_MAIN_DIR)." >&2
  exit 1
fi

export TARGONOS_DEV_DIR TARGONOS_MAIN_DIR

# Determine directories based on environment
if [[ "$environment" == "dev" ]]; then
  REPO_DIR="$TARGONOS_DEV_DIR"
  PM2_PREFIX="dev"
  BRANCH="dev"
elif [[ "$environment" == "main" ]]; then
  REPO_DIR="$TARGONOS_MAIN_DIR"
  PM2_PREFIX="main"
  BRANCH="main"
else
  echo "Unknown environment: $environment" >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Repo directory does not exist: $REPO_DIR" >&2
  exit 1
fi

acquire_deploy_lock
trap release_deploy_lock EXIT

# Map app keys to workspace names and directories
case "$app_key" in
  talos)
    workspace="@targon/talos"
    app_dir="$REPO_DIR/apps/talos"
    pm2_name="${PM2_PREFIX}-talos"
    prisma_cmd="pnpm --filter $workspace db:generate"
    talos_full_migrate_cmd="pnpm --filter $workspace db:migrate:tenant-schema && pnpm --filter $workspace db:migrate:sku-dimensions && pnpm --filter $workspace db:migrate:sku-reference-fee-columns && pnpm --filter $workspace db:migrate:sku-subcategory && pnpm --filter $workspace db:migrate:sku-amazon-reference-weight && pnpm --filter $workspace db:migrate:sku-amazon-listing-price && pnpm --filter $workspace db:migrate:sku-amazon-categories && pnpm --filter $workspace db:migrate:sku-amazon-item-dimensions && pnpm --filter $workspace db:migrate:supplier-defaults && pnpm --filter $workspace db:migrate:warehouse-billing-config && pnpm --filter $workspace db:migrate:warehouse-sku-storage-configs && pnpm --filter $workspace db:migrate:purchase-order-documents && pnpm --filter $workspace db:migrate:fulfillment-orders-foundation && pnpm --filter $workspace db:migrate:fulfillment-orders-amazon-fields && pnpm --filter $workspace db:migrate:replace-batch-with-lot-ref && pnpm --filter $workspace db:migrate:po-product-assignments && pnpm --filter $workspace db:migrate:supply-chain-reference-convention && pnpm --filter $workspace db:migrate:erd-v10-views && pnpm --filter $workspace db:migrate:po-base-currency"
    migrate_cmd="$talos_full_migrate_cmd"
    build_cmd="pnpm --filter $workspace build"
    ;;
  sso|targon|targonos)
    workspace="@targon/sso"
    app_dir="$REPO_DIR/apps/sso"
    pm2_name="${PM2_PREFIX}-targonos"
    prisma_cmd=""
    migrate_cmd="pnpm --filter @targon/auth prisma:migrate:deploy"
    build_cmd="pnpm --filter $workspace build"
    ;;
  website)
    workspace="@targon/website"
    app_dir="$REPO_DIR/apps/website"
    pm2_name="${PM2_PREFIX}-website"
    prisma_cmd=""
    build_cmd="pnpm --filter $workspace build"
    ;;
  xplan)
    workspace="@targon/xplan"
    app_dir="$REPO_DIR/apps/xplan"
    pm2_name="${PM2_PREFIX}-xplan"
    prisma_cmd="pnpm --filter $workspace prisma:generate"
    migrate_cmd="pnpm --filter $workspace prisma:migrate:deploy"
    build_cmd="pnpm --filter $workspace exec next build"
    ;;
  kairos)
    workspace="@targon/kairos"
    app_dir="$REPO_DIR/apps/kairos"
    pm2_name="${PM2_PREFIX}-kairos"
    prisma_cmd="pnpm --filter $workspace prisma:generate"
    migrate_cmd="pnpm --filter $workspace prisma:migrate:deploy"
    build_cmd="pnpm --filter $workspace build"
    ;;
  atlas)
    workspace="@targon/atlas"
    app_dir="$REPO_DIR/apps/atlas"
    pm2_name="${PM2_PREFIX}-atlas"
    prisma_cmd="cd $app_dir && npx prisma generate"
    migrate_cmd="cd $app_dir && pnpm run db:migrate:deploy --schema prisma/schema.prisma"
    build_cmd="cd $app_dir && pnpm run build"
    ;;
  plutus)
    workspace="@targon/plutus"
    app_dir="$REPO_DIR/apps/plutus"
    pm2_name="${PM2_PREFIX}-plutus"
    prisma_cmd=""
    migrate_cmd="pnpm --filter $workspace db:push"
    build_cmd="pnpm --filter $workspace build"
    ;;
  hermes)
    workspace="@targon/hermes"
    app_dir="$REPO_DIR/apps/hermes"
    pm2_name="${PM2_PREFIX}-hermes"
    prisma_cmd=""
    build_cmd="pnpm --filter $workspace build"
    ;;
  argus)
    workspace="@targon/argus"
    app_dir="$REPO_DIR/apps/argus"
    pm2_name="${PM2_PREFIX}-argus"
    prisma_cmd="cd $app_dir && npx prisma generate"
    migrate_cmd="cd $app_dir && npx prisma migrate deploy --schema prisma/schema.prisma"
    build_cmd="pnpm --filter $workspace build"
    ;;
  *)
    echo "Unknown app key: $app_key" >&2
    exit 1
    ;;
esac

kairos_ml_dir=""
kairos_ml_pm2_name=""
kairos_ml_port=""

if [[ "$app_key" == "kairos" ]]; then
  kairos_ml_dir="$REPO_DIR/services/kairos-ml"
  kairos_ml_pm2_name="${PM2_PREFIX}-kairos-ml"
  if [[ "$environment" == "dev" ]]; then
    kairos_ml_port="3111"
  else
    kairos_ml_port="3011"
  fi
fi

log() { printf '\033[36m[deploy-%s-%s]\033[0m %s\n' "$app_key" "$environment" "$*"; }
warn() { printf '\033[33m[deploy-%s-%s]\033[0m %s\n' "$app_key" "$environment" "$*"; }
error() { printf '\033[31m[deploy-%s-%s]\033[0m %s\n' "$app_key" "$environment" "$*" >&2; }

resolve_origin_repository_slug() {
  local remote_url
  remote_url="$(git -C "$REPO_DIR" remote get-url origin)"

  case "$remote_url" in
    git@github.com:*)
      remote_url="${remote_url#git@github.com:}"
      remote_url="${remote_url%.git}"
      printf '%s' "$remote_url"
      return 0
      ;;
    https://github.com/*)
      remote_url="${remote_url#https://github.com/}"
      remote_url="${remote_url%.git}"
      printf '%s' "$remote_url"
      return 0
      ;;
    ssh://git@github.com/*)
      remote_url="${remote_url#ssh://git@github.com/}"
      remote_url="${remote_url%.git}"
      printf '%s' "$remote_url"
      return 0
      ;;
  esac

  return 1
}

build_metadata_version=""
build_metadata_version_url=""
build_metadata_commit_sha=""
build_metadata_build_time=""

build_metadata_env_is_provided() {
  if [[ -n "$initial_next_public_version" ]]; then
    return 0
  fi

  if [[ -n "$initial_next_public_release_url" ]]; then
    return 0
  fi

  if [[ -n "$initial_next_public_commit_sha" ]]; then
    return 0
  fi

  if [[ -n "$initial_build_time" ]]; then
    return 0
  fi

  return 1
}

apply_precomputed_build_metadata_env() {
  if [[ -z "${initial_next_public_version//[[:space:]]/}" ]]; then
    error "NEXT_PUBLIC_VERSION is required when CI-provided build metadata is used"
    exit 1
  fi

  if [[ -z "${initial_next_public_release_url//[[:space:]]/}" ]]; then
    error "NEXT_PUBLIC_RELEASE_URL is required when CI-provided build metadata is used"
    exit 1
  fi

  if [[ -z "${initial_next_public_commit_sha//[[:space:]]/}" ]]; then
    error "NEXT_PUBLIC_COMMIT_SHA is required when CI-provided build metadata is used"
    exit 1
  fi

  if [[ -z "${initial_build_time//[[:space:]]/}" ]]; then
    error "BUILD_TIME is required when CI-provided build metadata is used"
    exit 1
  fi

  build_metadata_version="$initial_next_public_version"
  build_metadata_version_url="$initial_next_public_release_url"
  build_metadata_commit_sha="$initial_next_public_commit_sha"
  build_metadata_build_time="$initial_build_time"

  export NEXT_PUBLIC_VERSION="$initial_next_public_version"
  export NEXT_PUBLIC_RELEASE_URL="$initial_next_public_release_url"
  export NEXT_PUBLIC_COMMIT_SHA="$initial_next_public_commit_sha"
  export BUILD_TIME="$initial_build_time"
  export NEXT_PUBLIC_BUILD_TIME="$initial_build_time"

  log "Build metadata: version=${NEXT_PUBLIC_VERSION} commit=${NEXT_PUBLIC_COMMIT_SHA} url=${NEXT_PUBLIC_RELEASE_URL}"
}

compute_build_metadata() {
  build_metadata_build_time="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  local head_sha
  head_sha="$(git -C "$REPO_DIR" rev-parse HEAD)"
  build_metadata_commit_sha="$(git -C "$REPO_DIR" rev-parse --short=8 HEAD)"

  local repository_slug
  if ! repository_slug="$(resolve_origin_repository_slug)"; then
    error "Unsupported origin remote URL; cannot derive repository slug"
    exit 1
  fi

  if ! git -C "$REPO_DIR" fetch origin --tags --force >/dev/null 2>&1; then
    error "Failed to refresh remote tags before computing build metadata"
    exit 1
  fi

  local remote_semver_tags
  remote_semver_tags="$(
    git -C "$REPO_DIR" ls-remote --tags origin | awk '
      {
        sha=$1
        ref=$2
        sub("^refs/tags/","",ref)
        peeled=0
        if (ref ~ /\^\{\}$/) { peeled=1; sub(/\^\{\}$/,"",ref) }
        tag=ref

        if (tag ~ /^v[0-9]+\.[0-9]+\.[0-9]+$/) {
          if (peeled) { sha_by_tag[tag]=sha; peeled_by_tag[tag]=1 }
          else if (!(tag in peeled_by_tag)) { sha_by_tag[tag]=sha }
        }
      }
      END { for (tag in sha_by_tag) print tag "\t" sha_by_tag[tag] }
    ' | tr -d '\r'
  )"

  local exact_tag
  exact_tag="$(printf '%s\n' "$remote_semver_tags" | awk -v sha="$head_sha" '$2==sha {print $1}' | LC_ALL=C sort -V | tail -n 1)"

  local base_tag_line
  base_tag_line="$(printf '%s\n' "$remote_semver_tags" | LC_ALL=C sort -V -k1,1 | tail -n 1)"

  local base_tag=""
  local base_sha=""
  if [[ -n "$base_tag_line" ]]; then
    base_tag="${base_tag_line%%$'\t'*}"
    base_sha="${base_tag_line#*$'\t'}"
  fi

  local version=""
  local tag=""

  if [[ -n "$exact_tag" ]]; then
    version="${exact_tag#v}"
    tag="$exact_tag"
  else
    local range=""
    local base_version=""

    if [[ -n "$base_tag" ]]; then
      base_version="${base_tag#v}"
      if [[ -z "$base_sha" ]]; then
        warn "Could not resolve base tag \"$base_tag\" to a commit SHA; using full history for version bump detection"
        range="HEAD"
      else
        if ! base_sha="$(git -C "$REPO_DIR" rev-parse "${base_tag}^{commit}")"; then
          error "Base tag \"$base_tag\" does not resolve to a local commit after fetching tags"
          exit 1
        fi
      fi

      if [[ "$range" == "" ]] && git -C "$REPO_DIR" merge-base --is-ancestor "$base_sha" HEAD; then
        range="${base_sha}..HEAD"
      elif [[ "$range" == "" ]]; then
        local merge_base
        merge_base="$(git -C "$REPO_DIR" merge-base "$base_sha" HEAD)"
        range="${merge_base}..HEAD"
      fi
    else
      range="HEAD"
      base_version="0.0.0"
    fi

    base_version="$(printf '%s' "$base_version" | tr -d '\r\n\t ')"
    if ! [[ "$base_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      error "Expected base version to be strict semver, got \"$base_version\" from base tag \"$base_tag\""
      exit 1
    fi

    local bump="patch"
    local commit_messages
    commit_messages="$(git -C "$REPO_DIR" log "$range" --pretty=%s%n%b)"

    if grep -qE 'BREAKING CHANGE|^[a-zA-Z]+(\(.+\))?!:' <<< "$commit_messages"; then
      bump="major"
    elif grep -qE '^feat(\(.+\))?:' <<< "$commit_messages"; then
      bump="minor"
    elif grep -qE '^fix(\(.+\))?:' <<< "$commit_messages"; then
      bump="patch"
    fi

    local major
    local minor
    local patch
    IFS='.' read -r major minor patch <<< "$base_version"

    case "$bump" in
      major)
        major=$((major + 1))
        minor=0
        patch=0
        ;;
      minor)
        minor=$((minor + 1))
        patch=0
        ;;
      patch)
        patch=$((patch + 1))
        ;;
    esac

    version="${major}.${minor}.${patch}"
    tag="v${version}"
  fi

  build_metadata_version="$version"

  if [[ "$environment" == "main" && -n "$exact_tag" ]]; then
    build_metadata_version_url="https://github.com/${repository_slug}/releases/tag/${tag}"
    return 0
  fi

  build_metadata_version_url="https://github.com/${repository_slug}/commit/${head_sha}"
}

apply_build_metadata_env() {
  if build_metadata_env_is_provided; then
    apply_precomputed_build_metadata_env
    return 0
  fi

  compute_build_metadata

  export NEXT_PUBLIC_VERSION="$build_metadata_version"
  export NEXT_PUBLIC_RELEASE_URL="$build_metadata_version_url"
  export NEXT_PUBLIC_COMMIT_SHA="$build_metadata_commit_sha"
  export BUILD_TIME="$build_metadata_build_time"
  export NEXT_PUBLIC_BUILD_TIME="$build_metadata_build_time"

  log "Build metadata: version=${NEXT_PUBLIC_VERSION} commit=${NEXT_PUBLIC_COMMIT_SHA} url=${NEXT_PUBLIC_RELEASE_URL}"
}

run_pm2_sanitized() {
  CI= \
  GITHUB_ACTIONS= \
  GITHUB_PERSONAL_ACCESS_TOKEN= \
  GITHUB_TOKEN= \
  GH_TOKEN= \
  GEMINI_API_KEY= \
  CLAUDECODE= \
  CLAUDE_CODE_ENTRYPOINT= \
  CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
  "$@"
}

pm2_field_by_name() {
  local process_name="$1"
  local field="$2"

  pm2 jlist | node -e '
const fs = require("fs");
const processName = process.argv[1];
const field = process.argv[2];
const list = JSON.parse(fs.readFileSync(0, "utf8"));
const target = list.find((entry) => entry && entry.name === processName);
if (!target) process.exit(2);
const env = target.pm2_env || {};
let value = "";
if (field === "pm_cwd") value = env.pm_cwd || env.cwd || "";
if (field === "status") value = env.status || "";
if (field === "pm_id") value = target.pm_id;
process.stdout.write(String(value));
' "$process_name" "$field"
}

start_and_verify_pm2_process() {
  local process_name="$1"
  local expected_cwd="$2"
  local expected_sha="$3"

  if pm2_field_by_name "$process_name" "pm_id" >/dev/null 2>&1; then
    run_pm2_sanitized pm2 delete "$process_name" >/dev/null
  fi
  run_pm2_sanitized pm2 start "$REPO_DIR/ecosystem.config.js" --only "$process_name" --update-env

  local status
  if ! status="$(pm2_field_by_name "$process_name" "status" 2>/dev/null)"; then
    error "Failed to find PM2 process after start: $process_name"
    exit 1
  fi

  if [[ "$status" != "online" ]]; then
    error "PM2 process is not online after start ($process_name): status=$status"
    exit 1
  fi

  local actual_cwd
  if ! actual_cwd="$(pm2_field_by_name "$process_name" "pm_cwd" 2>/dev/null)"; then
    error "Failed to read runtime cwd for $process_name"
    exit 1
  fi

  if [[ "$actual_cwd" != "$expected_cwd" ]]; then
    error "Runtime cwd drift for $process_name: expected \"$expected_cwd\", got \"$actual_cwd\""
    exit 1
  fi

  local actual_sha
  if ! actual_sha="$(git -C "$actual_cwd" rev-parse HEAD 2>/dev/null)"; then
    error "Failed to resolve git HEAD in runtime cwd for $process_name: $actual_cwd"
    exit 1
  fi

  if [[ "$actual_sha" != "$expected_sha" ]]; then
    error "Runtime SHA drift for $process_name: expected \"$expected_sha\", got \"$actual_sha\""
    exit 1
  fi

  log "Runtime verified for $process_name (cwd=$actual_cwd sha=$actual_sha)"
}

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    return 1
  fi

  # Parse dotenv-style env files safely (values may contain '&', '?', etc.).
  # Avoid `source`, which treats those characters as shell operators.
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    if [[ -z "$line" || "${line:0:1}" == "#" ]]; then
      continue
    fi

    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    if [[ "$line" != *"="* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    if [[ -z "$key" || ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    if [[ "$key" == "TARGONOS_DEV_DIR" || "$key" == "TARGONOS_MAIN_DIR" || "$key" == "TARGON_DEV_DIR" || "$key" == "TARGON_MAIN_DIR" ]]; then
      continue
    fi

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value#\"}"
      value="${value%\"}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value#\'}"
      value="${value%\'}"
    fi

    export "${key}=${value}"
  done < "$file"

  return 0
}

set_env_var_in_file() {
  local file="$1"
  local key="$2"
  local value="$3"

  local tmp
  tmp="$(mktemp)"

  local found=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${key}="* || "$line" == "export ${key}="* ]]; then
      printf '%s=%s\n' "$key" "$value" >> "$tmp"
      found=1
    else
      printf '%s\n' "$line" >> "$tmp"
    fi
  done < "$file"

  if [[ "$found" -eq 0 ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
  fi

  mv "$tmp" "$file"
}

ensure_database_url() {
  if [[ -n "${DATABASE_URL:-}" || -n "${DATABASE_URL_US:-}" || -n "${DATABASE_URL_UK:-}" ]]; then
    return 0
  fi

  local candidates=()
  if [[ "$environment" == "dev" ]]; then
    candidates=("$app_dir/.env.local" "$app_dir/.env.dev" "$app_dir/.env.dev.ci" "$app_dir/.env")
  else
    candidates=("$app_dir/.env.production" "$app_dir/.env.local" "$app_dir/.env")
  fi

  for file in "${candidates[@]}"; do
    if load_env_file "$file" && [[ -n "${DATABASE_URL:-}" || -n "${DATABASE_URL_US:-}" || -n "${DATABASE_URL_UK:-}" ]]; then
      if [[ -n "${DATABASE_URL:-}" ]]; then
        log "Loaded DATABASE_URL from $(basename "$file")"
      else
        log "Loaded tenant database URLs from $(basename "$file")"
      fi
      return 0
    fi
  done

  return 1
}

ensure_portal_db_url() {
  if [[ -n "${PORTAL_DB_URL:-}" ]]; then
    return 0
  fi

  local sso_dir="$REPO_DIR/apps/sso"
  local candidates=()
  if [[ "$environment" == "dev" ]]; then
    candidates=("$sso_dir/.env.local" "$sso_dir/.env.dev" "$sso_dir/.env.dev.ci" "$sso_dir/.env")
  else
    candidates=("$sso_dir/.env.production" "$sso_dir/.env.local" "$sso_dir/.env")
  fi
  local file

  for file in "${candidates[@]}"; do
    if load_env_file "$file" && [[ -n "${PORTAL_DB_URL:-}" ]]; then
      log "Loaded PORTAL_DB_URL from $(basename "$file")"
      return 0
    fi
  done

  return 1
}

hosted_portal_origin() {
  case "$environment" in
    dev)
      printf 'https://dev-os.targonglobal.com'
      return 0
      ;;
    main)
      printf 'https://os.targonglobal.com'
      return 0
      ;;
  esac

  error "Unsupported hosted environment: $environment"
  exit 1
}

hosted_cookie_domain() {
  case "$environment" in
    dev)
      printf '.dev-os.targonglobal.com'
      return 0
      ;;
    main)
      printf '.os.targonglobal.com'
      return 0
      ;;
  esac

  error "Unsupported hosted environment for cookie domain: $environment"
  exit 1
}

hosted_app_base_path() {
  case "$app_key" in
    talos) printf '/talos' ;;
    atlas) printf '/atlas' ;;
    xplan) printf '/xplan' ;;
    kairos) printf '/kairos' ;;
    plutus) printf '/plutus' ;;
    hermes) printf '/hermes' ;;
    argus) printf '/argus' ;;
    sso|targon|targonos|website) printf '' ;;
    *)
      error "No hosted base path mapping for $app_key"
      exit 1
      ;;
  esac
}

hosted_app_url() {
  local portal_origin
  portal_origin="$(hosted_portal_origin)"
  local base_path
  base_path="$(hosted_app_base_path)"

  if [[ -z "$base_path" ]]; then
    printf '%s' "$portal_origin"
    return 0
  fi

  printf '%s%s' "$portal_origin" "$base_path"
}

resolve_portal_shared_secret() {
  local sso_dir="$REPO_DIR/apps/sso"
  local candidates=()

  if [[ "$environment" == "dev" ]]; then
    candidates=("$sso_dir/.env.local" "$sso_dir/.env.dev" "$sso_dir/.env.dev.ci" "$sso_dir/.env")
  else
    candidates=("$sso_dir/.env.production" "$sso_dir/.env.local" "$sso_dir/.env")
  fi

  local file
  for file in "${candidates[@]}"; do
    if [[ ! -f "$file" ]]; then
      continue
    fi

    local secret
    secret="$(
      unset PORTAL_AUTH_SECRET NEXTAUTH_SECRET
      load_env_file "$file" >/dev/null
      printf '%s' "${PORTAL_AUTH_SECRET:-${NEXTAUTH_SECRET:-}}"
    )"

    if [[ -n "${secret//[[:space:]]/}" ]]; then
      printf '%s' "$secret"
      return 0
    fi
  done

  return 1
}

apply_hosted_env_overrides() {
  local portal_origin
  portal_origin="$(hosted_portal_origin)"
  local cookie_domain
  cookie_domain="$(hosted_cookie_domain)"

  export COOKIE_DOMAIN="$cookie_domain"

  if [[ "$app_key" == "website" ]]; then
    return 0
  fi

  export PORTAL_AUTH_URL="$portal_origin"
  export NEXT_PUBLIC_PORTAL_AUTH_URL="$portal_origin"
  export PORTAL_APPS_BASE_URL="$portal_origin"
  export NEXT_PUBLIC_PORTAL_APPS_BASE_URL="$portal_origin"

  local app_url
  app_url="$(hosted_app_url)"
  export NEXTAUTH_URL="$app_url"
  export NEXT_PUBLIC_APP_URL="$app_url"
  export BASE_URL="$app_url"

  local shared_secret
  if ! shared_secret="$(resolve_portal_shared_secret)"; then
    error "Unable to resolve hosted portal auth secret from SSO env files"
    exit 1
  fi

  export PORTAL_AUTH_SECRET="$shared_secret"
  export NEXTAUTH_SECRET="$shared_secret"
}

portal_database_name_for_environment() {
  case "$environment" in
    dev)
      printf 'portal_db_dev'
      ;;
    main)
      printf 'portal_db'
      ;;
    *)
      error "Unsupported environment for owner migration database: $environment"
      exit 1
      ;;
  esac
}

migration_owner_role_for_app() {
  case "$app_key" in
    sso|targon|targonos)
      printf 'portal_auth'
      ;;
    atlas)
      printf 'portal_atlas'
      ;;
    xplan|kairos)
      printf 'portal_xplan'
      ;;
    talos|argus)
      printf 'portal_talos'
      ;;
    plutus)
      printf 'portal_plutus'
      ;;
    *)
      error "No owner role mapping for migration-enabled app: $app_key"
      exit 1
      ;;
  esac
}

migration_schema_for_app() {
  case "$app_key:$environment" in
    sso:dev|targon:dev|targonos:dev)
      printf 'auth_dev'
      ;;
    sso:main|targon:main|targonos:main)
      printf 'auth'
      ;;
    atlas:dev)
      printf 'dev_atlas'
      ;;
    atlas:main)
      printf 'atlas'
      ;;
    xplan:dev)
      printf 'dev_xplan'
      ;;
    xplan:main)
      printf 'xplan'
      ;;
    kairos:dev|kairos:main)
      printf 'kairos'
      ;;
    plutus:dev)
      printf 'plutus_dev'
      ;;
    plutus:main)
      printf 'plutus'
      ;;
    argus:dev)
      printf 'argus_dev'
      ;;
    argus:main)
      printf 'main_argus'
      ;;
    *)
      error "No schema mapping for migration-enabled app/environment: $app_key $environment"
      exit 1
      ;;
  esac
}

build_owner_database_url() {
  local owner_role="$1"
  local database_name="$2"
  local schema_name="$3"
  printf 'postgresql://%s@localhost:5432/%s?schema=%s' "$owner_role" "$database_name" "$schema_name"
}

prepare_shared_owner_migration_env() {
  local database_name
  local owner_role
  local schema_name
  database_name="$(portal_database_name_for_environment)"
  owner_role="$(migration_owner_role_for_app)"
  schema_name="$(migration_schema_for_app)"

  case "$app_key" in
    sso|targon|targonos)
      export PORTAL_DB_URL="$(build_owner_database_url "$owner_role" "$database_name" "$schema_name")"
      ;;
    atlas|xplan|kairos|plutus|argus)
      export DATABASE_URL="$(build_owner_database_url "$owner_role" "$database_name" "$schema_name")"
      ;;
    *)
      error "Shared owner migration env is not supported for app: $app_key"
      exit 1
      ;;
  esac
}

prepare_talos_owner_migration_env() {
  if [[ "$app_key" != "talos" ]]; then
    return 0
  fi

  local database_name
  database_name="$(portal_database_name_for_environment)"

  if [[ "$environment" == "dev" ]]; then
    export DATABASE_URL_US="postgresql://portal_talos@localhost:5432/${database_name}?schema=dev_talos_us"
    export DATABASE_URL_UK="postgresql://portal_talos@localhost:5432/${database_name}?schema=dev_talos_uk"
  else
    export DATABASE_URL_US="postgresql://portal_talos@localhost:5432/${database_name}?schema=main_talos_us"
    export DATABASE_URL_UK="postgresql://portal_talos@localhost:5432/${database_name}?schema=main_talos_uk"
  fi

  export DATABASE_URL="$DATABASE_URL_US"
}

prepare_owner_migration_env() {
  case "$app_key" in
    talos)
      prepare_talos_owner_migration_env
      ;;
    sso|targon|targonos|atlas|xplan|kairos|plutus|argus)
      prepare_shared_owner_migration_env
      ;;
    *)
      return 0
      ;;
  esac
}

ensure_app_env_loaded() {
  local candidates=()

  if [[ "$environment" == "dev" ]]; then
    candidates=("$app_dir/.env.local" "$app_dir/.env.dev" "$app_dir/.env.dev.ci" "$app_dir/.env")
  else
    candidates=("$app_dir/.env.production" "$app_dir/.env.local" "$app_dir/.env")
  fi

  local file
  for file in "${candidates[@]}"; do
    if load_env_file "$file"; then
      log "Loaded app env from $(basename "$file")"
      return 0
    fi
  done

  return 1
}

require_non_empty_env_var() {
  local key="$1"
  local value="${!key:-}"

  if [[ -z "${value//[[:space:]]/}" ]]; then
    error "$key is required for argus deployments"
    exit 1
  fi
}

normalize_argus_media_backend() {
  local raw="${ARGUS_MEDIA_BACKEND:-}"

  if [[ -z "${raw//[[:space:]]/}" ]]; then
    printf 'local'
    return 0
  fi

  local normalized
  normalized="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"

  case "$normalized" in
    local | s3)
      printf '%s' "$normalized"
      return 0
      ;;
  esac

  error "Unsupported ARGUS_MEDIA_BACKEND value: $raw"
  exit 1
}

run_argus_prebuild_checks() {
  require_non_empty_env_var "WPR_DATA_DIR"

  local media_backend
  media_backend="$(normalize_argus_media_backend)"

  if [[ "$media_backend" == "s3" ]]; then
    log "Step 5b: Skipping Argus local media repair (backend: s3)"
    return 0
  fi

  log "Step 5b: Repairing Argus local media store"
  cd "$app_dir"
  pnpm exec tsx scripts/repair-local-media.ts
  log "Argus local media store verified"
}

log "=========================================="
log "Starting deployment of $app_key to $environment"
log "Repository: $REPO_DIR"
log "App directory: $app_dir"
log "PM2 process: $pm2_name"
log "=========================================="

# Step 1: Pull latest code
if is_truthy "$skip_git"; then
  log "Step 1: Skipping git update (DEPLOY_SKIP_GIT=$skip_git)"
else
  log "Step 1: Pulling latest code from $BRANCH branch"
  cd "$REPO_DIR"
  git fetch origin "$BRANCH" --prune
  git checkout "$BRANCH"
  if [[ -n "$deploy_git_sha" ]]; then
    log "Step 1: Resetting to pinned commit $deploy_git_sha"
    git reset --hard "$deploy_git_sha"
  else
    git reset --hard "origin/$BRANCH"
  fi
  # Ensure stray, untracked debug artifacts don't break deterministic deployments.
  # (Intentionally does NOT remove ignored files like .env.local.)
  git clean -ffd -e '.next/' -e '.venv/'
  log "Git pull complete"
fi

deploy_runtime_sha="$(git -C "$REPO_DIR" rev-parse HEAD)"
log "Target runtime SHA: $deploy_runtime_sha"

# Step 1.5: Detect what changed in this deploy range (if available)
if compute_changed_files; then
  log "Detected ${#changed_files[@]} changed files for deploy range ${deploy_base_sha:-unknown}..${deploy_head_sha:-unknown}"
else
  warn "Could not determine changed files for this deployment; using safe defaults"
fi

# Step 2: Install dependencies
if is_truthy "$skip_install"; then
  log "Step 2: Skipping dependency install (DEPLOY_SKIP_INSTALL=$skip_install)"
  install_mode="explicit_skip"
else
  deps_changed="true"
  if [[ "$changed_files_available" == "true" ]]; then
    deps_changed="false"
    if any_changed "pnpm-lock.yaml" || any_changed "pnpm-workspace.yaml" || any_changed ".npmrc" || any_changed "package.json" || any_changed "*/package.json"; then
      deps_changed="true"
    fi
  fi

  if [[ "$deps_changed" == "false" && -d "$REPO_DIR/node_modules" ]]; then
    log "Step 2: Skipping dependency install (no dependency changes detected)"
    install_mode="auto_skip"
  else
    log "Step 2: Installing dependencies"
    cd "$REPO_DIR"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    log "Dependencies installed"
    install_mode="run"
  fi
fi

# Optional early exit after git+install (useful for parallel deploy fanout)
if is_truthy "$prep_only"; then
  log "Prep-only mode enabled (DEPLOY_PREP_ONLY=$prep_only); stopping after dependencies step"
  exit 0
fi

if [[ "$app_key" == "sso" || "$app_key" == "targon" || "$app_key" == "targonos" ]]; then
  auth_prisma_changed="false"
  if [[ "$changed_files_available" == "true" ]] && any_changed_under "packages/auth/prisma/"; then
    auth_prisma_changed="true"
  fi

  auth_client_dir="$REPO_DIR/packages/auth/node_modules/.prisma/client-auth"
  auth_client_missing="false"
  if [[ ! -d "$auth_client_dir" ]]; then
    auth_client_missing="true"
  fi

  if [[ "$auth_prisma_changed" == "true" || "$auth_client_missing" == "true" ]]; then
    log "Ensuring portal auth Prisma client is available"

    if [[ "$auth_client_missing" == "true" || "$install_mode" != "run" ]]; then
      if ensure_portal_db_url; then
        cd "$REPO_DIR"
        pnpm --filter @targon/auth prisma:generate
      else
        error "PORTAL_DB_URL is not set and no env file found; cannot generate auth Prisma client"
        exit 1
      fi
    fi

    node "$REPO_DIR/scripts/link-prisma-client-auth.js"

    if [[ ! -d "$REPO_DIR/apps/sso/node_modules/.prisma/client-auth" ]]; then
      error "Auth Prisma client was not linked into SSO node_modules"
      exit 1
    fi
  fi
fi

if [[ "$app_key" == "kairos" ]]; then
  log "Step 2b: Installing Kairos ML service dependencies (Python)"
  if [[ ! -d "$kairos_ml_dir" ]]; then
    error "Kairos ML service directory not found: $kairos_ml_dir"
    exit 1
  fi

  cd "$kairos_ml_dir"

  python_bin=""
  if command -v python3 >/dev/null 2>&1; then
    python_bin="python3"
  elif command -v python >/dev/null 2>&1; then
    python_bin="python"
  else
    error "python3 is required to run the Kairos ML service"
    exit 1
  fi

  "$python_bin" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r requirements.txt

  log "Kairos ML service dependencies installed (port ${kairos_ml_port})"
fi

# Step 3: Generate Prisma client if needed
if [[ -n "$prisma_cmd" ]]; then
  log "Step 3: Generating Prisma client"
  cd "$REPO_DIR"
  eval "$prisma_cmd" || warn "Prisma generate had warnings"
  log "Prisma client generated"
else
  log "Step 3: Skipping Prisma generation (not needed)"
fi

# Step 3b: Apply Prisma migrations if needed
if [[ -n "$migrate_cmd" ]]; then
  log "Step 3b: Stopping $pm2_name before migrations"
  pm2 stop "$pm2_name" 2>/dev/null || warn "$pm2_name was not running before migrations"

  log "Step 3b: Applying Prisma migrations"
  migration_env_ready="false"
  case "$app_key" in
    sso|targon|targonos)
      if ensure_portal_db_url; then
        migration_env_ready="true"
      fi
      ;;
    *)
      if ensure_database_url; then
        migration_env_ready="true"
      fi
      ;;
  esac

  if [[ "$migration_env_ready" == "true" ]]; then
    cd "$REPO_DIR"
    prepare_owner_migration_env
    if [[ "$app_key" == "atlas" && "$environment" == "dev" ]]; then
      eval "$migrate_cmd"
      log "Migrations applied"
    else
      eval "$migrate_cmd"
      log "Migrations applied"
    fi
  else
    case "$app_key" in
      sso|targon|targonos)
        error "PORTAL_DB_URL is not set and no env file found; cannot apply auth migrations"
        ;;
      *)
        error "DATABASE_URL is not set and no env file found; cannot apply migrations"
        ;;
    esac
    exit 1
  fi
else
  log "Step 3b: Skipping Prisma migrations (not needed)"
fi

# Step 4: Stop PM2 app
log "Step 4: Stopping $pm2_name"
pm2 stop "$pm2_name" 2>/dev/null || warn "$pm2_name was not running"

if [[ "$app_key" == "kairos" ]]; then
  log "Step 4: Stopping $kairos_ml_pm2_name"
  pm2 stop "$kairos_ml_pm2_name" 2>/dev/null || warn "$kairos_ml_pm2_name was not running"
fi

# Step 5: Clear build caches (optional; default is preserve for speed)
clear_caches="${DEPLOY_CLEAR_CACHES:-false}"
if is_truthy "$clear_caches"; then
  log "Step 5: Clearing build caches (DEPLOY_CLEAR_CACHES=$clear_caches)"
  rm -rf "$app_dir/.turbo" \
         "$app_dir/.cache" \
         "$app_dir/.swc" \
         "$app_dir/node_modules/.cache" \
         2>/dev/null || true
  log "Caches cleared"
else
  log "Step 5: Preserving build caches for faster builds"
fi

# Step 6: Build the app
log "Step 6: Building $app_key"
cd "$REPO_DIR"

if ! ensure_app_env_loaded; then
  error "No env file found for $app_key ($environment); cannot build"
  exit 1
fi

apply_build_metadata_env
apply_hosted_env_overrides

if [[ "$app_key" == "argus" ]]; then
  run_argus_prebuild_checks
fi

set +e
(
  export NODE_ENV=production
  eval "$build_cmd"
)
build_status=$?
set -e

if [[ "$build_status" -ne 0 ]]; then
  error "Build failed (exit code $build_status)"

  should_retry_with_install="false"
  if [[ "$install_mode" == "auto_skip" || "$install_mode" == "explicit_skip" ]]; then
    should_retry_with_install="true"
  fi

  if [[ "$should_retry_with_install" == "true" ]]; then
    if [[ "$install_mode" == "auto_skip" ]]; then
      warn "Retrying once after running pnpm install (initial install was auto-skipped)"
    else
      warn "Retrying once after running pnpm install (initial install was explicitly skipped)"
    fi
    cd "$REPO_DIR"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
    install_mode="run"

    if ! is_truthy "$clear_caches"; then
      warn "Clearing caches before retry"
      rm -rf "$app_dir/.turbo" \
             "$app_dir/.cache" \
             "$app_dir/.swc" \
             "$app_dir/node_modules/.cache" \
             2>/dev/null || true
    fi

    set +e
    (
      export NODE_ENV=production
      eval "$build_cmd"
    )
    build_status=$?
    set -e
  fi
fi

if [[ "$build_status" -ne 0 ]]; then
  error "Build failed after retry (exit code $build_status)"
  exit "$build_status"
fi

log "Build complete"

# Step 7: Restart PM2 app
if [[ "$app_key" == "kairos" ]]; then
  export KAIROS_ML_URL="http://127.0.0.1:${kairos_ml_port}"
  log "Step 7: Using KAIROS_ML_URL=${KAIROS_ML_URL}"

  log "Step 7: Starting $kairos_ml_pm2_name"
  start_and_verify_pm2_process "$kairos_ml_pm2_name" "$kairos_ml_dir" "$deploy_runtime_sha"
  log "$kairos_ml_pm2_name started and verified"
fi

log "Step 7: Starting $pm2_name"
start_and_verify_pm2_process "$pm2_name" "$app_dir" "$deploy_runtime_sha"
log "$pm2_name started and verified"

if [[ "$app_key" == "hermes" ]]; then
  hermes_workers=("${PM2_PREFIX}-hermes-orders-sync" "${PM2_PREFIX}-hermes-request-review")
  for worker in "${hermes_workers[@]}"; do
    log "Step 7: Starting $worker"
    start_and_verify_pm2_process "$worker" "$app_dir" "$deploy_runtime_sha"
    log "$worker started and verified"
  done
fi

if [[ "$app_key" == "plutus" ]]; then
  plutus_workers=("${PM2_PREFIX}-plutus-cashflow-refresh" "${PM2_PREFIX}-plutus-settlement-sync")
  for worker in "${plutus_workers[@]}"; do
    log "Step 7: Starting $worker"
    start_and_verify_pm2_process "$worker" "$app_dir" "$deploy_runtime_sha"
    log "$worker started and verified"
  done
fi

# Step 8: Save PM2 state
if is_truthy "$skip_pm2_save"; then
  log "Step 8: Skipping PM2 save (DEPLOY_SKIP_PM2_SAVE=$skip_pm2_save)"
else
  log "Step 8: Saving PM2 state"
  pm2 save
  log "PM2 state saved"
fi

log "=========================================="
log "Deployment complete for $app_key to $environment"
log "=========================================="
