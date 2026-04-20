# Cross-App CI Smoke Discovery Spec

## Goal

Document the runtime failures currently escaping CI and define the minimum browser-level smoke coverage required so CI proves each app can actually boot and render its critical entry path.

## Scope

Apps under test in this pass:

- `sso`
- `talos`
- `atlas`
- `xplan`
- `kairos`
- `plutus`
- `hermes`
- `argus`
- `website`

This document is discovery only. It does not include fixes.

## Current CI Reality

Current GitHub CI in [.github/workflows/ci.yml](/Users/jarraramjad/dev/targonos-main/.github/workflows/ci.yml:1) does this for changed workspaces:

- installs dependencies
- populates `.env.dev.ci` for a subset of apps
- runs `pnpm lint`
- runs `pnpm typecheck`
- runs `pnpm build`

Current GitHub CI does not run a repo-level browser smoke suite that proves:

- the portal can render
- each app boots at its configured local route
- base paths resolve correctly
- shared auth handoff works
- the first meaningful screen renders without runtime exceptions

## Existing Browser Test Coverage

- Atlas already has Playwright configured in [apps/atlas/tests/playwright.config.ts](/Users/jarraramjad/dev/targonos-main/apps/atlas/tests/playwright.config.ts:1).
- Atlas also has a smoke file in [apps/atlas/tests/e2e/smoke.spec.ts](/Users/jarraramjad/dev/targonos-main/apps/atlas/tests/e2e/smoke.spec.ts:1).
- The current Atlas authenticated smoke tests call `loginToAtlas()` from [apps/atlas/tests/fixtures/auth.ts](/Users/jarraramjad/dev/targonos-main/apps/atlas/tests/fixtures/auth.ts:1) and then `skip` when the login form is unavailable because portal auth uses Google SSO.
- Result: the only existing browser smoke pattern already tolerates missing auth automation by skipping, which is the opposite of the hard-fail gate needed here.

## Workspace Facts Relevant To Smoke Coverage

- Observed listeners during this browser pass were on `3000`, `3001`, `3005`, `3006`, `3008`, `3010`, `3012`, `3014`, and `3016`.
- `sso` package script hardcodes `next dev -p 3000`, while `.env.local` sets `PORT=3200`.
- `talos` package script hardcodes `next dev -p 3001`, while `.env.local` sets `PORT=3201`.
- `atlas` package script defaults to `3006`, but its local env currently points public/auth URLs at production origins.
- `xplan` package script defaults to `3008`, but the portal app map expects standalone dev URL `http://localhost:3208`.
- `kairos` package script defaults to `3010`, but the portal app map expects standalone dev URL `http://localhost:3210`.
- `plutus` local env binds to `3012`, while the portal app map expects `http://localhost:3212`.
- `hermes` local env binds to `3014`, while the portal app map expects `http://localhost:3214`.
- `argus` package script hardcodes `3216`, while `.env.local` sets `PORT=3016` and the observed process in this pass was listening on `3016`.
- `website` local env binds to `3005`.

## Findings

### Global Findings

- `.github/workflows/ci.yml` has no browser-level smoke validation, so green CI currently only proves static checks plus builds.
- `apps/sso/lib/apps.ts` encodes local standalone dev URLs that diverge from several app package/env defaults. Any future smoke suite must test the same topology the portal uses, not an ad hoc per-app URL list.
- `apps/xplan/next.config.ts` sets `typescript.ignoreBuildErrors = true`, which weakens `next build` as a correctness gate for that app.

### Per-App Findings

#### SSO

- `http://localhost:3000/` rendered the login screen successfully with no console errors.
- Clicking `Sign in with Google` opened Google account chooser, but the OAuth request used production callback/domain values instead of localhost:
  - account chooser request included `redirect_uri=https://os.targonglobal.com/api/auth/callback/google`
- Selecting the existing `jarrar@targonglobal.com` account landed on `https://os.targonglobal.com/login?error=Configuration` instead of returning to local SSO.
- Result: local shared-auth smoke coverage is currently blocked by an auth configuration mismatch between localhost and production.

#### Talos

- `http://localhost:3001/talos` rendered the region-picker landing screen.
- Choosing `US` triggered runtime errors instead of a clean authenticated transition:
  - `POST /talos/api/tenant/select` returned `401`
  - `GET /talos/api/portal/session` returned `401`
  - `GET /talos/api/tenant/current` returned `401`
- Browser console captured `Uncaught Error: Minified React error #418` on the Talos landing flow after the unauthenticated interaction.
- Result: Talos does not fail gracefully when the portal session is missing.

#### Atlas

- `http://localhost:3006/atlas` redirected to `/atlas/hub` and rendered successfully.
- No console errors were emitted on initial render.
- Follow-up navigation to `/atlas/calendar` also rendered successfully.

