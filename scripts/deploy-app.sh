#!/usr/bin/env bash
# Deploy script for CI/CD - pulls, clears caches, builds, and restarts an app
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: deploy-app.sh <app-key> <environment>" >&2
  echo "  app-key: talos, sso, website, xplan, kairos, atlas, plutus" >&2
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
  for file in "${changed_files[@]}"; do
    if [[ "$file" == $pattern ]]; then
      return 0
    fi
  done
  return 1
}

any_changed_under() {
  local prefix="$1"
  local file
  for file in "${changed_files[@]}"; do
    if [[ "$file" == "$prefix"* ]]; then
      return 0
    fi
  done
  return 1
}

skip_git="${DEPLOY_SKIP_GIT:-false}"
skip_install="${DEPLOY_SKIP_INSTALL:-false}"
skip_pm2_save="${DEPLOY_SKIP_PM2_SAVE:-false}"
prep_only="${DEPLOY_PREP_ONLY:-false}"
deploy_git_sha="${DEPLOY_GIT_SHA:-}"
deploy_base_sha="${DEPLOY_BASE_SHA:-}"
deploy_head_sha="${DEPLOY_HEAD_SHA:-}"
migrate_cmd=""
install_mode=""
changed_files_available="false"
changed_files=()
ZERO_SHA="0000000000000000000000000000000000000000"

# Determine directories based on environment
if [[ "$environment" == "dev" ]]; then
  REPO_DIR="${TARGONOS_DEV_DIR:-${TARGON_DEV_DIR:-}}"
  PM2_PREFIX="dev"
  BRANCH="dev"
elif [[ "$environment" == "main" ]]; then
  REPO_DIR="${TARGONOS_MAIN_DIR:-${TARGON_MAIN_DIR:-}}"
  PM2_PREFIX="main"
  BRANCH="main"
else
  echo "Unknown environment: $environment" >&2
  exit 1
fi

if [[ -z "$REPO_DIR" ]]; then
  echo "Missing repo directory for environment \"$environment\"." >&2
  echo "Set TARGONOS_DEV_DIR/TARGONOS_MAIN_DIR (or legacy TARGON_DEV_DIR/TARGON_MAIN_DIR)." >&2
  exit 1
fi

if [[ ! -d "$REPO_DIR" ]]; then
  echo "Repo directory does not exist: $REPO_DIR" >&2
  exit 1
fi

# Map app keys to workspace names and directories
case "$app_key" in
  talos)
    workspace="@targon/talos"
    app_dir="$REPO_DIR/apps/talos"
    pm2_name="${PM2_PREFIX}-talos"
    prisma_cmd="pnpm --filter $workspace db:generate"
    migrate_cmd="pnpm --filter $workspace db:migrate:tenant-schema && pnpm --filter $workspace db:migrate:sku-dimensions && pnpm --filter $workspace db:migrate:sku-reference-fee-columns && pnpm --filter $workspace db:migrate:sku-subcategory && pnpm --filter $workspace db:migrate:sku-batch-attributes && pnpm --filter $workspace db:migrate:sku-batch-amazon-defaults && pnpm --filter $workspace db:migrate:sku-batch-amazon-item-package-dimensions && pnpm --filter $workspace db:migrate:sku-amazon-reference-weight && pnpm --filter $workspace db:migrate:sku-amazon-listing-price && pnpm --filter $workspace db:migrate:sku-amazon-categories && pnpm --filter $workspace db:migrate:sku-amazon-item-dimensions && pnpm --filter $workspace db:migrate:supplier-defaults && pnpm --filter $workspace db:migrate:warehouse-sku-storage-configs && pnpm --filter $workspace db:migrate:purchase-order-documents && pnpm --filter $workspace db:migrate:fulfillment-orders-foundation && pnpm --filter $workspace db:migrate:fulfillment-orders-amazon-fields"
    build_cmd="pnpm --filter $workspace build"
    ;;
  sso|targon|targonos)
    workspace="@targon/sso"
    app_dir="$REPO_DIR/apps/sso"
    pm2_name="${PM2_PREFIX}-targonos"
    prisma_cmd=""
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

  # Match Next.js env precedence: .env.local overrides everything in production.
  local candidates=("$app_dir/.env.local" "$app_dir/.env.production" "$app_dir/.env.dev" "$app_dir/.env")

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
  local candidates=("$sso_dir/.env.local" "$sso_dir/.env.production" "$sso_dir/.env.dev" "$sso_dir/.env")
  local file

  for file in "${candidates[@]}"; do
    if load_env_file "$file" && [[ -n "${PORTAL_DB_URL:-}" ]]; then
      log "Loaded PORTAL_DB_URL from $(basename "$file")"
      return 0
    fi
  done

  return 1
}

