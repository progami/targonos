import test from 'node:test'
import assert from 'node:assert/strict'
import type { CaseReportBundle } from './reader-core'
import {
  createCaseApprovalRows,
  createCaseReportDateOptions,
  filterCaseApprovalRows,
  matchesCaseApprovalSearch,
  type CaseApprovalRow,
} from './view-model'

function buildBundle(): CaseReportBundle {
  return {
    reportDate: '2026-04-14',
    marketCode: 'US',
    marketSlug: 'us',
    marketLabel: 'USA - Dust Sheets',
    caseRoot: '/tmp/cases',
    reportPath: '/tmp/cases/reports/2026-04-14.md',
    caseJsonPath: '/tmp/cases/case.json',
    availableReportDates: ['2026-04-14'],
    daySummaries: [
      {
        reportDate: '2026-04-14',
        totalRows: 4,
        actionDueRows: 1,
        newCaseRows: 1,
        forumWatchRows: 1,
        watchingRows: 1,
      },
    ],
    trackedCaseIds: ['A-100', 'A-200', 'A-300', 'A-400'],
    generatedAt: '2026-04-14T08:00:00-05:00',
    sections: [
      {
        entity: 'TARGON',
        rows: [
          {
            category: 'Watching',
            issue: 'Legacy issue still waiting on reimbursement',
            caseId: 'A-100',
            daysAgo: '2 days ago',
            status: 'Work in progress',
            evidence: 'No new support reply.',
            assessment: 'Keep monitoring until the thread moves.',
            nextStep: 'Check again tomorrow.',
          },
          {
            category: 'Action due',
            issue: 'Refund needs a seller reply',
            caseId: 'A-200',
            daysAgo: '0 days ago',
            status: 'Answered',
            evidence: 'Amazon asked for an invoice today.',
            assessment: 'The thread is blocked on our reply.',
            nextStep: 'Reply with the invoice attachment.',
          },
        ],
      },
      {
        entity: 'NIGS LTD',
        rows: [
          {
            category: 'Forum watch',
            issue: 'Forum escalation mentioned reimbursement lag',
            caseId: 'A-300',
            daysAgo: '6 days ago',
            status: 'Investigating',
            evidence: 'Forum moderators acknowledged the pattern.',
            assessment: 'The issue is worth watching for spillover.',
            nextStep: 'Track whether the forum thread names our ASINs.',
          },
          {
            category: 'New case',
            issue: 'Fresh case opened for stranded inventory',
            caseId: 'A-400',
            daysAgo: '4 days ago',
            status: 'Opened',
            evidence: 'A new case appeared in the tracker.',
            assessment: 'This is a new issue and needs first-pass review.',
            nextStep: 'Read the opening case thread and summarize it.',
          },
        ],
      },
    ],
  }
}

function withDecision(row: CaseApprovalRow, decision: CaseApprovalRow['decision']): CaseApprovalRow {
  return {
    ...row,
    decision,
  }
}

test('createCaseApprovalRows flattens sections into fixed action order', () => {
  const rows = createCaseApprovalRows(buildBundle())

  assert.equal(rows.length, 4)
  assert.deepEqual(
    rows.map((row) => ({
      category: row.category,
      caseId: row.caseId,
      entity: row.entity,
      decision: row.decision,
    })),
    [
      { category: 'Action due', caseId: 'A-200', entity: 'TARGON', decision: 'pending' },
      { category: 'New case', caseId: 'A-400', entity: 'NIGS LTD', decision: 'pending' },
      { category: 'Forum watch', caseId: 'A-300', entity: 'NIGS LTD', decision: 'pending' },
      { category: 'Watching', caseId: 'A-100', entity: 'TARGON', decision: 'pending' },
    ],
  )
})

test('filterCaseApprovalRows applies decision and text filters together', () => {
  const rows = createCaseApprovalRows(buildBundle())
  const decidedRows = [
    withDecision(rows[0], 'approved'),
    rows[1],
    withDecision(rows[2], 'rejected'),
    rows[3],
  ]

  assert.deepEqual(
    filterCaseApprovalRows(decidedRows, {
      decision: 'pending',
      query: '',
    }).map((row) => row.caseId),
    ['A-400', 'A-100'],
  )

  assert.deepEqual(
    filterCaseApprovalRows(decidedRows, {
      decision: 'approved',
      query: 'invoice',
    }).map((row) => row.caseId),
    ['A-200'],
  )

  assert.deepEqual(
    filterCaseApprovalRows(decidedRows, {
      decision: 'all',
      query: 'nigs',
    }).map((row) => row.caseId),
    ['A-400', 'A-300'],
  )
})

test('matchesCaseApprovalSearch checks issue, assessment, next step, case id, and entity', () => {
  const row = createCaseApprovalRows(buildBundle())[0]

  assert.equal(matchesCaseApprovalSearch(row, 'refund'), true)
  assert.equal(matchesCaseApprovalSearch(row, 'invoice attachment'), true)
  assert.equal(matchesCaseApprovalSearch(row, 'A-200'), true)
  assert.equal(matchesCaseApprovalSearch(row, 'targon'), true)
  assert.equal(matchesCaseApprovalSearch(row, 'forum'), false)
})

test('createCaseReportDateOptions condenses day-over-day counts into top-rail labels', () => {
  const bundle = buildBundle()
  bundle.availableReportDates = ['2026-04-15', '2026-04-14']
  bundle.daySummaries = [
    {
      reportDate: '2026-04-15',
      totalRows: 2,
      actionDueRows: 0,
      newCaseRows: 0,
      forumWatchRows: 1,
      watchingRows: 1,
    },
    bundle.daySummaries[0],
  ]

  assert.deepEqual(createCaseReportDateOptions(bundle), [
    {
      reportDate: '2026-04-15',
      label: '2026-04-15 · 2 total · 1 forum · 1 watching',
    },
    {
      reportDate: '2026-04-14',
      label: '2026-04-14 · 4 total · 1 action due · 1 new · 1 forum · 1 watching',
    },
  ])
})
