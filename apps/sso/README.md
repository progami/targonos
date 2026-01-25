TargonOS Portal (Auth)
======================

Portal-managed authentication and app launcher for all TargonOS apps.

Goals
-----

- Single sign-on across `*.targonglobal.com` subdomains
- One login page at `https://os.targonglobal.com/login`
- Show a per-user app catalog with deep links
- Issue a secure, httpOnly, domain-scoped NextAuth session cookie

How it works
------------

- NextAuth (JWT sessions) runs only in this app.
- Session cookie name: `__Secure-next-auth.session-token` (prod) scoped to domain `.targonglobal.com`.
- Other apps verify the cookie with `next-auth/jwt` in their middleware and do not render their own login.
- Google OAuth handles primary authentication; only allow-listed company accounts can complete sign-in.
- On missing/invalid session, apps redirect to `PORTAL_AUTH_URL + /login?callbackUrl=<originalUrl>`.

Environment
-----------

- NEXTAUTH_SECRET: strong secret shared by all apps (required)
- COOKIE_DOMAIN: `.targonglobal.com`
- NEXTAUTH_URL: `https://os.targonglobal.com`
- PORTAL_DB_URL: `postgresql://portal_auth:***@localhost:5432/portal_db?schema=auth`
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: OAuth credentials from the Google Cloud console
- GOOGLE_ALLOWED_EMAILS: comma or whitespace separated list of permitted Google accounts (e.g. `jarrar@targonglobal.com, mehdi@targonglobal.com`)

Dev
---

- In dev, cookie name becomes `targon.next-auth.session-token` to avoid collisions.
- Apps attempt `next-auth.session-token`, `targon.next-auth.session-token`, and their legacy cookie name.
- When `GOOGLE_ALLOWED_EMAILS` is omitted locally, any Google account may sign in (handy for smoke tests).
- To test Google SSO locally, create `apps/sso/.env.local` (gitignored) with:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` copied from the Google Cloud project (`targon-sso`).
  - `GOOGLE_ALLOWED_EMAILS` set to the Workspace accounts you want exercising the flow.
  - `NEXTAUTH_SECRET` (and optionally `NEXTAUTH_URL=http://localhost:3000`) so the NextAuth session behavior matches production.
- Auth bootstrap now fails immediately when required env vars are missing. Ensure `NEXTAUTH_SECRET`, `COOKIE_DOMAIN`, `PORTAL_AUTH_URL`, `NEXT_PUBLIC_PORTAL_AUTH_URL`, and `NEXT_PUBLIC_APP_URL` are defined before running dev servers. For ad-hoc local runs you can export `ALLOW_DEV_AUTH_DEFAULTS=true` to re-enable localhost fallbacks.
- The portal now connects to the shared `auth_dev` schema on the `targon-prod` RDS instance. Before launching the dev server, open a tunnel to the bastion:
  ```bash
  ssh -f -N \
    -L 6543:targon-prod.cyx0i8s6srto.us-east-1.rds.amazonaws.com:5432 \
    -i ~/.ssh/talos-deploy-key.pem ec2-user@100.77.97.60
  ```
  With the tunnel running, set `PORTAL_DB_URL=postgresql://portal_auth:portal_auth_password_2024@localhost:6543/portal_db?schema=auth_dev` in `.env.local`. No local Postgres install is required—the tunnel proxies every request to the shared dev database.

Extending claims
----------------

- Add fields in `jwt` and `session` callbacks in `lib/auth.ts` (e.g., `role`, `apps`, `tenantId`).
- Apps read claims server-side only and enforce authorization locally.

Files
-----

- `lib/auth.ts` – NextAuth config
- `app/api/auth/[...nextauth]/route.ts` – NextAuth route handler
- `app/login/page.tsx` – Google-only sign-in surface

## Dev app URLs (local ports)

- In development, app links shown on the portal home will prefer localhost ports instead of production domains.
- The resolution order for an app id like `talos` is:
  1. `process.env.DEV_APP_URL_TALOS` if set (e.g., `http://localhost:3001`)
  2. `process.env.DEV_TALOS_PORT` or `process.env.TALOS_PORT` (builds `http://localhost:<port>`; host overridable via `DEV_APPS_HOST`)
  3. `dev.apps.json` at the repo root (example added with common defaults)
  4. Fallback to the production URL defined in `lib/apps.ts`

Edit the root `dev.apps.json` or export env vars to point apps to your running local ports.

## Optional: callback redirect behavior

- By default, after sign-in the user lands on the portal tile page (centralized UX).
- To allow honoring `callbackUrl` to jump directly into an app after login, set:
  - `ALLOW_CALLBACK_REDIRECT=true` in the portal environment.
  - In development, only localhost/127.0.0.1 targets are allowed; in production, only subdomains of `COOKIE_DOMAIN` are allowed.
  - The redirect is relayed via a same-origin page (`/auth/relay`) to ensure cookies are fully committed before the cross-origin navigation.
- `app/page.tsx` – App launcher
