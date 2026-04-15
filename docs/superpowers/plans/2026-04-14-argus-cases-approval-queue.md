# Argus Cases Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrative `/cases` brief with a dense approval queue that lets operators scan agent recommendations, inspect details, and approve or reject the proposed next step.

**Architecture:** Build a queue view-model on top of the existing markdown `CaseReportBundle`, then render that queue through a small client shell composed of a sticky-header table and a plain detail band. Keep the route and markdown reader intact, use session-local decision state only, and delete the old brief component instead of mutating it further.

**Tech Stack:** Next.js 16, React 19, MUI 7, TypeScript, `node:test`, ESLint

---

### Task 1: Build the queue view-model with TDD

**Files:**
- Create: `apps/argus/lib/cases/view-model.ts`
- Create: `apps/argus/lib/cases/view-model.test.ts`
- Modify: `apps/argus/lib/cases/reader.test.ts`

- [ ] Add failing `node:test` coverage for flattening `bundle.sections` into queue rows, fixed category ordering (`Action due`, `New case`, `Forum watch`, `Watching`), older-first sorting within a category, free-text search, and pending/approved/rejected filtering.
- [ ] Run: `pnpm --dir apps/argus exec tsx --test lib/cases/view-model.test.ts`
- [ ] Implement the minimal queue helpers in `view-model.ts`:
  - `createCaseApprovalRows(bundle: CaseReportBundle): CaseApprovalRow[]`
  - `filterCaseApprovalRows(rows, filters): CaseApprovalRow[]`
  - `matchesCaseApprovalSearch(row, query): boolean`
  - queue row shape carrying `rowKey`, `entity`, `category`, `issue`, `assessment`, `nextStep`, `status`, `daysAgo`, `caseId`, `evidence`, and `decision`
- [ ] Re-run: `pnpm --dir apps/argus exec tsx --test lib/cases/view-model.test.ts`
- [ ] Extend `reader.test.ts` with one assertion that preserves the current markdown contract the view-model depends on.

### Task 2: Replace the narrative cases UI with the approval queue shell

**Files:**
- Create: `apps/argus/components/cases/approval-queue-page.tsx`
- Create: `apps/argus/components/cases/approval-queue-table.tsx`
- Create: `apps/argus/components/cases/approval-detail-band.tsx`
- Modify: `apps/argus/lib/cases/theme.ts`
- Modify: `apps/argus/lib/cases/theme.test.ts`
- Delete: `apps/argus/components/cases/report-page.tsx`

- [ ] Add the minimal theme helpers needed by the queue surface and replace tests so they verify queue-specific category and action colors instead of hero/date-pill chrome.
- [ ] Run: `pnpm --dir apps/argus exec tsx --test lib/cases/theme.test.ts`
- [ ] Implement `approval-queue-table.tsx` as a dense sticky-header MUI table with columns `Type`, `Issue`, `Assessment`, `Next step`, `Entity`, `Age`, and `Decision`.
- [ ] Implement `approval-detail-band.tsx` as a flat selected-row detail surface that renders full issue, next step, assessment, evidence, and metadata.
- [ ] Implement `approval-queue-page.tsx` as the client shell that:
  - derives rows from `createCaseApprovalRows(bundle)`
  - keeps session-local `decisionByRowKey`, `searchQuery`, `decisionFilter`, and `selectedRowKey` state
  - removes rows from the default pending view immediately after approval/rejection
  - keeps the top rail limited to market, report date, search, and decision filter
- [ ] Run: `pnpm -F @targon/argus lint`

### Task 3: Wire the route to the new queue and verify the full surface

**Files:**
- Modify: `apps/argus/app/(app)/cases/[market]/[reportDate]/page.tsx`
- Modify: `apps/argus/app/(app)/cases/[market]/page.tsx` only if route typing/import cleanup is required after the component swap
- Modify: `apps/argus/app/(app)/cases/page.tsx` only if route typing/import cleanup is required after the component swap

- [ ] Update the dated cases page to import and render `CaseApprovalQueuePage` instead of the deleted `CaseReportPageContent`.
- [ ] Run: `pnpm -F @targon/argus type-check`
- [ ] Run: `pnpm -F @targon/argus lint`
- [ ] Manually verify the flow in the Argus app:
  - `/cases/us/<latest-date>` loads without the removed hero/metric/section layout
  - the table defaults to pending rows only
  - selecting a row updates the detail band
  - approving or rejecting a row removes it from the default queue
  - switching the decision filter reveals resolved rows again
- [ ] Run: `git status --short`

