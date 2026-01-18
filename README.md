# TargonOS

TargonOS is a pnpm + Turborepo monorepo that powers Targon Global’s internal products and public-facing web properties. The codebase runs multiple independent Next.js apps (Portal, Talos, X‑Plan, Atlas, Plutus, Website) with shared authentication and shared libraries.

This repo is currently hosted from a macOS laptop for development and “live” environments (main + dev). The hosting setup is documented here so it’s reproducible and debuggable.

## Architecture (End-to-end)

```text
User Browser
  ↓
Cloudflare (DNS + Edge)
  ↓
cloudflared (Tunnel on laptop)
  ↓
nginx (local reverse proxy; hostname + path routing)
  ↓
PM2 (process manager)
  ↓
Next.js apps (ports 30xx main / 31xx dev)
  ↓
PostgreSQL (5432) + Redis (6379) + external APIs (S3, etc.)
```

### Public hostnames (via Cloudflare Tunnel)

Cloudflared routes hostnames to local nginx listener ports (`~/.cloudflared/config.yml`):

| Hostname | Purpose | Origin |
| --- | --- | --- |
| `targonos.targonglobal.com` | Main Portal (+ `/talos`, `/x-plan`, `/atlas`) | `http://localhost:8080` |
| `dev-targonos.targonglobal.com` | Dev Portal (+ `/talos`, `/x-plan`, `/atlas`) | `http://localhost:8081` |
| `www.targonglobal.com` / `targonglobal.com` | Main Website | `http://localhost:8082` |
| `dev.targonglobal.com` | Dev Website | `http://localhost:8083` |
| `db.targonglobal.com` | PostgreSQL (TCP) | `tcp://localhost:5432` |

nginx then routes paths to the correct app ports (macOS/Homebrew default path: `/opt/homebrew/etc/nginx/servers/targonos.conf`):

- Main: `3000` (portal), `3001` (talos), `3005` (website), `3006` (atlas), `3008` (x-plan), `3010` (kairos), `3012` (plutus)
- Dev: `3100` (portal), `3101` (talos), `3105` (website), `3106` (atlas), `3108` (x-plan), `3110` (kairos), `3112` (plutus)

### “Two environments” on one host

The laptop keeps two long-lived working directories (“worktrees”) so `dev` and `main` can be running at the same time:

| Directory | Branch | Environment | App ports |
| --- | --- | --- | --- |
| `~/targonos-dev` | `dev` | Dev | `31xx` |
| `~/targonos-main` | `main` | Main | `30xx` |

PM2 process definitions live in `ecosystem.config.js` and reference these directories via `TARGONOS_DEV_DIR` / `TARGONOS_MAIN_DIR`.

## Monorepo layout

```text
apps/
  sso/          # Portal (auth + navigation hub)
  talos/        # Warehouse Management (custom server.js)
  x-plan/       # X‑Plan (Next.js app)
  atlas/         # Atlas (Next.js app)
  plutus/       # Plutus (Next.js app)
  website/      # Marketing site
  archived/     # Historical apps (excluded from pnpm workspace)
packages/
  auth/         # Shared NextAuth + session helpers
  theme/        # Design tokens + Tailwind theme helpers
  ui/           # Shared UI primitives
  prisma-*/     # Generated Prisma clients per app
scripts/        # CI/CD + operational helpers
```

`apps/archived/*` is excluded from the pnpm workspace (`pnpm-workspace.yaml`). App “lifecycles” are tracked in `app-manifest.json` for tooling and portal navigation.

## Apps

All product apps are Next.js 16 + React 19 and are designed to run either standalone (local dev) or behind nginx under a base path.

| App | Workspace | Base path | Notes |
| --- | --- | --- | --- |
| Portal | `@targon/sso` | `/` | Central auth (NextAuth v5) + app navigation |
| Talos | `@targon/talos` | `/talos` | Uses `apps/talos/server.js`, Redis, and S3 presigned uploads |
| xplan | `@targon/xplan` | `/xplan` | Prisma schema `xplan`; vitest tests |
| Atlas | `@targon/atlas` | `/atlas` | Prisma schema `atlas`; Playwright tests |
| Plutus | `@targon/plutus` | `/plutus` | Finance workspace (FCC rebrand); scaffold-only |
| Website | `@targon/website` | `/` | Separate hostname (`targonglobal.com`) |

## Authentication model (Portal as the source of truth)