ensure_app_env_loaded() {
  local candidates=()

  if [[ "$environment" == "dev" ]]; then
    candidates=("$app_dir/.env.local" "$app_dir/.env.dev" "$app_dir/.env.dev.ci" "$app_dir/.env")
  else
    candidates=("$app_dir/.env.local" "$app_dir/.env.production" "$app_dir/.env")
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
  log "Git pull complete"
fi

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
  run_prisma_generate="true"
  if [[ "$changed_files_available" == "true" ]]; then
    run_prisma_generate="false"
    case "$app_key" in
      talos)
        if any_changed "apps/talos/prisma/schema.prisma" && ! any_changed_under "packages/prisma-talos/generated/"; then
          run_prisma_generate="true"
        fi
        ;;
      xplan)
        if any_changed "apps/xplan/prisma/schema.prisma" && ! any_changed_under "packages/prisma-xplan/generated/"; then
          run_prisma_generate="true"
        fi
        ;;
      kairos)
        if any_changed "apps/kairos/prisma/schema.prisma" && ! any_changed_under "packages/prisma-kairos/generated/"; then
          run_prisma_generate="true"
        fi
        ;;
      atlas)
        if any_changed "apps/atlas/prisma/schema.prisma" && ! any_changed_under "packages/prisma-atlas/generated/"; then
          run_prisma_generate="true"
        fi
        ;;
    esac
  fi

  if [[ "$run_prisma_generate" == "true" ]]; then
    log "Step 3: Generating Prisma client"
    cd "$REPO_DIR"
    eval "$prisma_cmd" || warn "Prisma generate had warnings"
    log "Prisma client generated"
  else
    log "Step 3: Skipping Prisma generation (no Prisma schema changes detected)"
  fi
else
  log "Step 3: Skipping Prisma generation (not needed)"
fi

# Step 3b: Apply Prisma migrations if needed
if [[ -n "$migrate_cmd" ]]; then
  run_migrations="true"
  if [[ "$changed_files_available" == "true" ]]; then
    run_migrations="false"
    case "$app_key" in
      talos)
        if any_changed "apps/talos/prisma/schema.prisma" || any_changed_under "apps/talos/scripts/migrations/"; then
          run_migrations="true"
        fi
        ;;
      plutus)
        run_migrations="true"
        ;;
      xplan)
        if any_changed "apps/xplan/prisma/schema.prisma" || any_changed_under "apps/xplan/prisma/migrations/"; then
          run_migrations="true"
        fi
        ;;
      kairos)
        if any_changed "apps/kairos/prisma/schema.prisma" || any_changed_under "apps/kairos/prisma/migrations/"; then
          run_migrations="true"
        fi
        ;;
      atlas)
        if any_changed "apps/atlas/prisma/schema.prisma" || any_changed_under "apps/atlas/prisma/migrations/"; then
          run_migrations="true"
        fi
        ;;
    esac
  fi

  if [[ "$run_migrations" == "true" ]]; then
    log "Step 3b: Applying Prisma migrations"
    if ensure_database_url; then
      cd "$REPO_DIR"
      if [[ "$app_key" == "atlas" && "$environment" == "dev" ]]; then
        if eval "$migrate_cmd"; then
          log "Migrations applied"
        else
          warn "Prisma migrate deploy failed for atlas dev; falling back to non-destructive db push"
          if eval "cd $app_dir && pnpm exec prisma db push --schema prisma/schema.prisma --skip-generate"; then
            log "Database schema synced"
          else
            error "Prisma db push failed for atlas dev; aborting deployment to avoid a broken app"
            exit 1
          fi
        fi
      else
        eval "$migrate_cmd"
        log "Migrations applied"
      fi
    else
      error "DATABASE_URL is not set and no env file found; cannot apply migrations"
      exit 1
    fi
  else
    log "Step 3b: Skipping Prisma migrations (no migration changes detected)"
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

set +e
(
  export NODE_ENV=production
  eval "$build_cmd"
)
build_status=$?
set -e

