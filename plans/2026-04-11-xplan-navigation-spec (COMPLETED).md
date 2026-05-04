# 2026-04-11 xPlan Navigation Spec
## Goal
Document the current xPlan navigation behavior around the `/xplan` base path, canonical entry routing, sheet/tab deep links, no-access recovery, and auth handoff, using only the reviewed code and the existing discovery/test-plan docs.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-xplan-test-plan.md`
- `apps/xplan/next.config.ts`
- `apps/xplan/middleware.ts`
- `apps/xplan/lib/auth.ts`
- `apps/xplan/lib/base-path.ts`
- `apps/xplan/lib/strategy-access.ts`
- `apps/xplan/lib/integrations/talos-url.ts`
- `apps/xplan/app/layout.tsx`
- `apps/xplan/app/page.tsx`
- `apps/xplan/app/no-access/page.tsx`
- `apps/xplan/app/[sheet]/page.tsx`
- `apps/xplan/app/[sheet]/error.tsx`
- `apps/xplan/components/workbook-layout.tsx`
- `apps/xplan/components/sheet-tabs.tsx`
- `apps/xplan/components/active-strategy-indicator.tsx`
- `apps/xplan/tests/ui/workbook-layout.test.tsx`
- `apps/xplan/tests/ui/sheet-tabs.test.tsx`
- `apps/xplan/lib/sheets.ts`
- `apps/xplan/lib/workbook.ts`

## Repro Routes
- `/xplan`
- `/xplan/1-setup`
- `/xplan/1-strategies`
- `/xplan/3-ops-planning`
- `/xplan/4-sales-planning?strategy=<strategy-id>`
- `/xplan/4-sales-planning?strategy=<invalid-or-inaccessible-id>`
- `/xplan/no-access`
- Unauthenticated app entry: `/xplan/<sheet>` expecting portal login redirect with `callbackUrl`
- Invalid sheet slug: `/xplan/<bad-sheet>`

## Confirmed Issues
- Root is not a canonical redirect. [apps/xplan/app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1) directly calls the `[sheet]` page with `sheet: '1-setup'` instead of redirecting, while the test plan explicitly says root should redirect to `1-setup` in [plans/2026-04-11-xplan-test-plan.md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-xplan-test-plan.md:14). Current behavior makes `/xplan` and `/xplan/1-setup` two entry URLs for the same screen.
- Strategy deep links are silently rewritten. In [apps/xplan/app/[sheet]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:542), `resolveStrategyId()` falls back from the requested `strategy` to the primary strategy, then the first accessible strategy. Later, [the route handler](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2268) redirects to the resolved strategy or bounces non-setup sheets to `/1-setup` if none exists. A bookmarked deep link can therefore land on a different strategy or a different sheet without an explicit failure state.
- There is dead “last location” persistence with no restore path in the reviewed xPlan surface. [WorkbookLayout](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/workbook-layout.tsx:174) writes `xplan:last-location` into `sessionStorage`, but the reviewed landing flow does not read it, and [the root entry page](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1) always forces setup content. The app is persisting resume state that navigation does not actually consume.
- Current automated coverage does not protect the real navigation contract. [apps/xplan/tests/ui/sheet-tabs.test.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/tests/ui/sheet-tabs.test.tsx:11) only checks default/custom hrefs, and [apps/xplan/tests/ui/workbook-layout.test.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/tests/ui/workbook-layout.test.tsx:54) only checks year switching. There is no test covering `/xplan` vs `/xplan/1-setup`, legacy slug canonicalization, no-access recovery, login callback preservation, or base-path retention.

## Likely Root Causes
- Canonical-entry intent and implementation diverged. The plan says “root redirects to `1-setup`,” but the actual implementation chose page reuse instead of redirect in [app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1).
- Deep-link fidelity is being treated as secondary to “always land somewhere usable.” The fallback chain in [resolveStrategyId()](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:542) plus the redirect block in [SheetPage](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2268) prioritizes recovery over preserving the originally requested sheet/strategy context.
- Base-path handling is mixed. Sheet navigation and server redirects use raw internal paths like `/${slug}` in [WorkbookLayout](/Users/jarraramjad/dev/targonos-main/apps/xplan/components/workbook-layout.tsx:194) and [SheetPage](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2252), while other routes use [withAppBasePath()](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/base-path.ts:13). That may still work under Next’s basePath rules, but it leaves the app depending on framework magic in some places and explicit prefixing in others.
- No-access recovery depends on configuration and has an unsafe fallback. [apps/xplan/app/no-access/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/no-access/page.tsx:17) uses `NEXT_PUBLIC_PORTAL_AUTH_URL || '/'` for “Back to Portal.” Under a required `/xplan` base path, `'/'` is a bad fallback because it is ambiguous and can resolve back into the app instead of the portal.

## Recommended Fixes
- Choose one canonical entry route and enforce it everywhere. If `/xplan/1-setup` is the canonical route, change [app/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/page.tsx:1) to redirect there and update tests/specs to assert it. If `/xplan` is intended to be canonical, then stop describing `1-setup` as the canonical landing route.
- Make strategy deep-link behavior explicit. If `strategy` is invalid or inaccessible, prefer one deterministic failure mode: `notFound`, `no-access`, or a visible “strategy unavailable” recovery state. Silent rewrite to another strategy is the hardest behavior to reason about and the hardest to test.
- Remove the portal URL fallback. “Back to Portal” should use a required absolute portal URL, not `'/'`.
- Either implement resume-from-last-location intentionally or delete the unused `xplan:last-location` persistence.
- Standardize internal path generation. For app-internal links and redirects, use one rule consistently instead of mixing raw `/${slug}` paths with `withAppBasePath()`.

## Verification Plan
- Assert `/xplan` returns a redirect to `/xplan/1-setup`, or explicitly document and test `/xplan` as the canonical entry if that is the intended contract.
- Assert each legacy slug in [apps/xplan/lib/sheets.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/lib/sheets.ts:85) redirects to its canonical `/xplan/<sheet>` route while preserving query params.
- Assert tab clicks, keyboard sheet navigation, and year-switch navigation all keep the `/xplan` base path and preserve expected query params.
- Assert `/xplan/<sheet>?strategy=<valid>` stays on the requested strategy.
- Assert `/xplan/<sheet>?strategy=<invalid>` follows the chosen explicit contract instead of silently changing context.
- Assert unauthorized page access redirects to portal login with a `callbackUrl` that still includes the full `/xplan/...` route, based on [middleware callback construction](/Users/jarraramjad/dev/targonos-main/apps/xplan/middleware.ts:32).
- Assert forbidden access lands on `/xplan/no-access`, and “Back to Portal” exits xPlan rather than looping into `/xplan`.
- Assert `/xplan/<bad-sheet>` returns `notFound()` behavior from [apps/xplan/app/[sheet]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/xplan/app/[sheet]/page.tsx:2249).

## Cross-App Notes
- The portal app map says xPlan lives at `http://localhost:3208` in [dev.local.apps.json](/Users/jarraramjad/dev/targonos-main/dev.local.apps.json:1), but the prior smoke discovery recorded xPlan on `3008` in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:54). Cross-app launch tests need one canonical local topology or they will chase false failures.
- The same smoke doc already recorded a dirty xPlan landing path: `/xplan/1-strategies` redirected to `/xplan/1-setup`, but `/xplan/api/v1/xplan/assignees` returned `401` and the console logged `Authentication required` in [plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md](/Users/jarraramjad/dev/targonos-main/plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md:95). That is not a pure routing bug, but it directly affects whether the canonical landing path is actually usable.
- Base path is configured from env in [apps/xplan/next.config.ts](/Users/jarraramjad/dev/targonos-main/apps/xplan/next.config.ts:16), and the intended requirement is clearly `/xplan`. Cross-app smoke should always assert rendered routes on `/xplan/...`, not on bare `/<sheet>` paths.

## Open Questions
- Should `/xplan` be a real canonical landing route, or should xPlan enforce a single canonical workbook URL at `/xplan/1-setup`?
- When a deep link requests a strategy the user cannot access, should the app fail visibly, send them to setup, or switch them to a different accessible strategy?
- Is `xplan:last-location` meant to power resume behavior after login/no-access recovery, or is it leftover state that should be removed?
- Do we want to rely on Next’s automatic basePath handling for raw `/${slug}` links, or do we want explicit base-path-safe helpers everywhere?
- Is `NEXT_PUBLIC_PORTAL_AUTH_URL` guaranteed in every environment where `/xplan/no-access` can render? If not, the current back-link behavior is unsafe."}}
