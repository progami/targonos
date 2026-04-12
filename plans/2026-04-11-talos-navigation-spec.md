# 2026-04-11 Talos Navigation Spec
## Goal
Document the Talos navigation issues that are already evidenced in code and in the existing 2026-04-11 smoke/test specs, with emphasis on base-path normalization, duplicated-prefix handling, root-to-dashboard transitions, menu links, route rewrites, and wrong-destination redirects.

## Files Reviewed
- Required context: `app-manifest.json`, `dev.local.apps.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-talos-test-plan.md`
- Runtime/base-path/auth plumbing: `apps/talos/next.config.js`, `apps/talos/server.js`, `apps/talos/src/middleware.ts`, `apps/talos/src/lib/utils/base-path.ts`, `apps/talos/src/lib/portal.ts`, `apps/talos/src/hooks/usePortalSession.ts`, `apps/talos/src/lib/fetch-with-csrf.ts`, `apps/talos/src/lib/utils/patch-fetch.ts`, `apps/talos/src/lib/api-client.ts`
- Root/bootstrap flow: `apps/talos/src/app/layout.tsx`, `apps/talos/src/app/page.tsx`, `apps/talos/src/app/auth/login/page.tsx`, `apps/talos/src/components/layout/app-shell.tsx`, `apps/talos/src/components/layout/dashboard-layout.tsx`, `apps/talos/src/components/tenant/WorldMap.tsx`, `apps/talos/src/components/tenant/TenantIndicator.tsx`, `apps/talos/src/app/api/tenant/select/route.ts`, `apps/talos/src/app/api/tenant/current/route.ts`, `apps/talos/src/app/api/portal/session/route.ts`, `apps/talos/src/lib/tenant/constants.ts`
- Shell/nav definitions: `apps/talos/src/components/layout/main-nav.tsx`, `apps/talos/src/lib/navigation/main-nav.ts`, `apps/talos/src/components/ui/breadcrumb.tsx`, `apps/talos/src/components/layout/page-container.tsx`, `apps/talos/src/lib/amazon/workspace.ts`, `apps/talos/src/components/amazon/amazon-workspace-switcher.tsx`, `apps/talos/tests/unit/navigation.test.ts`
- Route entrypoints and redirects: `apps/talos/src/app/dashboard/page.tsx`, `apps/talos/src/app/operations/layout.tsx`, `apps/talos/src/app/operations/orders/page.tsx`, `apps/talos/src/app/operations/orders/[id]/page.tsx`, `apps/talos/src/app/operations/orders/new/page.tsx`, `apps/talos/src/app/operations/transactions/page.tsx`, `apps/talos/src/app/amazon/page.tsx`, `apps/talos/src/app/market/page.tsx`, `apps/talos/src/app/config/page.tsx`
- Live nav destinations reviewed for route/auth behavior: `apps/talos/src/app/operations/inventory/page.tsx`, `apps/talos/src/app/operations/purchase-orders/page.tsx`, `apps/talos/src/app/operations/fulfillment-orders/page.tsx`, `apps/talos/src/app/operations/storage-ledger/page.tsx`, `apps/talos/src/app/operations/financial-ledger/page.tsx`, `apps/talos/src/app/config/products/page.tsx`, `apps/talos/src/app/config/suppliers/page.tsx`, `apps/talos/src/app/config/warehouses/page.tsx`, `apps/talos/src/app/config/permissions/page.tsx`, `apps/talos/src/app/amazon/fba-fee-discrepancies/page.tsx`, `apps/talos/src/app/amazon/fba-fee-tables/page.tsx`, `apps/talos/src/app/market/shipment-planning/page.tsx`, `apps/talos/src/app/market/amazon/page.tsx`, `apps/talos/src/app/market/orders/page.tsx`, `apps/talos/src/app/market/reorder/page.tsx`
- Secondary link surfaces: `apps/talos/src/components/dashboard/order-pipeline.tsx`, `apps/talos/src/components/dashboard/cost-breakdown.tsx`, `apps/talos/src/components/dashboard/warehouse-inventory.tsx`, `apps/talos/src/components/ui/quick-start-guide.tsx`, `apps/talos/src/app/config/warehouses/warehouses-panel.tsx`

