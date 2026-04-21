#!/usr/bin/env bash
set -euo pipefail

ROOT="${CODEX_WORKTREE_PATH:?CODEX_WORKTREE_PATH is required}"
SOURCE_ROOT="${CODEX_SOURCE_TREE_PATH:?CODEX_SOURCE_TREE_PATH is required}"
OVERRIDES_FILE="$SOURCE_ROOT/.codex/worktree-overrides.txt"

sync_worktree() {
  if git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
    git -C "$ROOT" pull --ff-only
  fi
}

sync_worktree_overrides() {
  if [ ! -f "$OVERRIDES_FILE" ]; then
    echo "Missing worktree override file: $OVERRIDES_FILE" >&2
    exit 1
  fi

  rsync -a --relative --files-from="$OVERRIDES_FILE" "$SOURCE_ROOT"/ "$ROOT"/
}

apps=(
  sso
  talos
  website
  kairos
  atlas
  xplan
  plutus
  hermes
  argus
)

for app in "${apps[@]}"; do
  source_env="$SOURCE_ROOT/.codex/env-templates/$app.env.local"
  target_env="$ROOT/apps/$app/.env.local"

  if [ ! -f "$source_env" ]; then
    echo "Missing source env file: $source_env" >&2
    exit 1
  fi

  ln -snf "$source_env" "$target_env"
done

cd "$ROOT"

sync_worktree_overrides
sync_worktree

node "$SOURCE_ROOT/.codex/scripts/worktree-ports.mjs" assign "$SOURCE_ROOT" "$ROOT"
node scripts/setup-codex-env.mjs

pnpm install

pnpm --filter @targon/auth prisma:generate
pnpm --filter @targon/talos db:generate
pnpm --filter @targon/xplan prisma:generate
pnpm --filter @targon/atlas db:generate
pnpm --filter @targon/kairos prisma:generate
pnpm --filter @targon/plutus db:generate
pnpm --filter @targon/argus exec prisma generate --schema prisma/schema.prisma

rm -rf apps/sso/node_modules/.prisma/client-auth
mkdir -p apps/sso/node_modules/.prisma
cp -R packages/auth/node_modules/.prisma/client-auth apps/sso/node_modules/.prisma/client-auth

pnpm --filter @targon/auth build
pnpm --filter @targon/logger build
pnpm --filter @targon/config build
pnpm --filter @targon/ledger build

if [ ! -d services/kairos-ml/.venv ]; then
  python3 -m venv services/kairos-ml/.venv
fi

services/kairos-ml/.venv/bin/python -m pip install -r services/kairos-ml/requirements.txt

node "$SOURCE_ROOT/.codex/scripts/ensure-worktree-db-ready.mjs"
node scripts/ensure-worktree-dev-user.mjs
"$SOURCE_ROOT/.codex/scripts/start-worktree-stack.sh"
