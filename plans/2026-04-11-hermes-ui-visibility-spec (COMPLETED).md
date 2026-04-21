# 2026-04-11 Hermes UI Visibility Spec
## Goal
Document Hermes UI visibility issues evidenced in the current shell and core/campaign routes, focusing on missing shell destinations, hidden or stranded navigation, no-access visibility, and layout problems that make key surfaces harder to reach or understand.

## Files Reviewed
- Required context: `app-manifest.json`, `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`, `plans/2026-04-11-hermes-test-plan.md`
- Root and global styling: `apps/hermes/src/app/layout.tsx`, `apps/hermes/src/app/globals.css`, `apps/hermes/src/app/page.tsx`, `apps/hermes/src/app/no-access/page.tsx`
- Listed route entry files: `apps/hermes/src/app/insights/page.tsx`, `apps/hermes/src/app/orders/page.tsx`, `apps/hermes/src/app/reviews/page.tsx`, `apps/hermes/src/app/messaging/page.tsx`, `apps/hermes/src/app/campaigns/page.tsx`, `apps/hermes/src/app/campaigns/new/page.tsx`, `apps/hermes/src/app/accounts/page.tsx`, `apps/hermes/src/app/logs/page.tsx`, `apps/hermes/src/app/settings/page.tsx`, `apps/hermes/src/app/experiments/page.tsx`, `apps/hermes/src/app/templates/page.tsx`
- Listed shell files: `apps/hermes/src/components/app-shell/app-shell.tsx`, `apps/hermes/src/components/app-shell/app-header.tsx`, `apps/hermes/src/components/app-shell/app-sidebar.tsx`, `apps/hermes/src/components/app-shell/nav.ts`
- Directly referenced UI-critical files needed because several listed routes are thin wrappers: `apps/hermes/src/components/hermes/page-header.tsx`, `apps/hermes/src/app/insights/insights-client.tsx`, `apps/hermes/src/app/orders/orders-client.tsx`, `apps/hermes/src/app/reviews/reviews-client.tsx`, `apps/hermes/src/app/messaging/messaging-client.tsx`, `apps/hermes/src/app/accounts/accounts-client.tsx`, `apps/hermes/src/app/logs/logs-client.tsx`

## Repro Routes
- `/hermes` -> redirects to `/hermes/insights` via `apps/hermes/src/app/page.tsx`
- `/hermes/insights`
- `/hermes/orders`
- `/hermes/reviews`
- `/hermes/messaging`
- `/hermes/campaigns`
- `/hermes/campaigns/new`
- `/hermes/experiments`
- `/hermes/templates`
- `/hermes/accounts`
- `/hermes/logs`
- `/hermes/settings`
- `/hermes/no-access`
- Mobile viewport on any Hermes route to reproduce shell-navigation visibility issues from `apps/hermes/src/components/app-shell/app-shell.tsx`, `apps/hermes/src/components/app-shell/app-header.tsx`, and `apps/hermes/src/components/app-shell/app-sidebar.tsx`

## Confirmed Issues
- Hermes has no visible mobile shell navigation. `apps/hermes/src/components/app-shell/app-sidebar.tsx` renders the sidebar as `hidden md:flex`, and `apps/hermes/src/components/app-shell/app-header.tsx` only renders breadcrumbs/back plus theme toggle. There is no hamburger, drawer, or alternate mobile nav entrypoint anywhere in the reviewed shell, so non-root destinations are stranded on small screens unless the user deep-links directly.
- The shell omits several first-class Hermes destinations. `apps/hermes/src/components/app-shell/nav.ts` only includes `/insights`, `/orders`, `/reviews`, `/messaging`, `/accounts`, `/logs`, and `/settings`. It does not include `/campaigns`, `/experiments`, or `/templates`, even though those routes exist in `apps/hermes/src/app/campaigns/page.tsx`, `apps/hermes/src/app/campaigns/new/page.tsx`, `apps/hermes/src/app/experiments/page.tsx`, and `apps/hermes/src/app/templates/page.tsx`, and the test plan treats campaigns and experiments/templates as main surfaces in `plans/2026-04-11-hermes-test-plan.md`.
- Omitted destinations also lose normal shell context. Because `apps/hermes/src/components/app-shell/app-header.tsx` builds breadcrumbs from `navItems` in `apps/hermes/src/components/app-shell/nav.ts`, routes like `/campaigns`, `/experiments`, and `/templates` are not backed by declared shell metadata. They fall back to slug-derived labels and never receive sidebar active-state visibility because `apps/hermes/src/components/app-shell/app-sidebar.tsx` only renders declared `navGroups`.
- The no-access surface is composed like a standalone page but still inherits the full Hermes shell. `apps/hermes/src/app/layout.tsx` always wraps every route in `AppShell`, while `apps/hermes/src/app/no-access/page.tsx` renders a centered `min-h-screen` standalone-style screen. That means blocked users still see the normal Hermes sidebar/header chrome instead of an isolated blocked state, and the page is styled as if it owns the full viewport when it does not.
- The no-access page nests a second `<main>` inside the shell’s `<main>`. `apps/hermes/src/components/app-shell/app-shell.tsx` renders `<main className="flex-1 ...">{children}</main>`, and `apps/hermes/src/app/no-access/page.tsx` returns its own `<main className="mx-auto flex min-h-screen ...">`. That is an explicit layout/landmark mismatch on the no-access route.