## Repro Routes
- `/` and `/talos` -> root region picker from `apps/talos/src/app/page.tsx`; select `US` or `UK`
- `/dashboard` -> dashboard bootstrap from `apps/talos/src/app/dashboard/page.tsx`
- `/operations` -> middleware redirect target in `apps/talos/src/middleware.ts:62-66`
- `/operations/orders`, `/operations/orders/[id]`, `/operations/orders/new`, `/operations/transactions` -> legacy redirects into purchase-order or inventory routes
- `/config` -> click `Cost Rates`
- `/amazon` -> server redirect in `apps/talos/src/app/amazon/page.tsx`
- `/market` -> server redirect in `apps/talos/src/app/market/page.tsx`
- `/market/shipment-planning` while unauthenticated under a `/talos/*` URL
- `/market/amazon` while unauthenticated under a `/talos/*` URL

## Confirmed Issues
- Rewrite-mode root still mounts the app shell. `apps/talos/next.config.js:135-143` explicitly supports `/talos/*` when `BASE_PATH` is unset, but `apps/talos/src/components/layout/app-shell.tsx:7-19` disables the shell only for exact `'/'`. The smoke spec recorded `GET /talos/api/portal/session` and `GET /talos/api/tenant/current` 401s during the landing flow; those calls come from `apps/talos/src/hooks/usePortalSession.ts:9-20` and `apps/talos/src/components/tenant/TenantIndicator.tsx:60-77`, which should not be mounted on the plain region-picker screen.
- `/market` redirects to a stale destination. `apps/talos/src/app/market/page.tsx:1-5` sends users to `/market/amazon`, but the canonical Amazon surfaces are only `/amazon/fba-fee-discrepancies`, `/amazon/fba-fee-tables`, and `/market/shipment-planning` in `apps/talos/src/lib/amazon/workspace.ts:19-44`, and `apps/talos/tests/unit/navigation.test.ts:7-35` asserts exactly that set. `apps/talos/src/app/market/amazon/page.tsx` is still an under-construction page.
- Market login callbacks are not base-path safe. `apps/talos/src/app/market/shipment-planning/page.tsx:80-84` and `apps/talos/src/app/market/amazon/page.tsx:261-263` build callback URLs from `window.location.origin + '/market/...'` instead of using `withBasePath()`. `apps/talos/src/app/market/orders/page.tsx:11-15` and `apps/talos/src/app/market/reorder/page.tsx:11-15` do the same with string concatenation on `NEXT_PUBLIC_APP_URL`.
- The `Cost Rates` links point to a route shape that is not implemented as a distinct view. `apps/talos/src/app/config/page.tsx:33-39` and `apps/talos/src/components/ui/quick-start-guide.tsx:54-59` link to `/config/warehouses?view=rates`, but `apps/talos/src/app/config/warehouses/page.tsx:23-37` and `apps/talos/src/app/config/warehouses/warehouses-panel.tsx:42-225` never read `view`. The actual rates routes are warehouse-specific links like `/config/warehouses/${id}/rates` in `apps/talos/src/app/config/warehouses/warehouses-panel.tsx:183-188`.
- Dashboard has an unauthenticated dead-end. `apps/talos/src/hooks/usePortalSession.ts:9-18` turns `401` into `null`, `apps/talos/src/app/dashboard/page.tsx:111-118` has the redirect effect commented out, and `apps/talos/src/app/dashboard/page.tsx:252-260` only renders “Redirecting to login...” without navigating. That matches the broken root-to-dashboard bootstrap described in `plans/2026-04-11-cross-app-ci-smoke-spec.md`.
- Navigation tests do not cover the runtime problems above. `apps/talos/tests/unit/navigation.test.ts:7-80` only asserts nav arrays and active-state matching; it does not exercise `/talos` rewrite mode, duplicated-prefix cleanup, `/market` redirection, or callback URL construction.

