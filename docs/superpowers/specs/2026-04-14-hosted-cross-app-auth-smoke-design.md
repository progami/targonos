# Hosted Cross-App Auth Smoke Design

## Purpose

Define a permanent every-PR smoke gate that proves central auth can open the hosted TargonOS portal and the main hosted app entry screens without relying on real Google OAuth during CI.

This design is intended to stop regressions where:

- portal login looks healthy but child apps cannot actually be entered
- Talos breaks after login during tenant selection or active-tenant persistence
- an app deep link silently redirects back to `/login` or `/no-access`
- hosted routes return HTML error pages while the UI expects JSON
- local-only auth smoke passes while the hosted suite is broken

## Evidence From The Current Codebase

- Current required CI auth checks are local-only:
  - local SSO smoke in [.github/workflows/ci.yml](/Users/jarraramjad/dev/targonos-main/.github/workflows/ci.yml:93)
  - topology assertions in [scripts/assert-auth-topology.mjs](/Users/jarraramjad/dev/targonos-main/scripts/assert-auth-topology.mjs:1)
- The current Playwright SSO harness runs a disposable local portal on `127.0.0.1:3320` in [apps/sso/playwright.config.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/playwright.config.ts:17).
- The local login smoke verifies:
  - Google-only login page
  - callback preservation
  - stale encrypted session recovery
  - authenticated launcher rendering
  in [apps/sso/tests/login.spec.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/tests/login.spec.ts:8) and [apps/sso/tests/e2e.spec.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/tests/e2e.spec.ts:10).
- A hosted deep-link smoke already exists in [apps/sso/tests/hosted-deep-links.spec.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/tests/hosted-deep-links.spec.ts:1), but it is not wired into CI.
- The hosted auth fixture already supports seeded portal sessions through [apps/sso/tests/fixtures/hosted-auth.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/tests/fixtures/hosted-auth.ts:127).
- Talos region selection is a real post-auth failure point:
  - UI POSTs to `/api/tenant/select` in [apps/talos/src/components/tenant/WorldMap.tsx](/Users/jarraramjad/dev/targonos-main/apps/talos/src/components/tenant/WorldMap.tsx:165)
  - API forwards tenant persistence to portal `/api/v1/session/active-tenant` in [apps/talos/src/app/api/tenant/select/route.ts](/Users/jarraramjad/dev/targonos-main/apps/talos/src/app/api/tenant/select/route.ts:64)
  - non-OK responses are parsed as JSON in [apps/talos/src/components/tenant/WorldMap.tsx](/Users/jarraramjad/dev/targonos-main/apps/talos/src/components/tenant/WorldMap.tsx:180), which turns upstream HTML `502` pages into confusing UI errors.
- App coverage is inconsistent today:
  - SSO has Playwright smoke via [apps/sso/package.json](/Users/jarraramjad/dev/targonos-main/apps/sso/package.json:11)
  - Atlas has Playwright tests via [apps/atlas/package.json](/Users/jarraramjad/dev/targonos-main/apps/atlas/package.json:9)
  - Talos has no browser smoke script in [apps/talos/package.json](/Users/jarraramjad/dev/targonos-main/apps/talos/package.json:1)
- Recent `CI` runs are fast, not hour-scale. Recent self-hosted runs sampled from GitHub completed in about `1m25s`, `2m16s`, and `4m29s`, so the existing `ci.yml` workflow is not the main latency problem.

## Goals

- Add one required every-PR hosted smoke lane for central auth entry into the suite
- Prove the hosted portal session can open each major app through a real hosted deep link
- Catch Talos tenant-selection regressions before merge
- Fail hard on hosted auth regressions instead of letting local-only smoke mask them
- Keep runtime fast enough for every PR

## Non-Goals

- Real Google OAuth login in PR CI
- Production smoke tests in the PR path
- Full workflow coverage inside each app
- Replacing the existing local SSO smoke gate
- Solving broader PR-to-deploy latency in this change

## Approaches Considered

### 1. Promote The Existing Hosted Deep-Link Smoke

Use the existing SSO-owned hosted Playwright harness, tighten assertions, and wire it into required CI.

Why this is the selected approach:

- fastest path to meaningful hosted coverage
- reuses the existing hosted session fixture and route inventory
- centralizes auth smoke ownership in one place
- proves the real hosted cookie and deep-link contract across apps

### 2. Add Per-App Browser Smokes

Each app owns its own hosted login smoke.

Why not:

- duplicates the same portal-session setup many times
- makes auth coverage drift by app
- slower to ship and maintain

### 3. Require Real Google OAuth In Every PR

Drive a full hosted Google login and then enter each app.

Why not:

- slower and more brittle
- depends on interactive third-party OAuth in CI
- not needed to prove the central hosted session contract

