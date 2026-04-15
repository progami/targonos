# Argus Cases Approval Queue Design

## Purpose

Redesign the Argus `/cases` surface from a narrative case brief into a lean approval queue for daily agent recommendations.

The operator workflow is:

1. agents survey forum posts and Seller Central cases
2. Argus presents the recommended next action for each active issue
3. the human scans the queue, reviews the rationale only when needed, and approves or rejects the proposed action

This design is intentionally about the Argus frontend surface. It is not a rebuild of Amazon case-history browsing inside Argus.

## Evidence From The Current Codebase

The current cases flow is a markdown reader with a narrative layout, not an approval queue:

- `/cases/[market]/[reportDate]` loads a `CaseReportBundle` and renders one page component in [apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx:18).
- The parsed report shape is section-based: `sections[]` with `entity` and `rows[]`, and each row has only `category`, `issue`, `caseId`, `daysAgo`, `status`, `evidence`, `assessment`, and `nextStep` in [apps/argus/lib/cases/reader-core.ts](/Users/jarraramjad/dev/targonos-main/apps/argus/lib/cases/reader-core.ts:25).
- The current page leads with a hero, market pills, summary metrics, report-date pills, sticky section headers, and wide three-column row blocks in [apps/argus/components/cases/report-page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/components/cases/report-page.tsx:314).
- The current reader tests only cover markdown parsing and latest-report resolution in [apps/argus/lib/cases/reader.test.ts](/Users/jarraramjad/dev/targonos-main/apps/argus/lib/cases/reader.test.ts:11). There is no decision or approval state anywhere in the cases module today.

## Decisions

The design is based on the following approved choices:

- The page becomes a daily approval queue for agent-recommended actions.
- One row equals one proposed action.
- The primary surface is a dense table, not cards, tiles, or entity blocks.
- The default view hides resolved items and focuses on pending approval work.
- Entity grouping is removed from the main layout. `entity` remains row context, not a section header.
- Inline `Approve` and `Reject` controls live in the rightmost table column.
- Full context moves into a plain detail band below the table instead of staying expanded in every row.
- The redesign uses the existing markdown data fields. It does not invent a second report source.
- Because no cases decision API exists today, the redesign defines a frontend decision interface and state model. Persistence is explicitly out of scope for this design pass.

## Goals

- Make the next operator decision obvious within one screen.
- Reduce page chrome and narrative copy to the minimum needed to work the queue.
- Keep operators in a fast scan-select-decide loop.
- Preserve access to the evidence and assessment without forcing that detail into every row.
- Keep the current route structure and markdown ingestion path intact.

## Non-Goals

- Rebuilding Amazon Seller Central case history inside Argus
- Designing or implementing a backend approval workflow store
- Changing how markdown reports are generated in shared drive storage
- Adding dashboard metrics, decorative report framing, or explanatory marketing copy

## Approaches Considered

### 1. Keep The Current Brief And Compress It

Remove some spacing and visual styling but keep the hero, entity sections, and wide narrative row blocks.

Why not:

- It still optimizes for reading a brief instead of approving the next action.
- It keeps the operator scanning through prose and grouped sections before they can decide anything.

### 2. Flat Approval Queue With Detail Band

Flatten all section rows into one queue, keep the page chrome minimal, and move full rationale into a selected-row detail band.

Why this is the selected approach:

- It matches the operator job: scan pending recommendations, inspect one, decide, move on.
- It removes the current section-framing noise without losing the underlying case context.
- It can be built directly from the current markdown bundle without requiring a new backend source.

### 3. Split Columns By Entity Or Case State

Show separate buckets per entity or separate panes for action-due, watching, and forum-watch items.

Why not:

- It reintroduces layout grouping that slows down scanning.
- It makes the page feel like a report organizer again instead of a decision queue.

## Target Design

### 1. Route And Data Loading Stay The Same

The route chain remains:

- `/cases` redirects to a default market in [apps/argus/app/(app)/cases/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/app/(app)/cases/page.tsx:5)
- `/cases/[market]` resolves the latest report date in [apps/argus/app/(app)/cases/[market]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/app/(app)/cases/[market]/page.tsx:15)
- `/cases/[market]/[reportDate]` reads the bundle and renders the page in [apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx:18)

This redesign changes the rendering model, not the route contract.

### 2. Flatten The Report Into Queue Rows

The page will derive a client-facing queue model from `bundle.sections`.

Each queue row will contain:

- `rowKey` — deterministic key from `entity`, `caseId`, `issue`, and row index
- `entity`
- `category`
- `issue`
- `assessment`
- `nextStep`
- `status`
- `daysAgo`
- `caseId`
- `evidence`
- `decision` — frontend-only state: `pending`, `approved`, or `rejected`

Column mapping:

