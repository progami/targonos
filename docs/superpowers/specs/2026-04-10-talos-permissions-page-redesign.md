# Talos Permissions Page Redesign

## Problem

The current Talos permissions page does the job, but the UI is working against the task:

1. It mixes two unrelated tools on one page. RBAC editing and Manufacturing Product Assignments compete for attention.
2. The main interaction is a long accordion stack. It is slow to scan and repeats too much UI for each user.
3. The page looks like a generic admin screen rather than a focused Talos operations tool.
4. The copy is too heavy. The page should read like a control surface, not a product explainer.

## Goals

- Make access auditing fast.
- Make explicit grant/revoke edits fast.
- Show the difference between baseline role access and direct per-user grants.
- Remove Manufacturing Product Assignments from this page entirely.
- Keep the page visually lean, flat, and operational.

## Non-Goals

- No new permissions model.
- No role editor.
- No deny rules.
- No new backend endpoints if the existing APIs are sufficient.
- No card-grid dashboard treatment.

## Design

### Layout: Split-Pane Access Control

The page becomes a two-column workspace:

- **Left roster pane (~320px)** for finding and selecting users
- **Right detail pane (remaining width)** for inspecting and editing the selected user

This replaces the current accordion list.

### Header

Keep the existing Talos page shell, but simplify the surface:

- Title: `Permissions`
- Remove the current descriptive subtext tone and replace it with minimal metadata only
- Show compact inline counts in the header row:
  - user count
  - override count
  - super-admin count

These are text-level counters, not metric cards.

### Left Pane: User Roster

The roster is a flat selection list with lightweight filtering.

Elements:

- Search input
- Filter chips:
  - All
  - Admins
  - Staff
  - Overrides
- User rows showing only:
  - name
  - role
  - override count or `all` for super admin

Behavior:

- Clicking a row selects that user and updates the right pane
- The selected row gets the strongest emphasis
- Super admin rows are still selectable, but the right pane is read-only

### Right Pane: Selected User Workspace

The right pane is the primary surface. It shows one user at a time.

Top section:

- selected user name
- role
- compact pills for:
  - baseline permission count
  - direct override count

Below that, permissions are grouped by category in simple stacked rows, not cards.

Each permission row contains:

- permission code or short label
- source state:
  - `Direct`
  - `Baseline`
  - `Off`
- action button:
  - `Grant` when off
  - `Revoke` when direct
  - disabled `Locked` when baseline

### Visual Direction

The page should feel like Talos, not a template:

- light mode first for this admin surface
- navy-led neutral hierarchy with teal reserved for true emphasis
- flatter layout with borders, spacing, and alignment doing most of the work
- almost no explanatory copy
- no metric cards
- no repeated badges unless they carry real state

This should read like a control panel for operators who already know what they are doing.

## Data and Interaction Model

### Existing APIs

Use the current endpoints:

- `GET /api/users`
- `GET /api/permissions`
- `POST /api/users/[id]/permissions`
- `DELETE /api/users/[id]/permissions/[code]`

No new endpoint is required for the redesign.

### Effective Access vs Explicit Grants

Current backend behavior:

- `/api/users` returns explicit user permissions only
- role baseline access is defined in `permission-service.ts`
- super admins have implicit full access

To support the redesigned UI, the client should derive row state like this:

- `Direct` when the permission exists in the explicit grants list
- `Baseline` when the permission is not directly granted but is implied by the selected user role
- `Off` otherwise
- `All` or read-only state for super admins

No fallback behavior is needed. If role mapping is missing, the UI should fail visibly during development rather than silently guessing.

### State

The page keeps local client state for:

- selected user id
- search term
- active filter
- in-flight permission mutation

Default selected user:

- first visible user in the filtered roster

If filtering removes the selected user:

- select the first remaining visible user

## Error Handling

- Keep existing toast feedback for grant/revoke mutations
- Keep hard access gating for non-super-admin sessions
- Do not add secondary fallback views
- If user or permission data fails to load, keep the page in an explicit failed state rather than partially rendering a fake empty UI

## Empty and Special States

- If no users match search/filter, show a minimal empty roster state in the left pane
- If no user is selected because the filtered set is empty, the right pane shows a compact empty state
- For super admins, the right pane should show permission rows as fully available but non-editable

## Files to Modify

- `apps/talos/src/app/config/permissions/page.tsx`
- `apps/talos/src/app/config/permissions/permissions-panel.tsx`

Potential extractions if needed:

- `apps/talos/src/app/config/permissions/user-roster.tsx`
- `apps/talos/src/app/config/permissions/user-permission-detail.tsx`

The page should be decomposed if `permissions-panel.tsx` stays too large after the redesign.

## Code Removal

Remove all Manufacturing Product Assignments UI and related state/effects from the permissions page:

- assignment email state
- assignment SKU state
- assignment loading/saving/deleting state
- assignment data fetching
- assignment add/remove handlers
- assignment panel markup

This is in-scope cleanup, not optional follow-up.

## Testing

### UI Behavior

- selecting a user updates the detail pane
- search filters the roster
- filter chips narrow the roster correctly
- grant action changes a row from `Off` to `Direct`
- revoke action changes a row from `Direct` to either `Baseline` or `Off`
- super admin detail pane is read-only

### Verification

- `pnpm --filter @targon/talos type-check`
- `pnpm --filter @targon/talos lint`
- targeted browser verification with `chrome-devtools-mcp` on:
  - `/talos/config/permissions`

## Recommended Implementation Order

1. Remove Manufacturing Product Assignments code and simplify the data model in `permissions-panel.tsx`
2. Introduce roster selection state and split-pane layout
3. Derive `Direct` / `Baseline` / `Off` row states from selected user data and role baseline rules
4. Restyle rows, header, and filters to the flatter Talos direction
5. Run checks and verify the live page in the browser
