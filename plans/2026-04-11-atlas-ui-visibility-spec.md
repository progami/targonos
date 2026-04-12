# 2026-04-11 Atlas UI Visibility Spec
## Goal
Document Atlas UI visibility problems evidenced in the current shell and primary HR surfaces, with emphasis on missing page chrome, hidden actions, inconsistent headings, and route-shell visibility across `/hub`, `/tasks`, `/employees`, `/leave`, and `/no-access`.

## Files Reviewed
- Required context: `app-manifest.json`, `plans/2026-04-11-cross-app-ci-smoke-spec.md`, `plans/2026-04-11-atlas-test-plan.md`
- Root shell and styling: `apps/atlas/app/layout.tsx`, `apps/atlas/app/globals.css`, `apps/atlas/app/(atlas)/layout.tsx`
- Reviewed surfaces: `apps/atlas/app/no-access/page.tsx`, `apps/atlas/app/(atlas)/page.tsx`, `apps/atlas/app/(atlas)/hub/page.tsx`, `apps/atlas/app/(atlas)/tasks/page.tsx`, `apps/atlas/app/(atlas)/employees/page.tsx`, `apps/atlas/app/(atlas)/leave/page.tsx`
- Listed UI components: `apps/atlas/components/hub/HubDashboard.tsx`, `apps/atlas/components/ui/PageHeader.tsx`, `apps/atlas/components/ui/BackButton.tsx`, `apps/atlas/components/ui/NotificationBell.tsx`
- Directly referenced UI-critical files: `apps/atlas/app/(atlas)/employees/EmployeesClientPage.tsx`, `apps/atlas/lib/navigation-history.tsx`

## Repro Routes
- `/atlas` -> redirects to `/atlas/hub` via `apps/atlas/app/(atlas)/page.tsx`
- `/atlas/hub`
- `/atlas/tasks`
- `/atlas/employees`
- `/atlas/leave`
- `/atlas/no-access`
- Mobile viewport on `/atlas/tasks` is required to reproduce the wrong sticky header title from `apps/atlas/app/(atlas)/layout.tsx`

## Confirmed Issues
- The Tasks surface is not visible in Atlas shell navigation. `apps/atlas/app/(atlas)/layout.tsx` defines the full sidebar/mobile nav structure, but its `navigation` array has no `/tasks` item, even though `apps/atlas/app/(atlas)/tasks/page.tsx` is a first-class route and `plans/2026-04-11-atlas-test-plan.md` treats `/tasks` as P0.
- The mobile shell header shows the wrong page title on `/tasks`. In `apps/atlas/app/(atlas)/layout.tsx`, `getCurrentPageName()` derives the mobile header label only from the sidebar `navigation` array and falls back to `'My Hub'`. Because `/tasks` is missing from that nav, the sticky mobile header on the Tasks page reads `My Hub` while `apps/atlas/app/(atlas)/tasks/page.tsx` renders `Task List`.
- The notification action exists but is not renderable from the reviewed Atlas shell. `apps/atlas/components/ui/NotificationBell.tsx` defines the bell/popover UI, but `apps/atlas/app/(atlas)/layout.tsx` does not render it, and none of the reviewed hub/tasks/employees/leave/no-access surfaces import it. On the inspected primary surfaces, there is no visible notification entry point.
- Atlas uses inconsistent page chrome across its core surfaces. `apps/atlas/components/hub/HubDashboard.tsx` renders a bespoke compact header (`My Hub` with tabs), `apps/atlas/app/(atlas)/tasks/page.tsx`, `apps/atlas/app/(atlas)/leave/page.tsx`, and `apps/atlas/app/(atlas)/employees/EmployeesClientPage.tsx` use `ListPageHeader`, while `apps/atlas/app/no-access/page.tsx` renders a standalone centered card outside the `(atlas)` shell. The result is visibly different heading hierarchy and action placement across adjacent primary routes.
- The no-access surface drops all standard Atlas shell chrome. `apps/atlas/app/no-access/page.tsx` lives outside `apps/atlas/app/(atlas)/layout.tsx`, so the sidebar, mobile header, top-right Targon wordmark, command palette shell, and version footer are not visible on the blocked-access path.

