# 2026-04-11 Atlas Test Plan

## Purpose
Define the CI smoke suite for Atlas so HR workflows fail in CI when auth, tasks, employee management, leave, or policy flows regress.
Atlas is the HR operations app: hub, tasks, employees, leave, policies, performance, hiring, and admin access are the main user journeys.

## Standard Gate
- Use the repo-standard Playwright smoke harness.
- Fail on page errors, console errors, and API failures for the route under test.
- Preserve the current Atlas pattern of creating and deleting disposable records inside the test when possible.

## P0 Flows

### 1. Signed-Out Access Guard
Routes: `/tasks`, `/hub`

Checks:
- Signed-out user is redirected to portal sign-in.
- Redirected page shows the expected portal UI.

### 2. Hub
Routes: `/hub`

Checks:
- Hub dashboard renders for an entitled user.
- Core widgets load without a client exception.

### 3. Tasks
Routes: `/tasks`, `/tasks/add`, `/tasks/[id]`

Checks:
- Task list loads.
- Task create flow works with disposable fixture data.
- Created task detail renders and can be updated.
- Task can be deleted in test cleanup.

### 4. Employees
Routes: `/employees`, `/employees/[id]`, `/employees/[id]/edit`

Checks:
- Employee list loads.
- Detail page opens for a known employee.
- Edit page respects field-permission gating and saves an allowed field change.

### 5. Leave Management
Routes: `/leave`, `/leave/request`, `/leave/[id]`

Checks:
- Leave list loads.
- Leave request form opens and submits with disposable fixture data.
- Leave detail opens for an existing request.

### 6. Policies
Routes: `/policies`, `/policies/add`, `/policies/[id]`, `/policies/[id]/edit`

Checks:
- Policy list loads.
- Policy detail renders.
- Add and edit screens open without a client-side failure.

### 7. Performance and Discipline
Routes: `/performance/reviews`, `/performance/disciplinary`, `/performance/violations`

Checks:
- Each list route loads.
- One known detail page per module can open.
- Add/edit routes render without crashing.

## P1 Flows

### 8. Calendar
Routes: `/calendar`

Checks:
- HR calendar loads and groups events.

### 9. Contractors and Hiring
Routes: `/contractors`, `/hiring`, `/hiring/schedule`

Checks:
- Contractor list loads.
- Hiring and schedule views render.

### 10. Secrets and Password Stores
Routes: `/passwords`, `/passwords/credit-cards`, `/secrets`, `/secrets/credit-cards`

Checks:
- Password and secret tables render for an authorized user.
- Unauthorized users are blocked cleanly.

### 11. Admin Access
Routes: `/admin/access`

Checks:
- Admin access table renders for an authorized user.
- Unauthorized user is redirected instead of seeing a broken table.

## Fixtures and Data
- One entitled Atlas user.
- One HR or super-admin test user.
- One seeded employee, leave request, policy, performance review, disciplinary action, violation, and contractor.
- Disposable task fixture for create/delete smoke.

## Known Issues From 2026-04-11
- No crash was observed in the live smoke pass on `/atlas/hub` or `/atlas/calendar`.
- Existing Atlas e2e coverage only covers signed-out redirect, tasks page load, and create/delete task. The rest of the HR surface is currently unguarded by browser CI.