## Selected Design

### 1. Keep Two Layers Of Auth Verification

The suite should retain:

- local SSO smoke for fast contract checks on portal auth behavior
- hosted cross-app smoke for real hosted deep-link entry into apps

The local layer protects auth mechanics.
The hosted layer protects the actual deployed suite topology and app-entry flow.

### 2. Hosted Smoke Target

The hosted smoke runs against the dev hosted stack, not production.

Required target:

- `https://dev-os.targonglobal.com`

The smoke suite seeds a valid portal session cookie using the shared hosted secret and then verifies hosted deep links from that real hosted origin.

There is no fallback to local routes or to production. Missing hosted env must fail the job.

### 3. Required Route Coverage

The hosted smoke must cover one stable entry route per app:

- portal: `/`
- talos: `/talos`
- atlas: `/atlas/employees`
- kairos: `/kairos/forecasts`
- xplan: `/xplan/1-setup`
- plutus: `/plutus/settlements`
- hermes: `/hermes/insights`
- argus: `/argus/wpr`

These routes are chosen because they are stable, user-facing, and representative of whether the app can actually be entered through central auth.

### 4. Assertion Contract

The suite must do more than “page loaded”.

Per route it must assert:

- final URL is inside the intended app
- page does not land on `/login` or `/no-access`
- stable app-specific visible text exists
- version badge exists so the app shell is actually booted
- page body does not contain known host failure markers such as:
  - `Bad gateway`
  - `Error code 502`
  - `Unexpected token '<'`

If the test depends on a critical app request, that request must not return:

- `401`
- `403`
- `500`
- `502`

### 5. Talos Special Flow

Talos is not allowed to pass by merely showing the region selector.

The Talos smoke must:

1. open `/talos`
2. if the region selector is present, click `US`
3. verify `/talos/api/tenant/select` succeeds
4. verify navigation reaches `/talos/dashboard`
5. verify a stable dashboard or operations marker such as `Dashboard` or `Purchase Orders`

This is mandatory because the live regression occurred after auth, during active-tenant persistence.

### 6. Runtime Constraints

To keep this viable on every PR:

- one shared authenticated browser context for the suite
- one worker
- no retries by default
- screenshots only on failure
- one core screen per app

Target runtime budget:

- about `2-4` minutes added to PR CI

## CI Wiring

### 1. Workflow Placement

The hosted smoke belongs in the main required `CI` workflow in [.github/workflows/ci.yml](/Users/jarraramjad/dev/targonos-main/.github/workflows/ci.yml:1).

It should run after:

- local auth topology tests
- local SSO smoke

This ordering keeps fast local failures cheap and then validates the hosted suite contract.

### 2. Required Environment

The job must require explicit hosted env such as:

- `PORTAL_BASE_URL=https://dev-os.targonglobal.com`
- `NEXTAUTH_SECRET` or `PORTAL_AUTH_SECRET`
- hosted seeded-user identifiers already expected by the hosted auth fixture

If any required variable is missing, the job fails immediately.

### 3. Failure Policy

This is a blocking PR gate.

It must not be optional, manual-only, or best-effort if central auth is treated as a release contract.

## Test Ownership

Ownership stays with the SSO/auth layer because:

- the fixture is portal-auth based
- the suite validates the shared auth contract across apps
- failures indicate auth/topology regressions as often as app regressions

App teams still own their own deeper workflow tests. This suite only owns “can central auth get me into the app and onto a real first screen”.

## Implementation Outline

1. Tighten [apps/sso/tests/hosted-deep-links.spec.ts](/Users/jarraramjad/dev/targonos-main/apps/sso/tests/hosted-deep-links.spec.ts:1) to enforce the stronger assertion contract.
2. Add Talos-specific region-selection handling and request verification.
3. Optimize the hosted suite for CI runtime:
   - shared login context
   - one worker
   - screenshot-on-failure only
4. Add a dedicated SSO script for hosted smoke execution.
5. Wire the hosted smoke into `CI` as a required step after the local auth checks.
6. Verify the lane against the dev hosted stack before opening a PR.

## Risks

- Hosted dev stack instability can create noisy failures. That is acceptable because the point of the gate is to reveal hosted auth breakage before merge.
- Some app landing screens may be too brittle for marker-text assertions and may need more stable selectors.
- Talos may require special handling if tenant-selection behavior changes by user or environment.

## Success Criteria

This design is successful when:

- every PR runs a required hosted cross-app auth smoke
- Talos tenant-selection regressions fail before merge
- app-entry regressions redirecting to `/login` or `/no-access` fail before merge
- hosted `502`/HTML error-page regressions fail before merge
- the lane remains fast enough to stay required on every PR
