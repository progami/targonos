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
| `os.targonglobal.com` | Main Portal (+ `/talos`, `/xplan`, `/atlas`) | `http://localhost:8080` |
| `dev-os.targonglobal.com` | Dev Portal (+ `/talos`, `/xplan`, `/atlas`) | `http://localhost:8081` |
| `www.targonglobal.com` / `targonglobal.com` | Main Website | `http://localhost:8082` |
| `dev.targonglobal.com` | Dev Website | `http://localhost:8083` |
| `db.targonglobal.com` | PostgreSQL (TCP) | `tcp://localhost:5432` |

nginx then routes paths to the correct app ports (macOS/Homebrew default path: `/opt/homebrew/etc/nginx/servers/targonos.conf`):

- Main: `3000` (portal), `3001` (talos), `3005` (website), `3006` (atlas), `3008` (xplan), `3010` (kairos), `3012` (plutus)
- Dev: `3100` (portal), `3101` (talos), `3105` (website), `3106` (atlas), `3108` (xplan), `3110` (kairos), `3112` (plutus)

### “Two environments” on one host

The laptop keeps two long-lived working directories (“worktrees”) so `dev` and `main` can be running at the same time:

| Directory | Branch | Environment | App ports |
| --- | --- | --- | --- |
| `$TARGONOS_DEV_DIR` | `dev` | Dev | `31xx` |
| `$TARGONOS_MAIN_DIR` | `main` | Main | `30xx` |

PM2 process definitions live in `ecosystem.config.js` and reference these directories via `TARGONOS_DEV_DIR` / `TARGONOS_MAIN_DIR`.
Set both env vars to absolute paths (example: `/path/to/targonos-dev` and `/path/to/targonos-main`).

## Monorepo layout