- The portal (`apps/sso`) is the canonical NextAuth app; other apps validate the portal session.
- Cookie domain is shared (`COOKIE_DOMAIN=.targonglobal.com`) so a user signs in once and can use multiple apps.
- Shared secret: `PORTAL_AUTH_SECRET` (and/or `NEXTAUTH_SECRET`) must match across apps.
- Reverse proxy support: nginx forwards `X-Forwarded-Host` / `X-Forwarded-Proto`; NextAuth v5 requires `AUTH_TRUST_HOST=true` behind a proxy.
- The shared library `@targon/auth` includes helpers for consistent cookie naming and session checks (JWT decode + portal `/api/auth/session` probe).

## Data/services

- PostgreSQL runs locally (Homebrew `postgresql@14`), exposed on `localhost:5432` and optionally via `db.targonglobal.com` through the tunnel.
- Schemas are per-app (and per-environment): `auth`, `talos`, `xplan`, `atlas` (dev schemas may be prefixed `dev_*` depending on env).
- Prisma clients are generated into `packages/prisma-*` and imported by apps (e.g., `@targon/prisma-talos`).
- Redis runs locally (Homebrew `redis`) and is used by Talos.

## Environment configuration (high level)

`.env*` files are gitignored; CI uses committed `*.env.dev.ci` templates for builds. In hosted mode (PM2), apps run with `NODE_ENV=production` and rely on `.env.local` / `.env.production` being present per app.

Common variables across apps:

- `PORT`, `HOST`
- `BASE_PATH`, `NEXT_PUBLIC_BASE_PATH` (for path-based apps like `/talos`, `/x-plan`, `/atlas`)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `PORTAL_AUTH_URL`, `NEXT_PUBLIC_PORTAL_AUTH_URL`, `PORTAL_AUTH_SECRET`
- `COOKIE_DOMAIN`
- `DATABASE_URL` (Postgres)
- `REDIS_URL` (Talos)

Portal app-link configuration:

- `PORTAL_APPS_CONFIG` points at a JSON file (example: `dev.local.apps.json`) that tells the portal where each child app lives in dev.

## Local development

### Prerequisites

- Node.js `>= 20` (repo uses Node 20 in CI)
- pnpm via Corepack (`corepack enable`)
- PostgreSQL + Redis (only needed for flows that hit them)

### Install

```bash
pnpm install
```

### Run (dev mode)

```bash
# All apps (parallel)
pnpm dev

# Single app
pnpm --filter @targon/sso dev
pnpm --filter @targon/talos dev
pnpm --filter @targon/xplan dev
pnpm --filter @targon/atlas dev
pnpm --filter @targon/website dev
```

For local-only URL wiring, set `PORTAL_APPS_CONFIG=dev.local.apps.json` so the portal can link to other apps running on localhost.

## CI/CD (GitHub Actions)

### CI (PR checks)

Workflow: `.github/workflows/ci.yml`

- Runs on `pull_request`
- Installs via pnpm and populates `.env.dev`/`.env.local` from `*.env.dev.ci` templates
- Verifies workspace `package.json` versions are kept in sync (root is the source of truth)
- Generates Prisma clients
- Lints / type-checks / builds only the workspaces changed in the PR (via `APP_CHANGED_SINCE` + turbo filters)

### CD (deploy to the laptop)

Workflow: `.github/workflows/cd.yml`

- Triggers on `push` to `dev` or `main` and runs deploy steps on a `self-hosted` GitHub Actions runner on the laptop (`~/actions-runner`).
- Detects which apps/packages changed and deploys only what’s necessary.
- Uses `scripts/deploy-app.sh` to:
  - sync the correct worktree (`~/targonos-dev` or `~/targonos-main`)
  - run `pnpm install` (once per deploy run)
  - build the app(s)
  - restart the matching PM2 process(es)
  - run `pm2 save` once at the end
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
pm2 restart dev-targonos dev-talos dev-x-plan dev-atlas dev-website --update-env
pm2 restart main-targonos main-talos main-x-plan main-atlas main-website --update-env
pm2 save
```

### Tunnel health (Cloudflare Error 1033)

`cloudflared` exports a readiness endpoint on `127.0.0.1:20241`:

```bash
curl -fsS http://127.0.0.1:20241/ready
```

If it’s unhealthy:

```bash
launchctl kickstart -k gui/$UID/homebrew.mxcl.cloudflared
```

Optional watchdog (macOS LaunchAgent) for auto-recovery:

```bash
scripts/install-cloudflared-watchdog-macos.sh
```

### Common failure modes

- `502 Bad Gateway`: check nginx (`brew services list`) and the target PM2 process (`pm2 status`, `pm2 logs <name>`).
- NextAuth `UntrustedHost`: set `AUTH_TRUST_HOST=true` and ensure nginx forwards `X-Forwarded-*` headers.
- Cookies not shared across apps: ensure `COOKIE_DOMAIN=.targonglobal.com` and that all apps share `PORTAL_AUTH_SECRET`.