## Likely Root Causes
- The sidebar nav model in `apps/atlas/app/(atlas)/layout.tsx` is being reused as the route-title source for the mobile header. Missing routes are therefore both undiscoverable in navigation and mislabeled in mobile chrome.
- Shared chrome is fragmented. `apps/atlas/components/ui/NotificationBell.tsx` exists as a standalone component, but the shared layout in `apps/atlas/app/(atlas)/layout.tsx` never mounts it.
- Atlas currently has three separate chrome patterns instead of one: bespoke hub chrome in `apps/atlas/components/hub/HubDashboard.tsx`, shared list/detail chrome in `apps/atlas/components/ui/PageHeader.tsx`, and a shell-less access-denied page in `apps/atlas/app/no-access/page.tsx`.

## Recommended Fixes
- Add `/tasks` to the shell navigation in `apps/atlas/app/(atlas)/layout.tsx`, then stop using sidebar membership as the only source of mobile route titles.
- Introduce a dedicated route-title map for the mobile header in `apps/atlas/app/(atlas)/layout.tsx` so non-sidebar routes cannot silently fall back to `My Hub`.
- Mount `apps/atlas/components/ui/NotificationBell.tsx` in shared Atlas chrome, or remove/defer it explicitly if notifications are not part of the current shell.
- Standardize primary-surface chrome. Either adapt `apps/atlas/components/hub/HubDashboard.tsx` to the shared header pattern or define a deliberate hub-specific variant and use that consistently.
- Decide whether `apps/atlas/app/no-access/page.tsx` should remain shell-less. If not, move it into a lightweight branded shell so access-denied users still see consistent Atlas framing and versioning.

## Verification Plan
- Visit `/atlas` and confirm redirect to `/atlas/hub` still renders cleanly with the intended hub chrome.
- Visit `/atlas/tasks` on desktop and mobile. Confirm the route is discoverable in the shell nav and the mobile sticky header says `Tasks` or `Task List`, not `My Hub`.
- Visit `/atlas/employees` and `/atlas/leave` and compare heading size, back-button placement, and primary action placement against the chosen standard.
- Visit `/atlas/no-access` with a blocked or unprovisioned user and confirm the intended shell visibility decision is implemented consistently.
- Verify the notification bell is visible on shell pages and that it opens without displacing or obscuring page headers.
- Add browser assertions for shell chrome visibility on `/hub`, `/tasks`, `/employees`, `/leave`, and `/no-access`, since current Atlas smoke coverage does not guard these regressions.

## Cross-App Notes
- `plans/2026-04-11-cross-app-ci-smoke-spec.md` shows Atlas was one of the cleaner apps in the live pass: `/atlas/hub` and `/atlas/calendar` rendered successfully with no console errors.
- `plans/2026-04-11-atlas-test-plan.md` also states no crash was observed on `/atlas/hub` in the live smoke pass.
- The current gap is not initial boot stability; it is that Atlas browser coverage still leaves shell-visibility and page-chrome regressions mostly unguarded beyond the narrow existing task-flow smoke.

## Open Questions
- Should `/tasks` be a first-class shell destination, or is its omission from `apps/atlas/app/(atlas)/layout.tsx` intentional? No direct evidence yet.
- Should `apps/atlas/app/no-access/page.tsx` intentionally omit all Atlas shell chrome, or should blocked users still see branded app framing and version info?
- Should the hub keep its custom header from `apps/atlas/components/hub/HubDashboard.tsx`, or should Atlas unify all primary surfaces on `apps/atlas/components/ui/PageHeader.tsx` / `ListPageHeader`?
- Is `apps/atlas/components/ui/NotificationBell.tsx` meant to be live product chrome or currently unused placeholder UI? No direct evidence yet.
