# Feature Plan: Include Current Week Sales (Incomplete Week)

## Goal
Allow sales values from the *current week* to populate in the UI so downstream calculations (including `P&L (5)`) include the most recent partial-week data.

## Users
- Ops planning / finance users working in xplan

## Problem / Motivation
Today we only fill sales values for *completed* weeks. The current week is excluded, so sales + `P&L (5)` lag until the week finishes. We want to see partial week performance preemptively.

## Scope
- In scope:
  - Include the current (in-progress) week in the sales fill logic.
  - Ensure `P&L (5)` includes the current week values.
  - UI indicator for incomplete week (see UX below).
- Out of scope:
  - Changing how future/forecast weeks work.
  - Reworking Sellerboard sync scheduling or data model (unless required to surface current-week values).

## UX / Flows
- Past weeks (complete):
  - Cyan fill + green dot (existing behavior)
- Current week (incomplete):
  - Cyan fill + yellow dot
  - Values can be shown/used even though the week is incomplete

## Data / DB
- Schema changes: none expected
- Migrations: none expected
- Completeness rule (proposal): `isCurrentWeek` vs `isPastWeek` based on the week start/end dates in the user’s timezone (need to confirm the existing week boundary logic).

## API / Server
- Identify where the app filters out the current week (likely a `weekEnd < now` / `isPastWeek` gate).
- Update the query/transform to include the current week row, and propagate an `isIncompleteWeek` flag (or compute it client-side) for the dot color.

## Edge Cases
- Week boundary (Sun/Mon) and timezone correctness.
- Partial data: current week should display even if not all days are present.
- When the week becomes “past”, it should render as complete (green dot) after data refresh.

## Acceptance Criteria
- The current week shows populated sales values.
- The current week is rendered with cyan fill + yellow dot.
- `P&L (5)` reflects the current week values.
- Past weeks remain unchanged (cyan + green dot).

## Tasks
- [ ] Confirm which screen/table owns the sales fill + `P&L (5)` logic
- [ ] Locate and remove/adjust the “exclude current week” condition
- [ ] Add `isIncompleteWeek` visual state (yellow dot) for current week
- [ ] Verify in Chrome on `https://dev-targonos.targonglobal.com/xplan`
