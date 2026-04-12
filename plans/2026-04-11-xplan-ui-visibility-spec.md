# 2026-04-11 xPlan UI Visibility Spec
## Goal
Assess xPlan UI visibility on the root, workbook, and no-access surfaces, with emphasis on whether the workbook shell actually renders usable context, whether tabs and strategy state are visible, and whether any layout or runtime failures already evidenced in smoke are degrading what users see.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-xplan-test-plan.md`
- `apps/xplan/app/layout.tsx`
- `apps/xplan/app/globals.css`
- `apps/xplan/app/page.tsx`
- `apps/xplan/app/no-access/page.tsx`
- `apps/xplan/app/[sheet]/page.tsx` (workbook boot/render sections reviewed from the evidence already gathered before finalization)
- `apps/xplan/app/[sheet]/error.tsx`
- `apps/xplan/components/providers.tsx`
- `apps/xplan/components/workbook-layout.tsx`
- `apps/xplan/components/sheet-tabs.tsx`
- `apps/xplan/components/active-strategy-indicator.tsx`
- `apps/xplan/components/theme-toggle.tsx`
- `apps/xplan/tests/ui/workbook-layout.test.tsx`
- `apps/xplan/tests/ui/sheet-tabs.test.tsx`

## Repro Routes
- `/xplan` renders the same server page as `/xplan/1-setup` because `apps/xplan/app/page.tsx` directly invokes the `[sheet]` page with `sheet: '1-setup'`.
- `/xplan/1-setup` is the primary workbook boot surface served by `apps/xplan/app/[sheet]/page.tsx` and chromed by `apps/xplan/components/workbook-layout.tsx`.
- `/xplan/1-strategies` currently canonicalizes to `/xplan/1-setup` according to `plans/2026-04-11-cross-app-ci-smoke-spec.md`.
- `/xplan/no-access` is served by `apps/xplan/app/no-access/page.tsx`. No direct smoke evidence yet of a visibility failure on this route.
- `/xplan/[sheet]` client-side exceptions fall into `apps/xplan/app/[sheet]/error.tsx`. No direct smoke evidence yet that this boundary is being hit during normal workbook boot.

## Confirmed Issues
- The primary workbook surface already emits a runtime auth failure during visible boot. `plans/2026-04-11-cross-app-ci-smoke-spec.md` records `GET /xplan/api/v1/xplan/assignees` returning `401` and a browser `Error: Authentication required` while loading the workbook route backed by `apps/xplan/app/[sheet]/page.tsx`.
- The workbook shell can render without any active strategy context. The same smoke evidence shows a visible shell with `Setup` and `No strategies found` instead of a strategy-backed workbook state. That is directly relevant to `apps/xplan/components/active-strategy-indicator.tsx`, which can only show context that was successfully loaded.
- Root visibility inherits the same failure mode as workbook boot. Because `apps/xplan/app/page.tsx` reuses the `[sheet]` route instead of redirecting to an isolated landing page, any workbook bootstrap failure affects `/xplan` directly.
- No direct evidence yet that sheet tabs are hidden or unrenderable. `apps/xplan/components/workbook-layout.tsx` renders `apps/xplan/components/sheet-tabs.tsx` in the top workbook chrome and again in the mobile footer, and `apps/xplan/components/sheet-tabs.tsx` does not hide tabs except through the `sheets` data it receives.
- No direct evidence yet that `apps/xplan/app/no-access/page.tsx` or `apps/xplan/app/globals.css` produce a blank or visually broken surface.

## Likely Root Causes
- Workbook boot is coupled to auth-backed data before the visible workbook state is complete. The confirmed `401` on `/xplan/api/v1/xplan/assignees` indicates the route in `apps/xplan/app/[sheet]/page.tsx` can reach a partial render while required context is still unauthorized.
- Strategy visibility is data-driven, not route-guaranteed. `apps/xplan/components/active-strategy-indicator.tsx` and `apps/xplan/components/sheet-tabs.tsx` are presentational; if `apps/xplan/app/[sheet]/page.tsx` supplies empty or unauthorized workbook state, the chrome can render while key context remains absent.
- Root and setup are the same surface. `apps/xplan/app/page.tsx` makes `/xplan` a direct workbook boot path, so there is no simpler root page that could remain visible when workbook initialization breaks.
- UI coverage is too shallow to catch the current failure mode. `apps/xplan/tests/ui/workbook-layout.test.tsx` only checks year-control behavior, and `apps/xplan/tests/ui/sheet-tabs.test.tsx` only checks active-state and href behavior. Neither test suite exercises real workbook boot visibility, no-access renderability, or active-strategy presence.

## Recommended Fixes
- Make auth/bootstrap failures render as an explicit blocked or error state on `/xplan` and `/xplan/1-setup` instead of a misleading empty workbook surface.
- Separate “no strategies exist” from “strategy context failed to load” in the workbook state coming out of `apps/xplan/app/[sheet]/page.tsx`.
- Add route-level visibility coverage for `/xplan`, `/xplan/1-setup`, and `/xplan/no-access`, not just component-only tests in `apps/xplan/tests/ui/workbook-layout.test.tsx` and `apps/xplan/tests/ui/sheet-tabs.test.tsx`.
- Add assertions that the real workbook route shows visible tabs and visible strategy context when boot succeeds, since `apps/xplan/components/workbook-layout.tsx` intends both to be present.
- Keep `apps/xplan/app/[sheet]/error.tsx` in the visibility test matrix so client-side failures produce recoverable UI instead of a broken workbook area.

## Verification Plan
- Browser-test `/xplan` and `/xplan/1-setup` with authenticated and unauthenticated states, and fail on any console error or `401` during workbook boot as required by `plans/2026-04-11-cross-app-ci-smoke-spec.md`.
- Assert that successful workbook boot shows the workbook chrome from `apps/xplan/components/workbook-layout.tsx`, visible sheet tabs from `apps/xplan/components/sheet-tabs.tsx`, and visible strategy context rather than `No strategies found`.
- Add a negative test proving that auth failure does not silently degrade into the same empty-looking state used for an actually empty strategy list.
- Add a route-level render test for `/xplan/no-access` to confirm that the page content and actions from `apps/xplan/app/no-access/page.tsx` remain visible.
- Add an error-boundary test for `apps/xplan/app/[sheet]/error.tsx` so a client render failure shows recovery UI instead of leaving the workbook blank.

## Cross-App Notes
- `app-manifest.json` marks `xplan` as an active app.
- `plans/2026-04-11-cross-app-ci-smoke-spec.md` already identifies xPlan as a shell that rendered while still producing a runtime auth failure on first load. That makes xPlan a visibility risk even when the page is not technically blank.
- The same cross-app smoke spec notes that `apps/xplan/next.config.ts` is configured with `typescript.ignoreBuildErrors = true`, which increases the chance of UI regressions reaching runtime.
- `plans/2026-04-11-xplan-test-plan.md` already treats root boot, workbook shell visibility, sheet tabs, and strategy indicators as P0 coverage, which aligns with the current smoke evidence.

## Open Questions
- Is the `No strategies found` state on `/xplan/1-setup` intended for real zero-strategy tenants, or is it currently masking the `401` / `Authentication required` workbook boot failure recorded in `plans/2026-04-11-cross-app-ci-smoke-spec.md`?
- Does `apps/xplan/app/[sheet]/page.tsx` intentionally allow workbook chrome to render before strategy context is validated, or is that partial-render path accidental?
- No direct evidence yet that sheet tabs are hidden in the live UI, but there is also no route-level test proving their visibility under real workbook boot conditions.
- No direct evidence yet of a visual defect on `apps/xplan/app/no-access/page.tsx`; the current gap is missing runtime coverage, not a confirmed render bug.
- No direct evidence yet that `apps/xplan/app/globals.css` is causing a workbook or no-access visibility defect.