## Likely Root Causes
- Talos is supporting rewrite mode in `apps/talos/next.config.js:135-143`, normalizing fetch paths in `apps/talos/src/lib/utils/base-path.ts:39-89`, and cleaning doubled prefixes in `apps/talos/src/middleware.ts:49-67`, but many client links still use raw absolute hrefs: `apps/talos/src/components/layout/main-nav.tsx:121-201`, `apps/talos/src/components/amazon/amazon-workspace-switcher.tsx:22-38`, `apps/talos/src/app/config/page.tsx:53-72`, `apps/talos/src/components/dashboard/order-pipeline.tsx:40-63`, `apps/talos/src/components/dashboard/cost-breakdown.tsx:42-47`, and `apps/talos/src/components/dashboard/warehouse-inventory.tsx:24-29`. No direct evidence yet from a click trace in this pass, but the code paths are inconsistent.
- The root flow mixes public tenant selection with shell/session hooks. `apps/talos/src/components/tenant/WorldMap.tsx:138-186` assumes it can stay public until tenant selection succeeds, while `apps/talos/src/components/layout/main-nav.tsx` and `apps/talos/src/hooks/usePortalSession.ts` assume authenticated shell context.
- Talos is using three different redirect patterns at once: Next server `redirect()`, client `router.push()`, and ad hoc `redirectToPortal()` callback assembly. The drift is most obvious in the market routes and dashboard.

## Recommended Fixes
- Make shell suppression base-path aware by normalizing `usePathname()` through the same base-path stripping logic before checking disabled routes. The landing page should render as a pure public screen for both `/` and `/talos`.
- Pick one canonical market default and enforce it consistently. Based on `apps/talos/src/lib/amazon/workspace.ts` and `apps/talos/tests/unit/navigation.test.ts`, `/market` should redirect to `/market/shipment-planning` unless the workspace definitions are intentionally changing.
- Replace ad hoc market callback assembly with one shared helper that preserves the visible app path in both configured-base-path and rewrite-mode deployments.
- Remove or replace `/config/warehouses?view=rates` links until there is a real route or query-driven implementation for rates. Today the only concrete rates destination is `/config/warehouses/[id]/rates`.
- Restore a hard unauthenticated redirect path on the dashboard, or move the entire dashboard bootstrap back behind a server/middleware redirect so client code never lands on the “Redirecting to login...” dead-end.
- Add unit/browser coverage specifically for rewrite-mode landing, duplicated-prefix cleanup, `/operations` and `/market` redirect targets, and base-path-safe callback URLs.

## Verification Plan
- Run Talos in both modes: `BASE_PATH=/talos` and rewrite mode with `BASE_PATH` unset but `/talos/:path*` rewrite active.
- Assert `/` and `/talos` show the world map without mounting shell-only session calls before tenant selection.
- Select `US` and `UK` from the landing page; verify clean transition to `/dashboard` or clean redirect to portal login, with no `401` loop and no React runtime error.
- Assert `/operations` -> `/operations/inventory`, `/amazon` -> `/amazon/fba-fee-discrepancies`, and `/market` -> the chosen canonical market landing.
- Click main nav items, dashboard cards, config cards, and Amazon workspace switcher items in rewrite mode and verify the visible URL retains the expected prefix.
- Assert unauthenticated hits to `/market/shipment-planning` and `/market/amazon` produce callback URLs that include the Talos prefix when applicable.
- Extend `apps/talos/tests/unit/navigation.test.ts` or add browser smoke coverage per `plans/2026-04-11-cross-app-ci-smoke-spec.md` and `plans/2026-04-11-talos-test-plan.md`.

## Cross-App Notes
- The cross-app smoke spec already shows Talos navigation problems are entangled with shared auth/session failures: selecting `US` on 2026-04-11 produced `401` responses on `/talos/api/tenant/select`, `/talos/api/portal/session`, and `/talos/api/tenant/current`, plus `React error #418`.
- `dev.local.apps.json` maps Talos to `http://localhost:3201`, while the cross-app smoke discovery observed Talos on `3001`. CI smoke needs one canonical local Talos origin before navigation failures are interpreted.
- The repo-level smoke spec is the right place to catch these issues, because current Talos unit coverage does not exercise prefixed URLs, portal handoff, or wrong-destination redirects.

## Open Questions
- Is rewrite mode without `BASE_PATH` a supported long-term Talos deployment mode, or only a local compatibility path? No direct evidence yet.
- Should `/market` canonicalize to `/market/shipment-planning`, or is `/market/amazon` intended to become a live surface and be added back into `apps/talos/src/lib/amazon/workspace.ts` and `apps/talos/tests/unit/navigation.test.ts`?
- What should the product-level destination for “Cost Rates” be when no warehouse id is selected?
- Does `NEXT_PUBLIC_APP_URL` always include `/talos` in environments that still rely on the market server-page callback construction? No direct evidence yet.
