# 2026-04-11 Plutus UI Visibility Spec
## Goal
Document Plutus UI visibility and renderability issues on the main finance surfaces, with emphasis on `settlements`, `transactions`, `setup`, `cashflow`, and `no-access`, using code evidence plus the existing smoke and test-plan docs.

## Files Reviewed
- `app-manifest.json`
- `plans/2026-04-11-cross-app-ci-smoke-spec.md`
- `plans/2026-04-11-plutus-test-plan.md`
- `apps/plutus/app/layout.tsx`
- `apps/plutus/app/globals.css`
- `apps/plutus/app/page.tsx`
- `apps/plutus/app/no-access/page.tsx`
- `apps/plutus/app/settlements/page.tsx`
- `apps/plutus/app/transactions/page.tsx`
- `apps/plutus/app/cashflow/page.tsx`
- `apps/plutus/app/setup/page.tsx`
- `apps/plutus/components/app-header.tsx`
- `apps/plutus/components/page-header.tsx`
- `apps/plutus/components/back-button.tsx`
- `apps/plutus/components/not-connected-screen.tsx`
- `apps/plutus/lib/navigation-history.tsx`
- Directly referenced UI-critical dependency: `apps/plutus/components/providers.tsx`

## Repro Routes
- `/plutus` should redirect to `/plutus/settlements` via `apps/plutus/app/page.tsx`.
- `/plutus/settlements` is the canonical entry surface and carries the main primary actions from `apps/plutus/app/settlements/page.tsx`.
- `/plutus/transactions` is the secondary shell validation route from `apps/plutus/app/transactions/page.tsx`.
- `/plutus/cashflow` is the other action-heavy top-level route from `apps/plutus/app/cashflow/page.tsx`.
- `/plutus/setup` is the disconnected-state and wizard-visibility route from `apps/plutus/app/setup/page.tsx`.
- `/plutus/no-access` is the access-recovery surface from `apps/plutus/app/no-access/page.tsx`.
- Header breakpoint checks should be run at least at mobile, medium-width tablet, and desktop widths because `apps/plutus/components/app-header.tsx` uses separate `xs`/`md`/`lg` display rules.

## Confirmed Issues
- The marketplace selector disappears entirely at medium widths. In `apps/plutus/components/app-header.tsx`, the top-bar selector is only visible at `lg` and above (`display: { xs: 'none', lg: 'block' }`), while the drawer copy is hidden at `md` and above (`display: { md: 'none' }`). Result: on `md` breakpoints, the selector is not visible anywhere.
- The disconnected-state error message is nearly invisible. In `apps/plutus/components/not-connected-screen.tsx`, the error callout wrapper sets `opacity: 0.1`, which fades the entire subtree, including the error text and status dot, not just the background.
- `/setup` does not expose a clear route-level connection action when QuickBooks is disconnected. `apps/plutus/app/setup/page.tsx` renders only an inline notice card at the top-level disconnected branch, while `apps/plutus/app/settlements/page.tsx`, `apps/plutus/app/transactions/page.tsx`, and `apps/plutus/app/cashflow/page.tsx` return the full `NotConnectedScreen`. The setup notice itself contains no visible primary connect CTA.
- The primary actions on `/settlements` are not responsive. `apps/plutus/app/settlements/page.tsx` places `Sync from Amazon` and `Auto-process` in a rigid single-row flex container beside `PageHeader`, instead of using the responsive `actions` handling in `apps/plutus/components/page-header.tsx`. There is no wrap or stack rule on that outer action row.

## Likely Root Causes
- Header controls are split across desktop and mobile implementations in `apps/plutus/components/app-header.tsx`, but the breakpoint rules do not cover the middle range consistently.
- Disconnected-state handling is inconsistent across routes. `apps/plutus/components/not-connected-screen.tsx` exists and is used on `settlements`, `transactions`, and `cashflow`, but `apps/plutus/app/setup/page.tsx` uses a different top-level pattern.
- The error callout in `apps/plutus/components/not-connected-screen.tsx` uses container opacity instead of an alpha background color.
- `apps/plutus/app/settlements/page.tsx` bypasses the responsive action slot already built into `apps/plutus/components/page-header.tsx`.

## Recommended Fixes
- Make `MarketplaceSelector` visible on all intended breakpoints in `apps/plutus/components/app-header.tsx`, especially `md`.
- Fix `apps/plutus/components/not-connected-screen.tsx` so the error background is translucent without reducing text opacity.
- Standardize disconnected-state visibility across `apps/plutus/app/settlements/page.tsx`, `apps/plutus/app/transactions/page.tsx`, `apps/plutus/app/cashflow/page.tsx`, and `apps/plutus/app/setup/page.tsx`. If `/setup` is intentionally partially usable while disconnected, it still needs a visible top-level connect action.
- Move the `/settlements` primary actions into `PageHeader.actions` or add explicit small-screen wrapping/stacking in `apps/plutus/app/settlements/page.tsx`.

## Verification Plan
- Verify `/plutus` redirects once to `/plutus/settlements` and the header renders.
- Check `apps/plutus/components/app-header.tsx` behavior at mobile, `md`, and `lg` widths and confirm the marketplace selector is visible in each intended layout.
- Force a disconnected QBO state and confirm `/plutus/settlements`, `/plutus/transactions`, `/plutus/cashflow`, and `/plutus/setup` each show a readable recovery state with a visible next action.
- Trigger an error message on `NotConnectedScreen` and confirm the text remains legible.
- Check `/plutus/settlements` on narrow widths and confirm `Sync from Amazon` and `Auto-process` remain visible and clickable.
- Verify `/plutus/no-access` still shows a usable recovery link after the shared header mounts.

## Cross-App Notes
- `plans/2026-04-11-cross-app-ci-smoke-spec.md` already shows that Plutus is comparatively healthy at boot: `/plutus` redirected to `/plutus/settlements`, `/plutus/settlements` rendered successfully, `/plutus/api/plutus/settlements?page=1&pageSize=25` returned `200`, and `/plutus/transactions` also rendered successfully.
- The current Plutus visibility issues are therefore more about breakpoint behavior, disconnected-state clarity, and action discoverability than about first-load crashes.
- `plans/2026-04-11-plutus-test-plan.md` already expects explicit connected vs disconnected coverage on `/settlements` and `/setup`, so these visibility issues belong in browser CI rather than static checks.

## Open Questions
- Should `/setup` intentionally remain partially usable while disconnected, or should it match the full-screen `NotConnectedScreen` pattern used by `settlements`, `transactions`, and `cashflow`?
- Should the `/setup` disconnected notice include a top-level connect button even if deeper wizard sections also expose connection actions?
- Should `/no-access` remain a text-link recovery surface in `apps/plutus/app/no-access/page.tsx`, or should it expose a more prominent primary action? No direct evidence yet.
- Should all top-level Plutus pages use `PageHeader.actions` for primary actions so responsiveness stays consistent?