if [[ "$build_status" -ne 0 ]]; then
  error "Build failed (exit code $build_status)"

  if [[ "$install_mode" == "auto_skip" ]]; then
    warn "Retrying once after running pnpm install (initial install was auto-skipped)"
    cd "$REPO_DIR"
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install

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
  CI= \
  GITHUB_ACTIONS= \
  GITHUB_PERSONAL_ACCESS_TOKEN= \
  GITHUB_TOKEN= \
  GH_TOKEN= \
  GEMINI_API_KEY= \
  CLAUDECODE= \
  CLAUDE_CODE_ENTRYPOINT= \
  CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
  pm2 start "$kairos_ml_pm2_name" --update-env 2>/dev/null || \
  CI= \
  GITHUB_ACTIONS= \
  GITHUB_PERSONAL_ACCESS_TOKEN= \
  GITHUB_TOKEN= \
  GH_TOKEN= \
  GEMINI_API_KEY= \
  CLAUDECODE= \
  CLAUDE_CODE_ENTRYPOINT= \
  CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
  pm2 restart "$kairos_ml_pm2_name" --update-env 2>/dev/null || \
  CI= \
  GITHUB_ACTIONS= \
  GITHUB_PERSONAL_ACCESS_TOKEN= \
  GITHUB_TOKEN= \
  GH_TOKEN= \
  GEMINI_API_KEY= \
  CLAUDECODE= \
  CLAUDE_CODE_ENTRYPOINT= \
  CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
  pm2 start "$REPO_DIR/ecosystem.config.js" --only "$kairos_ml_pm2_name" --update-env
  log "$kairos_ml_pm2_name started"
fi

log "Step 7: Starting $pm2_name"
CI= \
GITHUB_ACTIONS= \
GITHUB_PERSONAL_ACCESS_TOKEN= \
GITHUB_TOKEN= \
GH_TOKEN= \
GEMINI_API_KEY= \
CLAUDECODE= \
CLAUDE_CODE_ENTRYPOINT= \
CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
pm2 start "$pm2_name" --update-env 2>/dev/null || \
CI= \
GITHUB_ACTIONS= \
GITHUB_PERSONAL_ACCESS_TOKEN= \
GITHUB_TOKEN= \
GH_TOKEN= \
GEMINI_API_KEY= \
CLAUDECODE= \
CLAUDE_CODE_ENTRYPOINT= \
CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
pm2 restart "$pm2_name" --update-env 2>/dev/null || \
CI= \
GITHUB_ACTIONS= \
GITHUB_PERSONAL_ACCESS_TOKEN= \
GITHUB_TOKEN= \
GH_TOKEN= \
GEMINI_API_KEY= \
CLAUDECODE= \
CLAUDE_CODE_ENTRYPOINT= \
CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
pm2 start "$REPO_DIR/ecosystem.config.js" --only "$pm2_name" --update-env
log "$pm2_name started"

if [[ "$app_key" == "hermes" ]]; then
  hermes_workers=("${PM2_PREFIX}-hermes-orders-sync" "${PM2_PREFIX}-hermes-request-review")
  for worker in "${hermes_workers[@]}"; do
    log "Step 7: Starting $worker"
    CI= \
    GITHUB_ACTIONS= \
    GITHUB_PERSONAL_ACCESS_TOKEN= \
    GITHUB_TOKEN= \
    GH_TOKEN= \
    GEMINI_API_KEY= \
    CLAUDECODE= \
    CLAUDE_CODE_ENTRYPOINT= \
    CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
    pm2 start "$worker" --update-env 2>/dev/null || \
    CI= \
    GITHUB_ACTIONS= \
    GITHUB_PERSONAL_ACCESS_TOKEN= \
    GITHUB_TOKEN= \
    GH_TOKEN= \
    GEMINI_API_KEY= \
    CLAUDECODE= \
    CLAUDE_CODE_ENTRYPOINT= \
    CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
    pm2 restart "$worker" --update-env 2>/dev/null || \
    CI= \
    GITHUB_ACTIONS= \
    GITHUB_PERSONAL_ACCESS_TOKEN= \
    GITHUB_TOKEN= \
    GH_TOKEN= \
    GEMINI_API_KEY= \
    CLAUDECODE= \
    CLAUDE_CODE_ENTRYPOINT= \
    CLAUDE_CODE_MAX_OUTPUT_TOKENS= \
    pm2 start "$REPO_DIR/ecosystem.config.js" --only "$worker" --update-env
    log "$worker started"
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