```text
apps/
  sso/          # Portal (auth + navigation hub)
  talos/        # Warehouse Management (custom server.js)
  xplan/        # xplan (Next.js app)
  atlas/        # Atlas (Next.js app)
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
| Plutus | `@targon/plutus` | `/plutus` | LMB + QBO finance workspace (settlements, bills, analytics) |
| Website | `@targon/website` | `/` | Separate hostname (`targonglobal.com`) |

## Authentication model (Portal as the source of truth)

- The portal (`apps/sso`) is the canonical NextAuth app; other apps validate the portal session.
- Cookie domain is shared (`COOKIE_DOMAIN=.targonglobal.com`) so a user signs in once and can use multiple apps.
- Shared secret: `PORTAL_AUTH_SECRET` (and/or `NEXTAUTH_SECRET`) must match across apps.
- Reverse proxy support: nginx forwards `X-Forwarded-Host` / `X-Forwarded-Proto`; NextAuth v5 requires `AUTH_TRUST_HOST=true` behind a proxy.
- The shared library `@targon/auth` includes helpers for consistent cookie naming and session checks (JWT decode + portal `/api/auth/session` probe).

## Data/services

- PostgreSQL runs locally (Homebrew `postgresql@14`), exposed on `localhost:5432` and optionally via `db.targonglobal.com` through the tunnel.
- Schemas are per-app (and per-environment): `auth`, `talos`, `xplan`, `atlas`, `plutus` (dev schemas may be prefixed `dev_*` depending on env).
- Prisma clients are generated into `packages/prisma-*` and imported by apps (e.g., `@targon/prisma-talos`).
- Redis runs locally (Homebrew `redis`) and is used by Talos.

## Environment configuration (high level)

`.env*` files are gitignored; CI uses committed `*.env.dev.ci` templates for builds. In hosted mode (PM2), apps run with `NODE_ENV=production` and rely on `.env.local` / `.env.production` being present per app.

Common variables across apps:

- `PORT`, `HOST`
- `BASE_PATH`, `NEXT_PUBLIC_BASE_PATH` (for path-based apps like `/talos`, `/xplan`, `/atlas`)
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `PORTAL_AUTH_URL`, `NEXT_PUBLIC_PORTAL_AUTH_URL`, `PORTAL_AUTH_SECRET`
- `COOKIE_DOMAIN`
- `DATABASE_URL` (Postgres)
- `REDIS_URL` (Talos)

Portal app-link configuration:

- `PORTAL_APPS_CONFIG` points at a JSON file (example: `dev.local.apps.json`) that tells the portal where each child app lives in dev.

## Local development (new developer setup)

This section covers how to set up the repo on your own machine for local development, connecting to the shared dev database.

### Prerequisites

- **Node.js >= 20** (repo uses Node 20 in CI)
- **pnpm** via Corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **Redis** (required by Talos for CSRF + rate limiting):
  ```bash
  brew install redis
  brew services start redis
  ```
- **Cloudflare Tunnel client** (for shared dev database access):
  ```bash
  brew install cloudflared
  ```

You do **not** need PostgreSQL installed locally — you'll connect to the shared dev database via tunnel.

### 1. Clone and install

```bash
git clone <repo-url> targonos-dev
cd targonos-dev
git checkout dev
pnpm install
```

### 2. Start the database tunnel

The shared dev database is exposed via a Cloudflare TCP tunnel. Run this in a **separate terminal** and keep it running:

```bash
cloudflared access tcp --hostname db.targonglobal.com --url localhost:6432
```

This proxies the shared PostgreSQL instance to your `localhost:6432`. All `DATABASE_URL` values in your `.env.local` files should use port `6432`.

### 3. Create `.env.local` files

Each app needs its own `.env.local` file (gitignored). Ask a team member for the required secrets — specifically:

- `NEXTAUTH_SECRET` / `PORTAL_AUTH_SECRET` — shared auth secret (must match across SSO and all apps)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials for SSO
- Database credentials — username and password for the shared dev DB user

#### `apps/sso/.env.local`

```env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
AUTH_TRUST_HOST=true
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<ask team for shared secret>
PORTAL_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_PORTAL_AUTH_URL=http://localhost:3000
PORTAL_AUTH_SECRET=<ask team for shared secret>
PORTAL_APPS_CONFIG=dev.local.apps.json
PORTAL_DB_URL=postgresql://<db_user>:<db_password>@localhost:6432/portal_db?schema=auth_dev
GOOGLE_CLIENT_ID=<ask team for Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<ask team for Google OAuth client secret>
GOOGLE_ALLOWED_EMAILS=@targonglobal.com
ALLOW_CALLBACK_REDIRECT=true
```

#### `apps/talos/.env.local`

```env
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=<ask team for shared secret>
PORTAL_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_PORTAL_AUTH_URL=http://localhost:3000
PORTAL_AUTH_SECRET=<ask team for shared secret>
NEXT_PUBLIC_APP_URL=http://localhost:3001
CSRF_ALLOWED_ORIGINS=http://localhost:3001
DATABASE_URL=postgresql://<db_user>:<db_password>@localhost:6432/portal_db
REDIS_URL=redis://localhost:6379
S3_BUCKET_NAME=ci-talos-bucket
S3_BUCKET_REGION=us-east-1
DATABASE_URL_US=postgresql://<db_user>:<db_password>@localhost:6432/portal_db?schema=dev_talos_us
DATABASE_URL_UK=postgresql://<db_user>:<db_password>@localhost:6432/portal_db?schema=dev_talos_uk
```

> **Do NOT set `BASE_PATH`, `NEXT_PUBLIC_BASE_PATH`, or `PRISMA_SCHEMA`** in local dev.
> `BASE_PATH` causes double-path issues with `next dev`. `PRISMA_SCHEMA` overrides all tenant schemas globally and breaks multi-tenant routing.

#### Other apps

Use the same pattern — point `DATABASE_URL` to `localhost:6432` with the appropriate schema:

| App | Workspace | Port | DB Schema |
|-----|-----------|------|-----------|
| SSO (Portal) | `@targon/sso` | 3000 | `auth_dev` |
| Talos | `@targon/talos` | 3001 | `dev_talos_us` / `dev_talos_uk` |
| Website | `@targon/website` | 3005 | — |
| Atlas | `@targon/atlas` | 3006 | `dev_atlas` |
| X-Plan | `@targon/xplan` | 3008 | `dev_xplan` |
| Kairos | `@targon/kairos` | 3010 | `kairos` |
| Plutus | `@targon/plutus` | 3012 | — (uses QuickBooks API) |
| Hermes | `@targon/hermes` | 3014 | `dev_hermes` |

### 4. Generate Prisma clients

Before running any app, generate its Prisma client:

```bash
# Generate for specific apps
pnpm --filter @targon/sso exec prisma generate
pnpm --filter @targon/talos exec prisma generate
pnpm --filter @targon/atlas exec prisma generate
pnpm --filter @targon/xplan exec prisma generate
```

### 5. Run the apps

SSO must be running for authentication to work. Start it first, then any app you're working on:

```bash
# Terminal 1 — SSO (must start first)
pnpm --filter @targon/sso dev

# Terminal 2 — whichever app you're working on
pnpm --filter @targon/talos dev
pnpm --filter @targon/atlas dev
pnpm --filter @targon/xplan dev
```

### 6. Access

1. Open `http://localhost:3000` — SSO login page
2. Sign in with your `@targonglobal.com` Google account
3. Navigate to the app you're working on (e.g., `http://localhost:3001` for Talos)

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
- Installs via pnpm and populates `.env.dev`/`.env.local` from `*.env.dev.ci` templates
- Verifies workspace `package.json` versions are kept in sync (root is the source of truth)
- Generates Prisma clients
- Lints / type-checks / builds only the workspaces changed in the PR (via `APP_CHANGED_SINCE` + turbo filters)

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
