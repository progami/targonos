# TargonOS

TargonOS is a pnpm + Turborepo monorepo for Targon's internal apps and website.

## Apps

| App | Workspace | Base path |
| --- | --- | --- |
| Portal / SSO | `@targon/sso` | `/` |
| Talos | `@targon/talos` | `/talos` |
| Website | `@targon/website` | `/` |
| Atlas | `@targon/atlas` | `/atlas` |
| xPlan | `@targon/xplan` | `/xplan` |
| Kairos | `@targon/kairos` | `/kairos` |
| Plutus | `@targon/plutus` | `/plutus` |
| Hermes | `@targon/hermes` | `/hermes` |
| Argus | `@targon/argus` | `/argus` |

## Local development

You need:

- Node 20+
- `pnpm`
- Redis for Talos
- dev DB access on `localhost:6432`
- app `.env.local` files

Install once:

```bash
corepack enable
pnpm install
```

Run only what you need:

```bash
pnpm --filter @targon/sso dev
pnpm --filter @targon/talos dev
pnpm --filter @targon/website dev
pnpm --filter @targon/atlas dev
pnpm --filter @targon/xplan dev
pnpm --filter @targon/kairos dev
pnpm --filter @targon/plutus dev
pnpm --filter @targon/hermes dev
pnpm --filter @targon/argus dev
```

Local apps read `PORT` from their env file. If `PORT` is missing, the app script falls back to its legacy default.

Local development uses dev data, not main data. Most apps use `portal_db_dev` on `localhost:6432`. Talos uses `dev_talos_us` and `dev_talos_uk`.

## Codex worktrees

Use the Codex environment `worktree app (dev-os sso)` when creating a worktree.

Worktree setup automatically:

- assigns a unique `41xxx` port block
- writes `.codex/generated/dev.worktree.apps.json`
- materializes worktree-local env files
- runs install and Prisma generation
- seeds the worktree dev user
- starts Portal / SSO and all apps in the background

After setup, the worktree is already running. Worktree URLs come from `.codex/generated/dev.worktree.apps.json`.

## Git flow

- do not push directly to `dev` or `main`
- create a feature branch for the work
- open a PR from the feature branch into `dev`
- wait for CI on the `dev` PR
- merge into `dev`
- open a release PR from `dev` into `main`
- wait for CI on the `main` PR
- merge into `main`

The repo enforces PRs for protected branches, and PRs into `main` must come from `dev`.

## Common commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm codex:env
```

## Troubleshooting

- If `localhost:6432` is down, fix the dev DB tunnel/access first.
- If Talos fails on CSRF or session setup, check Redis.
- If Prisma fails, generate the client for the affected workspace.
- Worktree logs are in `.codex/generated/runtime/`.
SSO must be running for authentication to work. Start it first, then any app you're working on:

```bash
# Terminal 1 — SSO (must start first, on 3200)
pnpm --filter @targon/sso exec next dev -p 3200

# Terminal 2 — whichever app you're working on
pnpm --filter @targon/talos exec next dev -p 3201
pnpm --filter @targon/website exec next dev -p 3205
pnpm --filter @targon/atlas exec next dev --webpack -p 3206
pnpm --filter @targon/xplan exec next dev -p 3208
pnpm --filter @targon/kairos exec next dev -p 3210
pnpm --filter @targon/plutus exec next dev -p 3212
pnpm --filter @targon/hermes exec next dev -p 3214
pnpm --filter @targon/argus exec next dev -p 3216
```

### 6. Access

1. Open `http://localhost:3200` — SSO login page
2. Sign in with your `@targonglobal.com` Google account
3. Navigate to the app you're working on (e.g., `http://localhost:3201/talos` for Talos)

### 7. Optional local auth bypass (localhost only)

When you want to work on an app UI/API flow without logging in through SSO each time, set one of these in that app's `.env.local`:

```env
ALLOW_DEV_AUTH_SESSION_BYPASS=1
# or
ALLOW_DEV_AUTH_DEFAULTS=true
```

Then restart the app's dev server. In non-production, app middleware will skip portal entry checks when either flag is enabled.
This only affects local development because the bypass is gated by `NODE_ENV !== 'production'`.

### Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `cloudflared` connection drops | Tunnel host machine may be offline | Confirm with team that the host is running, then restart `cloudflared access tcp ...` |
| `/talos/talos` double path | `BASE_PATH` is set in `.env.local` | Remove `BASE_PATH` and `NEXT_PUBLIC_BASE_PATH` from your Talos `.env.local` |
| "no matching decryption secret" | Auth secret mismatch between SSO and app | Ensure `NEXTAUTH_SECRET` and `PORTAL_AUTH_SECRET` are identical across all `.env.local` files |
| "User region US does not match tenant UK" | `PRISMA_SCHEMA` is set | Remove `PRISMA_SCHEMA` from your Talos `.env.local` — it overrides all tenant schemas |
| "Your account is not allowed to sign in" | DB connection limit hit or missing permissions | Ask team to check `portal_dev_external` connection limit and `auth_dev` schema grants |
| Redis connection error | Redis not running | `brew services start redis` |
| Prisma errors on startup | Prisma client not generated | Run `pnpm --filter <workspace> exec prisma generate` |

