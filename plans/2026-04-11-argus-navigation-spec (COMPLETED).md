# 2026-04-11 Argus Navigation Spec
## Goal
Document the current Argus navigation contract around `/argus`: canonical entry, shell destinations across WPR/monitoring/cases/listings, legacy tracking redirects, no-access recovery, and whether the code-backed route inventory matches the route inventory promised by the test plan.

## Files Reviewed
- `app-manifest.json`
- `dev.local.apps.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`
- `plans/2026-04-11-argus-test-plan.md`
- `apps/argus/next.config.js`
- `apps/argus/middleware.ts`
- `apps/argus/lib/base-path.ts`
- `apps/argus/app/layout.tsx`
- `apps/argus/app/page.tsx`
- `apps/argus/app/no-access/page.tsx`
- `apps/argus/app/(app)/layout.tsx`
- `apps/argus/app/(app)/wpr/layout.tsx`
- `apps/argus/components/wpr/wpr-layout.tsx`
- `apps/argus/components/layout/app-shell.tsx`
- `apps/argus/app/(app)/wpr/page.tsx`
- `apps/argus/app/(app)/monitoring/page.tsx`
- `apps/argus/app/(app)/cases/page.tsx`
- `apps/argus/app/(app)/cases/[market]/page.tsx`
- `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx`
- `apps/argus/app/(app)/listings/page.tsx`
- `apps/argus/app/(app)/tracking/page.tsx`
- `apps/argus/app/(app)/tracking/[id]/page.tsx`

## Repro Routes
- `/argus`
- `/argus/wpr`
- `/argus/wpr/compare`
- `/argus/wpr/competitor`
- `/argus/wpr/changelog`
- `/argus/wpr/sources`
- `/argus/monitoring`
- `/argus/monitoring/[id]`
- `/argus/cases`
- `/argus/cases/us`
- `/argus/cases/us/[reportDate]`
- `/argus/listings`
- `/argus/listings/[id]`
- `/argus/tracking`
- `/argus/tracking/[id]`
- `/argus/no-access`

## Confirmed Issues
- `no-access` recovery is unsafe. `apps/argus/app/no-access/page.tsx` resolves the portal link from `NEXT_PUBLIC_PORTAL_AUTH_URL || '/'`, so a missing env drops forbidden users onto `/` instead of a guaranteed portal launcher/home URL.
- The cases route contract in code does not match the route contract in the test plan. `plans/2026-04-11-argus-test-plan.md` treats `/cases/[market]` as a loadable market page, but `apps/argus/app/(app)/cases/[market]/page.tsx` immediately redirects to `/cases/${market}/${reportDate}`. The market-level route is an alias, not a real navigable surface.
- Local topology is inconsistent. `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` recorded Argus running on `3016`, while `dev.local.apps.json` expects `http://localhost:3216/argus`, and `apps/argus/next.config.js` defaults `NEXT_PUBLIC_APP_URL` to `http://localhost:3216/argus` in development. That mismatch affects callback/login routing constructed by middleware.

## Likely Root Causes
- Navigation ownership is split between shell links, WPR-local tabs, and redirect aliases. The shell owns only top-level sections, while WPR owns its own sub-nav and cases/tracking rely on redirect-only compatibility routes.
- Recovery links are configuration-driven but not configuration-safe, just like the other portal-integrated apps.
- The test plan appears to describe the conceptual route inventory, while the code has already normalized some of those routes into redirect aliases. The spec and implementation drifted apart.

## Recommended Fixes
- Make `/argus/no-access` use a required portal/launcher URL helper instead of falling back to `/`.
- Update the Argus route inventory so code and smoke coverage agree. If `/cases/[market]` is intentionally redirect-only, stop treating it as a standalone page in the test plan. If it should be a real page, stop redirecting it immediately.
- Unify Argus standalone host/port across app map, runtime, and auth env so middleware callback URLs reflect the actual local launcher target.
- Add browser coverage for the legacy aliases: `/tracking` -> `/monitoring` and `/tracking/[id]` -> `/monitoring/[id]`, with explicit loop protection.

## Verification Plan
- Assert `/argus` redirects to `/argus/wpr`.
- Assert the shell nav loads `/wpr`, `/monitoring`, `/listings`, and `/cases/us` without dropping the `/argus` base path.
- Assert the WPR tab bar loads `/wpr/compare`, `/wpr/competitor`, `/wpr/changelog`, and `/wpr/sources` successfully.
- Assert `/argus/cases` redirects once to `/argus/cases/us`, and `/argus/cases/us` either behaves as a real page or is tested as a redirect alias consistently.
- Assert `/argus/tracking` redirects once to `/argus/monitoring`, and `/argus/tracking/[id]` redirects once to `/argus/monitoring/[id]` with no loops.
- Force a forbidden user to `/argus/monitoring` and verify `/argus/no-access` returns to the actual portal origin, not `/`.
- Assert callback/login handoff uses the same Argus host/port the launcher map uses.

## Cross-App Notes
- `app-manifest.json` marks Argus as `active`.
- The cross-app smoke already confirmed the current happy path for `/argus/wpr` and `/argus/monitoring`, but it did not exercise cases, listings, no-access recovery, or legacy tracking redirects.
- Argus shares the same local topology drift as Hermes, Kairos, Plutus, and xPlan: the portal app map and the observed runtime are not aligned.

## Open Questions
- Should `/cases/[market]` remain a redirect-only alias, or should it become a real market landing page as the test plan implies?
- Is the authoritative local Argus origin `3016` or `3216`?
- Should `/argus/no-access` return to the portal launcher, the auth root, or a dedicated support flow?
