# 2026-04-11 Plutus Navigation Spec
## Goal
Define the actual Plutus navigation contract around `/plutus`: canonical entry, auth-gated landing, header and back navigation between finance surfaces, disconnected/setup recovery, and any dead or non-canonical routes that can strand users.

## Files Reviewed
- Full read: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-plutus-test-plan.md`
- Full read: `apps/plutus/next.config.ts`, `apps/plutus/middleware.ts`, `apps/plutus/lib/portal-session.ts`, `apps/plutus/lib/navigation-history.tsx`, `apps/plutus/lib/current-user.ts`
- Full read: `apps/plutus/app/layout.tsx`, `apps/plutus/app/page.tsx`, `apps/plutus/app/no-access/page.tsx`, `apps/plutus/app/bills/page.tsx`
- Full read: `apps/plutus/components/app-header.tsx`, `apps/plutus/components/page-header.tsx`, `apps/plutus/components/back-button.tsx`, `apps/plutus/components/not-connected-screen.tsx`
- Targeted navigation scan: `apps/plutus/app/setup/page.tsx`, `apps/plutus/app/settlements/page.tsx`, `apps/plutus/app/settlements/[region]/page.tsx`, `apps/plutus/app/settlements/[region]/[settlementId]/page.tsx`, `apps/plutus/app/settlements/journal-entry/[id]/page.tsx`, `apps/plutus/app/transactions/page.tsx`, `apps/plutus/app/cashflow/page.tsx`, `apps/plutus/app/chart-of-accounts/page.tsx`, `apps/plutus/app/data-sources/page.tsx`, `apps/plutus/app/settings/page.tsx`, `apps/plutus/app/settlement-mapping/page.tsx`

## Repro Routes
1. `/plutus`
2. `/plutus/settlements`
3. `/plutus/settlements/US`
4. `/plutus/settlements/US/{settlementId}`
5. `/plutus/settlements/US/{settlementId}?tab=history`
6. `/plutus/settlements/journal-entry/{id}`
7. `/plutus/transactions`
8. `/plutus/bills`
9. `/plutus/setup`
10. `/plutus/cashflow`
11. `/plutus/chart-of-accounts`
12. `/plutus/data-sources`
13. `/plutus/settings`
14. `/plutus/settlement-mapping`
15. `/plutus/no-access`
16. Unauthenticated deep link: `/plutus/transactions?tab=bill`

## Confirmed Issues
- `no-access` recovery is unsafe. `apps/plutus/app/no-access/page.tsx` resolves the return link from `NEXT_PUBLIC_PORTAL_AUTH_URL || PORTAL_AUTH_URL || '/'`, so a missing portal URL sends users to `/` instead of a guaranteed portal/app-launch origin. That is exactly the kind of recovery path that can strand a forbidden user.
- Settlement detail back navigation falls back to a non-canonical route. `apps/plutus/lib/navigation-history.tsx` derives the fallback for `/settlements/{region}/{settlementId}` by stripping the last segment, which yields `/settlements/{region}`. But `apps/plutus/app/settlements/[region]/page.tsx` immediately redirects that route to `/settlements?marketplace={region}`. Direct detail deep links therefore back into a redirect-only intermediate route instead of the canonical list URL.
- Bills is a legacy alias, not a real finance surface. `apps/plutus/app/bills/page.tsx` server-redirects to `/transactions?tab=bill`, while `apps/plutus/components/app-header.tsx` has no Bills entry at all. Users can deep-link into Bills, but the primary nav has no canonical way back to that view.

## Likely Root Causes
- Canonical route ownership is split across multiple layers instead of one route contract. Entry redirect lives in `app/page.tsx`, auth and login handoff live in `middleware.ts`, region normalization lives in `app/settlements/[region]/page.tsx`, Bills normalization lives in `app/bills/page.tsx`, and detail-tab normalization lives in the client page for settlement detail.
- Back navigation uses generic path truncation instead of route-aware targets. That works for simple hierarchies, but it does not understand that `/settlements/{region}` is only an alias for `/settlements?marketplace={region}`.
- Navigation and recovery flows are inconsistent across disconnected states. Many screens use `NotConnectedScreen` and send users to `${basePath}/api/qbo/connect`, while Setup and Settings have their own direct `window.location.href` connect behavior. The recovery intent is similar, but the implementation is fragmented.
- The route tree still carries legacy aliases that are no longer reflected in visible navigation. `bills` still exists as a route, `journal-entry` still exists as a route, and settlement-region segments still exist, but the header treats Plutus as a flatter set of canonical surfaces.

## Recommended Fixes
- Define one explicit canonical-route map for Plutus and use it everywhere. At minimum: root entry, settlement list by marketplace, settlement detail, bills view, no-access recovery, and login callback return.
- Make `no-access` use a required portal URL helper instead of falling back to `/`.
- Replace generic back fallback logic with route-aware targets. Settlement detail should go directly to `/settlements?marketplace={region}` when there is no usable in-app history.
- Decide whether Bills is a first-class surface or just a Transactions tab. If it is first-class, give it a visible nav destination. If it is not, remove the standalone route assumption from navigation logic and use a single helper for `transactions?tab=bill`.
- Unify disconnected/connect recovery so Setup, Settings, and the shared not-connected screens all use the same connect and return behavior.
- Keep `/plutus` as the only app entry route and `/settlements` as the canonical post-entry landing route.

## Verification Plan
- Verify `/plutus` lands on `/plutus/settlements` and never on a duplicate-base-path variant.
- Verify `/plutus/settlements/US` normalizes once to the canonical marketplace list route.
- Open `/plutus/settlements/US/{settlementId}` in a fresh tab and click Back. It should land directly on the canonical US settlements list, not a redirect alias.
- Open `/plutus/bills` and verify whether the resulting bill view has a stable in-app return path. Then switch away via header nav and verify whether users can get back to the same bill view intentionally.
- Force a forbidden user to `/plutus/transactions` and verify `/plutus/no-access` returns to the actual portal origin, not `/`.
- Force an unauthenticated deep link to `/plutus/transactions?tab=bill` and verify portal login returns to the exact path and query.
- Check disconnected flows on `/plutus/setup`, `/plutus/cashflow`, `/plutus/data-sources`, `/plutus/chart-of-accounts`, and `/plutus/settlement-mapping` to ensure the same QBO-connect recovery works end to end.

## Cross-App Notes
- `app-manifest.json` marks `plutus` as `active`.
- `dev.local.apps.json` maps Plutus to `http://localhost:3212`, while the 2026-04-11 cross-app smoke notes observed the app running on `3012`. That repo-wide port/app-map divergence is a broader launch risk, even though Plutus itself rendered cleanly in the smoke pass.
- The cross-app smoke already confirmed the current live happy path: `/plutus` redirected to `/plutus/settlements`, initial settlements data loaded, and `/plutus/transactions` rendered successfully.
- Plutus is role-gated in middleware, so launch behavior depends on shared portal auth and callback preservation, not just local route files.

## Open Questions
- What exact paths does `remapLegacySettlementPath()` rewrite today, and does it overlap with `/settlements/journal-entry/{id}` behavior?
- Is `NEXT_PUBLIC_PORTAL_AUTH_URL` guaranteed in every environment? If not, `no-access` recovery is currently under-specified.
- Should marketplace state be canonical in the path (`/settlements/US`) or in the query (`/settlements?marketplace=US`)? The codebase currently supports both.
- Should Bills remain a dedicated destination, or should it be treated purely as a Transactions tab with no standalone route?
- Do the QBO connect/callback handlers return users to the originating deep link, or do they always land on a fixed route after connection?
