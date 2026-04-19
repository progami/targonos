# Argus Cases Layout Tightening

## Goal

Keep the shipped 3-tier `/cases` drilldown structure, remove the visible report-date filter, and use the lower page area more effectively without changing the interaction model.

## Scope

- Remove the report-date dropdown from the top rail.
- Keep the market selector and search field.
- Continue using the route report date as page scope only.
- Rebalance the layout so the right-side detail panel occupies more of the remaining viewport height.
- Keep the existing tables, content hierarchy, approval behavior, and dark-mode styling.

## Layout Changes

### Top rail

- Keep `market` on the left.
- Keep `search` as the only freeform control.
- Remove the user-facing date selector entirely.

### Main body

- Preserve the 2-panel shell:
  - case selector on the left
  - timeline over detail on the right
- Give the overall shell a taller viewport-aware minimum height on desktop.
- Keep the timeline visually compact with a slightly tighter maximum height.
- Let the detail panel expand to fill the remaining right-column height so the lower empty space is reduced.
- Let the left case selector stretch to the same overall shell height.

## Non-Goals

- No routing changes.
- No data model changes.
- No selector or timeline behavior changes.
- No approval workflow changes.
- No visual redesign beyond spacing and height distribution.

## Verification

- `pnpm --dir apps/argus exec tsx --test lib/cases/reader.test.ts lib/cases/view-model.test.ts lib/cases/theme.test.ts`
- `pnpm --dir apps/argus lint`
- `pnpm --dir apps/argus type-check`
- Manual browser check on `/argus/cases` to confirm:
  - no report-date dropdown is visible
  - market + search remain
  - left selector and right detail column use vertical space better