#### xPlan

- `http://localhost:3008/xplan/1-strategies` redirected to `/xplan/1-setup` and rendered the shell successfully.
- Initial load emitted console/runtime auth errors:
  - `GET /xplan/api/v1/xplan/assignees` returned `401`
  - browser console logged `Error: Authentication required`
- The app still rendered `Setup` with `No strategies found`, which means the shell survives, but boot is not clean.
- `apps/xplan/next.config.ts` also sets `typescript.ignoreBuildErrors = true`, so `next build` is explicitly allowed to succeed with TypeScript build errors.

#### Kairos

- `http://localhost:3010/kairos` redirected to `/kairos/no-access` with no console or network failures.
- The rendered state was `No Access to Kairos`, not a usable forecasting workspace.
- This is not a client crash, but it blocks meaningful browser smoke coverage unless CI has a seeded user/session with Kairos access.

#### Plutus

- `http://localhost:3012/plutus` redirected to `/plutus/settlements` and rendered successfully.
- No console errors were emitted on initial render.
- Initial data request `GET /plutus/api/plutus/settlements?page=1&pageSize=25` returned `200`.
- Follow-up navigation to `/plutus/transactions` also rendered successfully.

#### Hermes

- `http://localhost:3014/hermes` redirected to `/hermes/insights` and rendered successfully.
- No console errors were emitted on initial render.
- Initial analytics and account requests returned `200`.
- Follow-up navigation to `/hermes/orders` also rendered successfully.

#### Argus

- `http://localhost:3016/argus` redirected to `/argus/wpr` and rendered successfully during the browser pass.
- No console errors were emitted on initial render.
- Initial app data and chunk requests returned `200` during the smoke pass.
- Follow-up navigation to `/argus/monitoring` also rendered successfully.

#### Website

- `http://localhost:3005/` rendered successfully on first load.
- Home page navigation prefetch requested multiple route chunks that returned `400`:
  - `/_next/static/chunks/app/cs/us/packs/page-c4a4a4601a506bd8.js`
  - `/_next/static/chunks/app/cs/us/where-to-buy/page-4c959385cc271165.js`
  - `/_next/static/chunks/app/cs/us/about/page-c2fd8c1a01c906dc.js`
- Clicking `Packs` on the home page produced `Application error: a client-side exception has occurred`.
- Browser console captured `ChunkLoadError: Loading chunk 798 failed.`

## Minimum Standard Smoke Suite To Design After Discovery

The suite should eventually prove, for every app, at minimum:

1. the process starts on the expected local port and base path
2. the first page request returns a successful document response
3. the initial viewport renders without uncaught runtime errors
4. the shared layout shell or public landing content becomes visible
5. the app does not immediately redirect into a broken route or crash loop
6. shared portal-to-app launch paths work for role-gated apps

## Proposed Standard Smoke Suite

### Test Harness

- Use one repo-level Playwright project instead of app-by-app ad hoc suites.
- Run against started local app processes on their real CI ports/base paths.
- Fail on any uncaught page error, failed critical chunk request, or app-origin `4xx/5xx` request outside an explicitly allowed list.
- Do not skip authenticated scenarios because auth is inconvenient. If auth is required for a smoke path, CI must provision deterministic auth for it.

### Required Test Groups

1. `portal-auth-config.spec`
- Verify `http://localhost:3000/` renders.
- Verify starting sign-in does not leave localhost or the intended CI host unexpectedly.
- Verify callback/redirect handling remains on the configured smoke origin.

2. `public-and-shell.spec`
- `website`: `/`, then click `Packs`
- `talos`: `/talos`, then select `US`
- `atlas`: `/atlas`, then navigate to `Calendar`
- `xplan`: `/xplan/1-strategies`
- `kairos`: `/kairos`
- `plutus`: `/plutus`, then navigate to `Transactions`
- `hermes`: `/hermes`, then navigate to `Orders`
- `argus`: `/argus`, then navigate to `Monitoring`

3. `shared-auth-launch.spec`
- From the portal, launch each role-gated app tile into its app route.
- Verify the target app arrives on its expected base path and renders the first meaningful heading.
- Hard-fail if any app lands on `no-access`, `unauthorized`, login error pages, or configuration error pages.

### Standard Assertions Per Route

- document request returns `200`
- no `ChunkLoadError`
- no React hydration/runtime error in console
- no app-origin critical JS/CSS chunk request returns `4xx/5xx`
- visible page heading matches the intended route
- at least one app-specific data request returns successfully when the route requires data

### CI Preconditions This Suite Needs

- a deterministic auth path for portal and role-gated apps
- stable base URL and port mapping shared by SSO and all apps
- seeded fixture data or stable local data contracts for first-screen rendering
- one canonical allowlist for intentionally unauthenticated routes; everything else hard-fails
