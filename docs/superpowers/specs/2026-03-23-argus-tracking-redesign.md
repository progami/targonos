# Argus Monitoring Page Redesign

## Problem

The current monitoring page has two issues:
1. The change feed treats the event list and detail panel as equals (roughly 50/50 split). In practice, users scan the feed to find something relevant then spend their time in the detail. The detail should dominate.
2. Source Health is a long vertical scroll of individual scheduler jobs and datasets. It should be a compact status board with expandable run history.

## Design

### Layout: Compact Rail + Wide Detail (Approach A)

The page keeps its existing two-tab structure (Changes | Sources) within the same view.

#### Change Feed Tab

**Feed rail (~240px, left side):**
- Filters stacked vertically at the top of the rail: window selector, owner, category, severity, search input
- Each event is a compact card: severity color as a left border (critical=red, high=amber, medium=blue, low=gray), one-line headline, product shortname + relative timestamp below
- Selected event has a subtle background highlight
- Rail scrolls independently from the detail panel

**Detail panel (remaining width, right side):**
- Anchored by two elements: **timestamp** (when the change was detected, displayed prominently) and **what changed** (the core event data)
- Header: severity chip + owner chip, then the headline
- Body: a clean before → after table for each changed field, grouped by category (Rank, Offers, Price, etc.). Content adapts to the alert type — only show sections that have changes
- Footer: link to the listing detail page
- Empty state when no event is selected: centered prompt text, not a blank panel

**No changes to:** the header area (title, last-snapshot timestamp, refresh button), the filter options themselves (window/owner/category/severity/search), or the data flowing through the existing API routes.

#### Source Health Tab

The current data model has two separate collections: **jobs** (`MonitoringSchedulerJob` — the LaunchAgent/cron entries that run data collection) and **datasets** (`MonitoringHealthDataset` — the output files those jobs produce). The current page renders these as two separate sections. The redesign merges them into a single unified grid of "sources" for a flatter, more scannable view.

**Mapping to UI:**
- Each grid card represents a **job** (`MonitoringSchedulerJob` — the thing that runs on a schedule)
- The card shows the health status of its **primary dataset** — the first entry in the job's `outputs[]` array, matched to a `MonitoringHealthDataset` by name. If the job has no outputs or no matching dataset, use the job's own status.
- Status vocabulary unified from the existing enums:
  - `healthy` (green) — job status is `healthy` or `running`, and its primary dataset status is `healthy`
  - `stale` (amber) — dataset status is `stale`, or dataset status is `missing` (expected output file not found)
  - `failed` (red) — job status is `failed`, regardless of dataset status
  - The existing `running` job status is not shown as a separate state — a currently-running job is `healthy` unless its dataset is stale
  - The existing `missing` job status (plist not found) maps to `failed`

**Summary counters (inline, top):**
- Four numbers: Total, Healthy, Stale, Failed
- Color-coded (green/amber/red) for quick scanning

**Source grid:**
- Responsive grid of compact cards (`grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))`)
- Each card: status dot, source name, type badge (API/BROWSER/MANUAL), cadence label, last-run age in monospace
- Failed and stale sources sort to the top
- Subtle expand chevron on each card

**Expanded state:**
- Clicking a card expands it to span the full grid width; expanding one card collapses any previously expanded card (accordion behavior)
- Shows a run history table: timestamp, result summary, duration
- Last 10 runs shown by default
- Clicking again collapses

**Run history — backend change required:**
The current monitoring data model has no run history. `MonitoringSchedulerJob` stores only the current run state (pid, status, lastExitStatus). To populate the run history table:

- New API route: `GET /api/monitoring/health/[jobId]/runs` — returns last 10 runs for a given job
- **Data source approach**: Add a structured JSON run log. Each scheduler script (the LaunchAgent plist commands) will be modified to append a one-line JSON record to a `run-log.jsonl` file in its output directory on each execution. Record shape: `{ "timestamp": ISO8601, "status": "ok"|"failed", "summary": string, "durationMs": number, "errorMessage?": string }`. The new API route reads and parses this file, returning the last 10 entries.
- **Scope**: This requires modifying the existing scheduler shell scripts to append the log line — not just reading from existing data. This is a small change per script (append one line at exit) but touches multiple files.
- This is the **only backend addition** in this redesign — the change feed APIs and data models are untouched

**The current "Change Pipeline" context section** (explaining how the hourly job, CSV stream, change feed, and email alerts relate) is removed. The pipeline relationships should be evident from the source grid itself — a job card shows what it produces and when it last ran.

### What stays the same

- MUI as the component library
- Existing color system (navy/teal from `@targon/theme`)
- Sidebar navigation structure
- Change feed API routes (`/api/monitoring/overview`, `/api/monitoring/changes`) and data fetching logic
- Health API route (`/api/monitoring/health`) — still used, but supplemented by the new runs endpoint
- Prisma schema and monitoring types
- The detail page (`/tracking/[id]`) — this redesign only covers the main `/tracking` page

### Files to modify

- `apps/argus/app/(app)/tracking/page.tsx` — the main page component (currently 1436 lines, will be decomposed)
- `apps/argus/components/monitoring/ui.tsx` — shared UI components (MetricCard, chips, formatters stay; new SourceCard and RunHistory components)
- `apps/argus/app/api/monitoring/health/[jobId]/runs/route.ts` — new API route for run history
- `apps/argus/lib/monitoring/reader.ts` — extend to read run logs for a given job
- New components extracted: `FeedRail.tsx`, `ChangeDetail.tsx`, `SourceHealthGrid.tsx`, `SourceCard.tsx`

### Component decomposition

The current `page.tsx` at 1436 lines does too much. This redesign should break it into:

1. **`page.tsx`** — page shell, tab state, data fetching orchestration
2. **`FeedRail.tsx`** — filter controls + scrollable event list
3. **`ChangeDetail.tsx`** — detail panel for the selected change event
4. **`SourceHealthGrid.tsx`** — summary counters + source card grid
5. **`SourceCard.tsx`** — individual source card with expandable run history
