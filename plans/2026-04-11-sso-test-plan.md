# 2026-04-11 SSO Test Plan

## Purpose
Define the CI smoke suite for the `sso` app so portal auth, callback routing, and launcher behavior fail fast when login is broken.
This app is the suite entrypoint: it owns sign-in, sign-out, callback preservation, and the launcher that hands users off to the other apps.

## Standard Gate
- Run this app in the repo-standard Playwright smoke harness described in `plans/2026-04-11-cross-app-ci-smoke-spec.md`.
- Fail the run on `pageerror`, `console.error`, unhandled promise rejection, redirect loop, hydration error, and failed JS chunk/request needed for the current route.
- Treat unexpected `401`, `403`, `404`, and `500` as failures unless the test explicitly targets an access-denied state.

## P0 Flows

### 1. Portal Landing
Routes: `/`

Checks:
- Portal shell renders with `TargonOS Portal`.
- Signed-out state shows login entrypoint.
- Signed-in state shows launcher tiles instead of an auth error screen.

### 2. Login Page
Routes: `/login`

Checks:
- Username/password inputs render.
- Google sign-in CTA renders.
- Submit button enables only after credentials are entered.
- Invalid credentials stay on login and show an error without crashing.

### 3. Callback Preservation
Routes: `/login?callbackUrl=<app-url>`

Checks:
- Requested callback is preserved through login.
- Post-login redirect lands on the requested app path, not just portal home.
- Relative and same-origin callback URLs are accepted.
- Invalid callback values are rejected safely and do not create an open redirect.

### 4. App Relay
Routes: `/auth/relay`, `/xplan`

Checks:
- Relay page resolves app callback and forwards once.
- Relay does not bounce between portal and app indefinitely.
- `xplan` tile route lands on the xPlan app entrypoint for an entitled user.

### 5. Logout
Routes: `/logout`

Checks:
- Existing session is cleared.
- User lands on signed-out portal state.
- Back navigation does not restore an authenticated launcher.

## P1 Flows

### 6. Entitlement and Error States
Routes: `/login?error=...`

Checks:
- Access-denied or config errors render a user-visible state.
- Error screen does not white-screen or infinite-loop.

### 7. Launcher Tile Health
Routes: `/`

Checks:
- Every visible app tile has a valid href.
- Clicking a tile starts a navigation to the expected app base path.

## Fixtures and Data
- One valid local/demo account for non-Google smoke coverage.
- One entitled user with access to at least Talos, Atlas, xPlan, and Plutus.
- One non-entitled user for access-denied checks if local auth supports it.

## Known Issues From 2026-04-11
- Google sign-in from local `http://localhost:3000/` redirects to `https://os.targonglobal.com/api/auth/callback/google` and lands on `https://os.targonglobal.com/login?error=Configuration`.
- Current `apps/sso/tests/*.spec.ts` only prove the portal renders and a password login can land on portal home. They do not assert callback preservation or Google auth integrity.
