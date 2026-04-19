# Argus Cases Drilldown Design

## Purpose

Redesign the Argus `/cases` surface from a flat approval queue into a 3-tier drilldown that matches how the case workflow actually operates:

1. choose a case
2. inspect that case's activity by report date
3. review the selected snapshot in full detail

This design also corrects the approval model. Human permission is not a universal action on every case row. Permission only appears when the agent has identified a human-gated send or post action.

## Why The Current Design Is Wrong

The current Argus cases page assumes one flat approval row per report entry and exposes inline `Approve` and `Reject` controls on every pending row.

That assumption does not match the actual case workflow:

- the daily report is a date-based snapshot
- `case.json` already holds richer per-case metadata than the report table
- `case-agent` only requires explicit approval when a human must actually send something
- monitoring rows, checkpoints, forum checks, and fallback evidence rows should remain read-only

The current implementation therefore over-indexes on approval and under-serves case navigation.

## Evidence From The Current Codebase And Live Data

### Argus frontend

- The route contract is still `/cases/[market]/[reportDate]` in [apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx:1).
- The current page renders [CaseApprovalQueuePage](/Users/jarraramjad/dev/targonos-main/apps/argus/components/cases/approval-queue-page.tsx:1), which drives a flat queue.
- The current queue table in [approval-queue-table.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/components/cases/approval-queue-table.tsx:1) renders inline `Approve` and `Reject` controls for every pending row.
- The current detail surface in [approval-detail-band.tsx](/Users/jarraramjad/dev/targonos-main/apps/argus/components/cases/approval-detail-band.tsx:1) assumes the selected item is still just one flat queue row.
- The current view model in [apps/argus/lib/cases/view-model.ts](/Users/jarraramjad/dev/targonos-main/apps/argus/lib/cases/view-model.ts:1) flattens the report bundle directly into `CaseApprovalRow[]`.

### Report source shape

- The markdown report parser in [apps/argus/lib/cases/reader-core.ts](/Users/jarraramjad/dev/targonos-main/apps/argus/lib/cases/reader-core.ts:1) parses report rows with only:
  - `category`
  - `issue`
  - `caseId`
  - `daysAgo`
  - `status`
  - `evidence`
  - `assessment`
  - `nextStep`
- The parser also resolves `availableReportDates` and day summaries across all reports, which is already enough to build a per-case timeline.

### Stable case metadata already exists outside the report rows

The live `case.json` files already contain richer, stable case-level metadata:

- US: [/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/cases/case.json](/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared%20drives/Dust%20Sheets%20-%20US/cases/case.json:1)
- UK: [/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - UK/Cases/case.json](/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared%20drives/Dust%20Sheets%20-%20UK/Cases/case.json:1)

Those records already expose fields Argus needs for the selector and detail surface:

- `title`
- `entity`
- `amazon_status`
- `created`
- `last_reply`
- `next_action`
- `next_action_date`
- `our_status`
- `linked_cases`
- `primary_email`

### Live saved state reinforces the same model

The marketplace state tables are per-case tracking ledgers, not approval ledgers:

- US: [/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/cases/state.md](/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared%20drives/Dust%20Sheets%20-%20US/cases/state.md:1)
- UK: [/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - UK/Cases/state.md](/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared%20drives/Dust%20Sheets%20-%20UK/Cases/state.md:1)

These files track `amazon_status`, `our_status`, `last_reply`, and `next_action`, which confirms the page should be case-first, then date-first, then detail.

### `case-agent` workflow

The `case-agent` skill at [/Users/jarraramjad/.agents/skills/case-agent/SKILL.md](/Users/jarraramjad/.agents/skills/case-agent/SKILL.md:1) explicitly defines:

- daily report output as a markdown case report table
- `case.json` as the synced machine-readable case record
- draft replies as explicit evidence-backed outputs only when needed
- no permission to send Seller Support replies or forum posts without approval

That means Argus should consume two different surfaces from the same workflow:

- report rows for the date timeline
- `case.json` for case metadata and approval hints

## Approved Decisions

The following choices were confirmed during design:

- Layout uses a `B` shape: left case selector rail, right drilldown content.
- Tier 1 columns are `Case | Entity | Status | Open since | Activity`.
- Tier 2 columns are `Date | Type | Status | Signal`.
- Tier 2 is one row per report date, not one row per raw message.
- Tier 3 is the full selected snapshot plus stable case metadata.
- Argus only consumes richer `case-agent` output. It does not surface launchd freshness on the cases page.
- Approval controls appear only when the recommendation is a human-gated send or post action.
- The approval control belongs in the detail panel, not in the selector or timeline tables.

## Non-Goals

- Rebuilding Seller Central conversation browsing inside Argus
- Showing launchd health or scheduler telemetry on the cases page
- Inventing approval behavior by parsing prose
- Adding backend persistence for approvals in this design pass
- Changing the markdown report format into a machine-only format

## Target Design

### 1. Page structure

The cases page becomes a 3-tier working surface:

1. **Case selector rail**
   - one row per case present in the selected report date
   - compact table, always visible
2. **Case activity timeline**
   - one row per report date for the selected case
   - forum-watch and case activity rows live in the same table
3. **Detail panel**
   - full selected report snapshot
   - stable case metadata
   - conditional approval block

The page remains desktop-first, dense, quiet, and built from MUI table primitives with minimal copy.

### 2. Tier 1: Case selector

Columns:

- `Case`
- `Entity`
- `Status`
- `Open since`
- `Activity`

Rules:

- `Case` is a compact compound cell: case ID + issue title
- `Status` comes from stable case metadata, not only the selected report row
- `Open since` uses the case creation date from `case.json`
- `Activity` is a compact count of available dated snapshots for that case
- rows sort by urgency based on the selected report-date row:
  - `Action due`
  - `New case`
  - `Forum watch`
  - `Watching`

Selecting a case refreshes tier 2 and tier 3.

### 3. Tier 2: Activity timeline

Columns:

- `Date`
- `Type`
- `Status`
- `Signal`

Rules:

- one row per report date for the selected case
- newest date first
- `Type` comes from the report row `category`
- `Status` comes from the report row `status`
- `Signal` is a short line distilled from the report snapshot, using the `evidence` field as the primary summary source

Selecting a timeline row refreshes only tier 3.

When the selected case changes, the newest available timeline row auto-selects.

### 4. Tier 3: Detail panel

Content order:

1. issue
2. next step
3. conditional approval block
4. evidence
5. assessment
6. metadata strip

Metadata strip contains:

- case ID
- entity
- Amazon status
- our status
- last reply
- created
- linked cases when present
- primary email when present

The detail panel is intentionally flat and restrained. It should not bring back the old report-card layout.

## Data Contract

### 1. Source responsibilities

Argus should join two sources with no fallback inference:

- `reports/YYYY-MM-DD.md`
  - daily snapshot rows
  - timeline history
  - selected detail snapshot
- `case.json`
  - stable case metadata
  - selector metadata
  - approval behavior flags

Join key:

- `case_id` / `caseId`

No fallback behavior:

- if a report row exists without a corresponding `case.json` case record, Argus should fail loudly in the view-model layer for tracked live cases
- if a case exists in `case.json` but not in the selected report date, it should not appear in the selector for that report date

### 2. Argus bundle shape

`readCaseReportBundle()` should stop exposing only `trackedCaseIds`. It should expose the parsed active `case.json` records required by the page.

The reader-layer output should include a machine-readable case map with at least:

- `caseId`
- `title`
- `entity`
- `amazonStatus`
- `ourStatus`
- `created`
- `lastReply`
- `nextAction`
- `nextActionDate`
- `linkedCases`
- `primaryEmail`
- `actionKind`
- `approvalRequired`

### 3. Required `case-agent` extension

`case-agent` should continue to produce the same human-readable markdown report table, but it must extend each active case record in `case.json` with:

- `action_kind`
- `approval_required`

Recommended `action_kind` values:

- `monitor`
- `checkpoint`
- `collect_evidence`
- `send_email`
- `send_case_reply`
- `send_forum_post`

Rule:

- `approval_required = true` only for:
  - `send_email`
  - `send_case_reply`
  - `send_forum_post`
- all other action kinds are read-only in Argus