## Likely Root Causes
- Hermes route coverage and Hermes shell metadata have diverged. The route surface now includes campaigns, experiments, and templates, but `apps/hermes/src/components/app-shell/nav.ts` still models a smaller app.
- The shell is desktop-first with no responsive navigation fallback. `apps/hermes/src/components/app-shell/app-sidebar.tsx` disappears below `md`, but `apps/hermes/src/components/app-shell/app-header.tsx` was not given a mobile navigation control to replace it.
- The app-level layout in `apps/hermes/src/app/layout.tsx` applies `AppShell` to every route indiscriminately, including `/no-access`, while `apps/hermes/src/app/no-access/page.tsx` is authored as a full-screen standalone state.

## Recommended Fixes
- Add a real mobile navigation path to the Hermes shell. The simplest fix is a header menu trigger plus mobile drawer using the same `navGroups` data as the desktop sidebar.
- Bring `apps/hermes/src/components/app-shell/nav.ts` back in sync with the routed product surface. If `/campaigns`, `/experiments`, and `/templates` are meant to be user-facing, they need declared shell destinations and active-state support.
- Stop deriving shell breadcrumb behavior from an incomplete nav list. Use one canonical route-metadata source for labels, shell visibility, and active-state logic.
- Decide whether `/no-access` should be shell-less. If yes, exclude it from `AppShell` in `apps/hermes/src/app/layout.tsx`. If no, rewrite `apps/hermes/src/app/no-access/page.tsx` so it behaves like an in-shell blocked state instead of a standalone full-screen screen.
- Remove the nested-`main` mismatch on `/no-access` by making the page return a section/div container instead of another page-level landmark.

## Verification Plan
- Verify `/hermes` still redirects cleanly to `/hermes/insights` and that the shell renders without client exceptions, matching `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md`.
- On desktop, confirm the sidebar shows all intended primary destinations, including campaigns, experiments, and templates if they remain first-class routes.
- On mobile, verify there is a visible navigation affordance on `/insights`, `/orders`, `/campaigns`, and `/settings`, and that users can move between core surfaces without direct URL entry.
- Visit `/hermes/campaigns`, `/hermes/campaigns/new`, `/hermes/experiments`, and `/hermes/templates` and confirm the shell provides visible route context, not just page-local headers.
- Visit `/hermes/no-access` and confirm the chosen blocked-state behavior is consistent: either dedicated stripped-down screen or deliberate in-shell state, but not a mixed standalone-inside-shell layout.
- Add browser smoke assertions for shell visibility on mobile and for presence of campaigns/experiments/templates in app navigation, since current CI coverage does not guard those paths.

## Cross-App Notes
- `plans/2026-04-11-cross-app-ci-smoke-spec (COMPLETED).md` shows Hermes currently boots cleanly at `http://localhost:3014/hermes`, redirects to `/hermes/insights`, and can navigate to `/hermes/orders` without console errors.
- `plans/2026-04-11-hermes-test-plan.md` also says current browser coverage is effectively absent for campaigns, messaging, reviews, and settings, which aligns with the missing-shell-destination risk around non-core routes.
- The smoke spec notes a local port mismatch pattern across apps; Hermes was observed on `3014` while the portal app map expects `3214`. That is not a UI visibility defect by itself, but it matters for reliable shell smoke coverage.

## Open Questions
- Are `/campaigns`, `/experiments`, and `/templates` intended to be first-class user-facing destinations, or are they intentionally hidden from the Hermes shell? No direct evidence yet.
- Should `/no-access` suppress the full Hermes shell, or should blocked users still see app navigation and header chrome? No direct evidence yet.
- Is there an existing mobile navigation component elsewhere in Hermes that the current shell is supposed to mount but does not? No direct evidence yet.
- Beyond the shell issues above, there is no direct evidence yet from the gathered files that `/insights`, `/orders`, `/reviews`, `/messaging`, `/accounts`, `/logs`, or `/settings` hide their own page headings or primary actions once rendered.