- `Type` -> `category`
- `Issue` -> `issue`
- `Assessment` -> `assessment`
- `Next step` -> `nextStep`
- `Entity` -> `entity`
- `Age` -> `daysAgo`
- `Decision` -> inline actions or resolved label

`status`, `caseId`, and `evidence` do not get dedicated default columns. They live in the selected-row detail band.

### 3. Page Layout

The page becomes a two-part working surface:

- A compact top rail with market selector, report-date selector, search, and decision filter
- A single dense table with a sticky header
- A plain detail band below the table for the currently selected row

Removed from the page:

- hero copy
- summary metrics
- market pill stack
- report-date pill cloud
- section headers by entity
- expanded multi-column row narratives
- footer copy about the shared drive backend

### 4. Table Behavior

Default table behavior:

- Show only `pending` rows on first load
- Sort rows by fixed category order: `Action due`, `New case`, `Forum watch`, `Watching`
- Within the same category, sort older items first
- Keep each table row to one line per cell in the default view
- Truncate long `assessment` and `nextStep` values with ellipsis in-row
- Click anywhere on a row to select it and populate the detail band

The table is a work queue, not a document viewer. The row should answer: what is wrong, what do the agents think, and what do they want to do next.

### 5. Detail Band

Selecting a row reveals a plain detail band directly below the table.

The detail band contains:

- issue title
- proposed next step as the primary line
- assessment in full
- evidence in full
- metadata strip: entity, case ID, support status, age, category

This band is intentionally flat and quiet. No cards, no decorative framing, no nested panels.

### 6. Decision Model

The UI exposes two explicit actions per pending row:

- `Approve`
- `Reject`

Decision behavior in this design:

- Clicking either action updates frontend state for that row
- Decided rows leave the default `pending` queue immediately
- A status filter can reveal `approved` and `rejected` rows again
- Resolved rows render a compact decision label instead of action buttons

Because there is no cases decision API today, this state is session-local in the initial redesign. The component contract must still be shaped as `onDecision(rowKey, decision)` so persistence can be attached later without redesigning the page again.

### 7. Filtering

The top rail contains only the controls that directly help work the queue:

- market
- report date
- free-text search across `issue`, `assessment`, `nextStep`, `caseId`, and `entity`
- decision filter: `pending`, `approved`, `rejected`, `all`

There is no separate entity sidebar and no category tab strip. Category remains visible as a column and as part of the default sort order.

### 8. Visual Direction

The surface should feel operational and restrained:

- use Inter for interface copy and JetBrains Mono for case IDs and age values
- use the existing navy and teal theme language from Argus
- use teal as the affirmative action color
- use red only for rejection and urgent rows
- keep borders light, spacing tight, and typography hierarchy strong
- no gradients, no ornamental typography, no serif display type, no report-style mood setting

The table should feel closer to a review ledger than a dashboard.

### 9. Component Decomposition

The current `report-page.tsx` should be broken into smaller units instead of replaced by another monolith.

Target split:

- `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx` — unchanged server entrypoint
- `apps/argus/components/cases/approval-queue-page.tsx` — client shell, filter state, selected row state, decision state
- `apps/argus/components/cases/approval-queue-table.tsx` — sticky-header table and row rendering
- `apps/argus/components/cases/approval-detail-band.tsx` — selected-row detail surface
- `apps/argus/lib/cases/view-model.ts` — flattening, sorting, filtering helpers derived from `CaseReportBundle`

`apps/argus/components/cases/report-page.tsx` should be replaced by `approval-queue-page.tsx` and removed. The new approval queue should not be implemented by continuing to grow the current narrative component.

### 10. Testing

Existing parser coverage in `apps/argus/lib/cases/reader.test.ts` stays.

Add coverage for the redesign at the view-model layer:

- flattening sectioned rows into queue rows
- stable default sorting
- decision filtering
- search matching across the intended fields

Do not introduce a new React component test harness as part of this redesign. Extend the existing `node:test` coverage around the queue view-model and verify the row-selection and decision-flow behavior during implementation with app-level manual checks plus the normal Argus lint and type-check commands.

## Files Expected To Change

- delete: `apps/argus/components/cases/report-page.tsx`
- `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx`
- `apps/argus/lib/cases/theme.ts`
- `apps/argus/lib/cases/theme.test.ts`
- `apps/argus/lib/cases/reader.test.ts`
- new: `apps/argus/components/cases/approval-queue-page.tsx`
- new: `apps/argus/components/cases/approval-queue-table.tsx`
- new: `apps/argus/components/cases/approval-detail-band.tsx`
- new: `apps/argus/lib/cases/view-model.ts`
- new test file for the queue view-model

## Scope Check

This is still one frontend redesign project:

- same route structure
- same bundle source
- same markdown contract
- no backend persistence work

That keeps the next step focused enough for a single implementation plan.