Argus must not guess this behavior by parsing `next_action`.

## Interaction Model

### 1. Selection flow

- page loads on a report date
- selector shows all cases from that report date
- first case auto-selects
- newest timeline row for that case auto-selects
- changing the case resets the timeline selection to the newest row
- changing the timeline row updates only detail

### 2. Approval model

Approval is not a table action.

- tier 1: no action buttons
- tier 2: no action buttons
- tier 3:
  - if `approvalRequired === false`, show read-only detail only
  - if `approvalRequired === true`, show a compact approval block beneath `Next step`

Approval block contents:

- status chip: `Approval required`
- supporting source label from `actionKind`
- primary action: `Approve send`
- secondary action: `Hold`

This keeps scanning clean and only introduces permission controls at the moment the operator is inspecting the exact proposed send action.

### 3. Filters and controls

Top rail controls stay minimal:

- market selector
- report-date selector
- free-text search

Search should cover both selector and timeline relevance fields:

- issue
- case ID
- entity
- evidence
- assessment
- next action

There is no universal decision filter anymore because the page is no longer a blanket approval queue.

## View-Model Split

The current `approval-queue` naming and one-table abstraction no longer fit the page.

Target split:

- `apps/argus/lib/cases/view-model.ts`
  - build selector rows
  - build timeline rows
  - build selected detail model
- `apps/argus/components/cases/case-selector-table.tsx`
  - tier 1 selector
- `apps/argus/components/cases/case-activity-table.tsx`
  - tier 2 timeline
- `apps/argus/components/cases/case-detail-panel.tsx`
  - tier 3 detail and conditional approval block
- `apps/argus/components/cases/cases-drilldown-page.tsx`
  - top rail and selection state

The existing `approval-queue-*` component names should be removed rather than preserved as misleading wrappers.

## Files Expected To Change

Argus repo:

- `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx`
- `apps/argus/lib/cases/reader-core.ts`
- `apps/argus/lib/cases/reader.ts`
- `apps/argus/lib/cases/view-model.ts`
- `apps/argus/lib/cases/view-model.test.ts`
- `apps/argus/lib/cases/reader.test.ts`
- `apps/argus/lib/cases/theme.ts`
- `apps/argus/lib/cases/theme.test.ts`
- delete or replace:
  - `apps/argus/components/cases/approval-queue-page.tsx`
  - `apps/argus/components/cases/approval-queue-table.tsx`
  - `apps/argus/components/cases/approval-detail-band.tsx`
- create:
  - `apps/argus/components/cases/cases-drilldown-page.tsx`
  - `apps/argus/components/cases/case-selector-table.tsx`
  - `apps/argus/components/cases/case-activity-table.tsx`
  - `apps/argus/components/cases/case-detail-panel.tsx`

External workflow dependency:

- [/Users/jarraramjad/.agents/skills/case-agent/SKILL.md](/Users/jarraramjad/.agents/skills/case-agent/SKILL.md:1)
- whatever implementation updates the synchronized `case.json` records that skill governs

## Testing And Verification

### Automated

Add or update tests proving:

- selector rows are derived from the selected report date plus `case.json`
- timeline rows are derived across report dates for one case
- changing case auto-selects the newest timeline row
- detail model merges snapshot fields with stable case metadata
- approval block appears only when `approvalRequired === true`
- there is no prose-based fallback inference for permission behavior

### Manual

Verify in Argus:

- selector remains visible while timeline and detail update
- forum-watch rows and ordinary case rows coexist in the same timeline table
- read-only rows never show permission controls
- send-required rows show the approval block only in the detail panel
- the page still feels like one restrained operational surface, not a report reader and not a generic approval dashboard

## Scope Check

This remains one focused design project:

- same route structure
- same report ingestion path
- same daily `case-agent` workflow
- one explicit schema extension for `case.json`
- no scheduler health UI
- no backend approval persistence

## Superseded Design

This design supersedes the earlier flat approval-queue direction in [2026-04-14-argus-cases-approval-queue-design.md](/Users/jarraramjad/dev/targonos-main/docs/superpowers/specs/2026-04-14-argus-cases-approval-queue-design.md:1).