## CI/CD (GitHub Actions)

### CI (PR checks)

Workflow: `.github/workflows/ci.yml`

- Runs on `pull_request`
- Uses `ubuntu-latest` as the required PR path; the self-hosted macOS lane is manual-only for live hosted auth smoke (`workflow_dispatch`)
- Runs the full Linux validation path on normal PRs and on `push` to `dev`
- Installs via pnpm and populates `.env.dev`/`.env.local` from `*.env.dev.ci` templates
- Verifies committed CI env files still point at the dev hosted stack (`scripts/verify-ci-env-contracts.mjs`) before build/test work starts
- Verifies workspace `package.json` versions are kept in sync (root is the source of truth)
- Generates Prisma clients
- Lints / type-checks / builds only the workspaces changed in the PR (via `APP_CHANGED_SINCE` + turbo filters)
- Runs auth contract coverage in CI
- Treats `dev -> main` as a promotion gate: the PR checks require the exact `dev` SHA to already have a successful `push` CI run instead of re-running the full validation stack

### CD (deploy to the laptop)

Workflow: `.github/workflows/cd.yml`

- Triggers on `push` to `dev` or `main` and runs deploy steps on a `self-hosted` GitHub Actions runner on the laptop (`~/actions-runner`).
- Detects which apps/packages changed and deploys only what’s necessary.
- Uses `scripts/deploy-app.sh` to:
  - sync the correct worktree (`$TARGONOS_DEV_DIR` or `$TARGONOS_MAIN_DIR`)
  - run `pnpm install` (once per deploy run)
  - build the app(s)
  - restart the matching PM2 process(es)
  - run `pm2 save` once at the end
- After `dev` deploys, runs a non-blocking hosted auth health smoke against `https://dev-os.targonglobal.com` on the self-hosted runner so live-environment regressions are checked post-deploy instead of blocking every PR
- On `main`, computes a semver tag from commit messages and creates a GitHub Release (tags the exact `main` commit SHA even though the repo default branch is `dev`).

### Branch / PR policy

- All work merges into `dev` via PR.
- Production releases are PRs from `dev` → `main` (enforced by `.github/workflows/pr-policy-main-from-dev.yml`).
- Direct pushes to `dev`/`main` are blocked (`.github/workflows/block-direct-push.yml`).
- After merging *non-release* PRs to `main` (i.e., head branch is not `dev`), an automation opens a sync PR `main → dev` (`.github/workflows/auto-sync-dev.yml`).

## Operations (laptop hosting)

### PM2

```bash
pm2 status
pm2 logs main-targonos --lines 100
pm2 restart dev-targonos dev-talos dev-xplan dev-atlas dev-website --update-env
pm2 restart main-targonos main-talos main-xplan main-atlas main-website --update-env
pm2 save
```

### Tunnel health (Cloudflare Error 1033)

The laptop host uses a Targon-owned LaunchAgent, not the Homebrew `cloudflared`
service. The LaunchAgent must run the named tunnel, not the bare binary:

```bash
launchctl print gui/$UID/com.targonglobal.cloudflared-tunnel
```

`cloudflared` exports a fixed readiness endpoint on `127.0.0.1:20241`:

```bash
curl -fsS http://127.0.0.1:20241/ready
```

If it’s unhealthy:

```bash
launchctl kickstart -k gui/$UID/com.targonglobal.cloudflared-tunnel
```

Install the tunnel service and watchdog:

```bash
scripts/install-cloudflared-tunnel-macos.sh
scripts/install-cloudflared-watchdog-macos.sh
```

Full host verification:

```bash
node scripts/verify-host-stack.mjs --env all
```

### Common failure modes

- `502 Bad Gateway`: check nginx (`brew services list`) and the target PM2 process (`pm2 status`, `pm2 logs <name>`).
- `530` / Cloudflare `1033`: check `com.targonglobal.cloudflared-tunnel`, `127.0.0.1:20241/ready`, and `cloudflared tunnel info cdb60dd3-b875-4735-9f5d-21ebc0f42b46`.
- NextAuth `UntrustedHost`: set `AUTH_TRUST_HOST=true` and ensure nginx forwards `X-Forwarded-*` headers.
- Cookies not shared across apps: ensure `COOKIE_DOMAIN` matches the portal environment scope (`.os.targonglobal.com` for main, `.dev-os.targonglobal.com` for dev) and that all apps share `PORTAL_AUTH_SECRET`.
