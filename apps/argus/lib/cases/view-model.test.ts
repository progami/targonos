import test from 'node:test'
import assert from 'node:assert/strict'
import type { CaseReportBundle } from './reader-core'
import {
  createCaseDetailModel,
  createCaseReportDateOptions,
  createCaseSelectorRows,
  createCaseTimelineRows,
  type CaseTimelineRow,
  filterCaseSelectorRows,
} from './view-model'

function buildBundle(): CaseReportBundle {
  const currentSections = [
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
        {
          category: 'Action due',
          issue: 'Appeal needs the shipment timeline',
          caseId: 'A-150',
          daysAgo: '0 days ago',
          status: 'Waiting on seller',
          evidence: 'Support wants the shipment timeline before they escalate.',
          assessment: 'The appeal is blocked until we send the shipment notes.',
          nextStep: 'Reply with the shipment timeline.',
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
  ]

  return {
    reportDate: '2026-04-14',
    marketCode: 'US',
    marketSlug: 'us',
    marketLabel: 'USA - Dust Sheets',
    caseRoot: '/tmp/cases',
    reportPath: '/tmp/cases/reports/2026-04-14.json',
    caseJsonPath: '/tmp/cases/case.json',
    availableReportDates: ['2026-04-14', '2026-04-13', '2026-04-12'],
    reportSectionsByDate: {
      '2026-04-14': currentSections,
      '2026-04-13': [
        {
          entity: 'TARGON',
          rows: [
            {
              category: 'Watching',
              issue: 'Legacy issue still waiting on reimbursement',
              caseId: 'A-100',
              daysAgo: '1 day ago',
              status: 'Work in progress',
              evidence: 'Still no reply from support.',
              assessment: 'Continue to monitor until the thread moves.',
              nextStep: 'Check again tomorrow.',
            },
            {
              category: 'Watching',
              issue: 'Refund needs a seller reply',
              caseId: 'A-200',
              daysAgo: '1 day ago',
              status: 'Waiting',
              evidence: 'Support asked us to confirm the invoice file.',
              assessment: 'The thread is heading toward a reply request.',
              nextStep: 'Prepare the invoice evidence.',
            },
            {
              category: 'Watching',
              issue: 'Archived reimbursement audit',
              caseId: 'A-999',
              daysAgo: '8 days ago',
              status: 'Watching',
              evidence: 'A historical audit note remains in the old report.',
              assessment: 'This row is only preserved for historical context.',
              nextStep: 'No live action required.',
            },
          ],
        },
        {
          entity: 'NIGS LTD',
          rows: [
            {
              category: 'Watching',
              issue: 'Fresh case opened for stranded inventory',
              caseId: 'A-400',
              daysAgo: '3 days ago',
              status: 'Investigating',
              evidence: 'The new case is still waiting on Amazon triage.',
              assessment: 'Keep the new case warm until support replies.',
              nextStep: 'Check for the first Amazon reply.',
            },
          ],
        },
      ],
      '2026-04-12': [
        {
          entity: 'TARGON',
          rows: [
            {
              category: 'Watching',
              issue: 'Legacy issue still waiting on reimbursement',
              caseId: 'A-100',
              daysAgo: '0 days ago',
              status: 'Opened',
              evidence: 'The reimbursement thread was first logged today.',
              assessment: 'Start monitoring the case history.',
              nextStep: 'Confirm the opening case details.',
            },
            {
              category: 'New case',
              issue: 'Refund needs a seller reply',
              caseId: 'A-200',
              daysAgo: '0 days ago',
              status: 'Opened',
              evidence: 'Support opened the refund thread today.',
              assessment: 'This began as a fresh case before the reply ask.',
              nextStep: 'Read the opening case thread.',
            },
          ],
        },
      ],
    },
    daySummaries: [
      {
        reportDate: '2026-04-14',
        totalRows: 5,
        actionDueRows: 2,
        newCaseRows: 1,
        forumWatchRows: 1,
        watchingRows: 1,
      },
      {
        reportDate: '2026-04-13',
        totalRows: 4,
        actionDueRows: 0,
        newCaseRows: 0,
        forumWatchRows: 0,
        watchingRows: 4,
      },
      {
        reportDate: '2026-04-12',
        totalRows: 2,
        actionDueRows: 0,
        newCaseRows: 1,
        forumWatchRows: 0,
        watchingRows: 1,
      },
    ],
    trackedCaseIds: ['A-100', 'A-150', 'A-200', 'A-300', 'A-400'],
    caseRecordsById: {
      'A-100': {
        caseId: 'A-100',
        title: 'Legacy issue still waiting on reimbursement',
        entity: 'TARGON',
        amazonStatus: 'Work in progress',
        ourStatus: 'looping',
        created: '2026-04-12',
        lastReply: '2026-04-13',
        nextAction: 'Check again tomorrow.',
        nextActionDate: '2026-04-15',
        linkedCases: '',
        primaryEmail: null,
        actionKind: 'monitor',
        approvalRequired: false,
      },
      'A-150': {
        caseId: 'A-150',
        title: 'Appeal needs the shipment timeline',
        entity: 'TARGON',
        amazonStatus: 'Waiting on seller',
        ourStatus: 'waiting_on_us',
        created: '2026-04-14',
        lastReply: '2026-04-14',
        nextAction: 'Reply with the shipment timeline.',
        nextActionDate: '2026-04-14',
        linkedCases: '',
        primaryEmail: 'ops@targonglobal.com',
        actionKind: 'send_case_reply',
        approvalRequired: true,
      },
      'A-200': {
        caseId: 'A-200',
        title: 'Refund needs a seller reply',
        entity: 'TARGON',
        amazonStatus: 'Answered',
        ourStatus: 'waiting_on_us',
        created: '2026-04-12',
        lastReply: '2026-04-14',
        nextAction: 'Reply with the invoice attachment.',
        nextActionDate: '2026-04-14',
        linkedCases: 'A-199',
        primaryEmail: 'ops@targonglobal.com',
        actionKind: 'send_case_reply',
        approvalRequired: true,
      },
      'A-300': {
        caseId: 'A-300',
        title: 'Forum escalation mentioned reimbursement lag',
        entity: 'NIGS LTD',
        amazonStatus: 'Investigating',
        ourStatus: 'monitoring',
        created: '2026-04-08',
        lastReply: '2026-04-12',
        nextAction: 'Track whether the forum thread names our ASINs.',
        nextActionDate: '2026-04-15',
        linkedCases: '',
        primaryEmail: null,
        actionKind: 'send_forum_post',
        approvalRequired: true,
      },
      'A-400': {
        caseId: 'A-400',
        title: 'Fresh case opened for stranded inventory',
        entity: 'NIGS LTD',
        amazonStatus: 'Opened',
        ourStatus: 'triage',
        created: '2026-04-10',
        lastReply: '2026-04-10',
        nextAction: 'Read the opening case thread and summarize it.',
        nextActionDate: '2026-04-14',
        linkedCases: 'A-401',
        primaryEmail: 'support@nigs.example',
        actionKind: 'collect_evidence',
        approvalRequired: false,
      },
    },
    generatedAt: '2026-04-14T08:00:00-05:00',
    sections: currentSections,
  }
}

function selectReportDate(bundle: CaseReportBundle, reportDate: string): CaseReportBundle {
  const sections = bundle.reportSectionsByDate[reportDate]
  if (sections === undefined) {
    throw new Error(`Missing report sections for test report date: ${reportDate}`)
  }

  return {
    ...bundle,
    reportDate,
    reportPath: `/tmp/cases/reports/${reportDate}.json`,
    sections,
  }
}

function buildBundleWithDuplicateSameDayActivity(): CaseReportBundle {
  const bundle = buildBundle()
  const duplicateRow = {
    category: 'Action due',
    issue: 'Refund follow-up needs the missing invoice page',
    caseId: 'A-200',
    daysAgo: '0 days ago',
    status: 'Checkpoint overdue',
    evidence: 'Support still needs the missing invoice page.',
    assessment: 'The follow-up is now overdue on the same day.',
    nextStep: 'Send the missing invoice page today.',
  }

  bundle.reportSectionsByDate['2026-04-12'] = [
    {
      entity: 'TARGON',
      rows: [...bundle.reportSectionsByDate['2026-04-12'][0].rows, duplicateRow],
    },
  ]

  return bundle
}

test('createCaseSelectorRows orders the selector by urgency, then caseId, and counts dated activity', () => {
  const rows = createCaseSelectorRows(buildBundle())

  assert.deepEqual(
    rows.map((row) => ({
      caseId: row.caseId,
      category: row.category,
      issue: row.issue,
      entity: row.entity,
      amazonStatus: row.amazonStatus,
      openSince: row.openSince,
      activityCount: row.activityCount,
    })),
    [
      {
        caseId: 'A-150',
        category: 'Action due',
        issue: 'Appeal needs the shipment timeline',
        entity: 'TARGON',
        amazonStatus: 'Waiting on seller',
        openSince: '2026-04-14',
        activityCount: 1,
      },
      {
        caseId: 'A-200',
        category: 'Action due',
        issue: 'Refund needs a seller reply',
        entity: 'TARGON',
        amazonStatus: 'Answered',
        openSince: '2026-04-12',
        activityCount: 3,
      },
      {
        caseId: 'A-400',
        category: 'New case',
        issue: 'Fresh case opened for stranded inventory',
        entity: 'NIGS LTD',
        amazonStatus: 'Opened',
        openSince: '2026-04-10',
        activityCount: 2,
      },
      {
        caseId: 'A-300',
        category: 'Forum watch',
        issue: 'Forum escalation mentioned reimbursement lag',
        entity: 'NIGS LTD',
        amazonStatus: 'Investigating',
        openSince: '2026-04-08',
        activityCount: 1,
      },
      {
        caseId: 'A-100',
        category: 'Watching',
        issue: 'Legacy issue still waiting on reimbursement',
        entity: 'TARGON',
        amazonStatus: 'Work in progress',
        openSince: '2026-04-12',
        activityCount: 3,
      },
    ],
  )
})

test('same-day duplicate case activities stay selectable without duplicating the case selector', () => {
  const bundle = buildBundleWithDuplicateSameDayActivity()

  assert.deepEqual(
    createCaseSelectorRows(selectReportDate(bundle, '2026-04-12')).map((row) => ({
      caseId: row.caseId,
      category: row.category,
      issue: row.issue,
      activityCount: row.activityCount,
    })),
    [
      {
        caseId: 'A-200',
        category: 'Action due',
        issue: 'Refund follow-up needs the missing invoice page',
        activityCount: 4,
      },
      {
        caseId: 'A-100',
        category: 'Watching',
        issue: 'Legacy issue still waiting on reimbursement',
        activityCount: 3,
      },
    ],
  )

  assert.deepEqual(
    createCaseTimelineRows(bundle, 'A-200').map((row) => ({
      timelineKey: row.timelineKey,
      reportDate: row.reportDate,
      category: row.category,
      issue: row.issue,
    })),
    [
      {
        timelineKey: '2026-04-14::A-200::0',
        reportDate: '2026-04-14',
        category: 'Action due',
        issue: 'Refund needs a seller reply',
      },
      {
        timelineKey: '2026-04-13::A-200::0',
        reportDate: '2026-04-13',
        category: 'Watching',
        issue: 'Refund needs a seller reply',
      },
      {
        timelineKey: '2026-04-12::A-200::0',
        reportDate: '2026-04-12',
        category: 'Action due',
        issue: 'Refund follow-up needs the missing invoice page',
      },
      {
        timelineKey: '2026-04-12::A-200::1',
        reportDate: '2026-04-12',
        category: 'New case',
        issue: 'Refund needs a seller reply',
      },
    ],
  )
})

test('createCaseSelectorRows includes an untracked historical selected-date row without active metadata', () => {
  const rows = createCaseSelectorRows(selectReportDate(buildBundle(), '2026-04-13'))

  assert.deepEqual(
    rows.map((row) => ({
      caseId: row.caseId,
      entity: row.entity,
      amazonStatus: row.amazonStatus,
      openSince: row.openSince,
      nextAction: row.nextAction,
      activityCount: row.activityCount,
    })),
    [
      {
        caseId: 'A-100',
        entity: 'TARGON',
        amazonStatus: 'Work in progress',
        openSince: '2026-04-12',
        nextAction: 'Check again tomorrow.',
        activityCount: 3,
      },
      {
        caseId: 'A-200',
        entity: 'TARGON',
        amazonStatus: 'Answered',
        openSince: '2026-04-12',
        nextAction: 'Reply with the invoice attachment.',
        activityCount: 3,
      },
      {
        caseId: 'A-400',
        entity: 'NIGS LTD',
        amazonStatus: 'Opened',
        openSince: '2026-04-10',
        nextAction: 'Read the opening case thread and summarize it.',
        activityCount: 2,
      },
      {
        caseId: 'A-999',
        entity: 'TARGON',
        amazonStatus: null,
        openSince: null,
        nextAction: null,
        activityCount: 1,
      },
    ],
  )
})

test('tracked live missing case records fail loudly in selector, timeline, and detail', () => {
  const bundle = buildBundle()
  delete bundle.caseRecordsById['A-300']
  const trackedTimelineRow: CaseTimelineRow = {
    timelineKey: '2026-04-14::A-300',
    reportDate: '2026-04-14',
    entity: 'NIGS LTD',
    category: 'Forum watch',
    issue: 'Forum escalation mentioned reimbursement lag',
    caseId: 'A-300',
    daysAgo: '6 days ago',
    status: 'Investigating',
    evidence: 'Forum moderators acknowledged the pattern.',
    assessment: 'The issue is worth watching for spillover.',
    nextStep: 'Track whether the forum thread names our ASINs.',
    signal: 'Forum moderators acknowledged the pattern.',
  }

  assert.throws(
    () => createCaseSelectorRows(bundle),
    new Error('Missing case record for case selector row: A-300'),
  )

  assert.throws(
    () => createCaseTimelineRows(bundle, 'A-300'),
    new Error('Missing case record for case timeline: A-300'),
  )

  assert.throws(
    () => createCaseDetailModel(bundle, trackedTimelineRow),
    new Error('Missing case record for case detail: A-300'),
  )
})

test('createCaseTimelineRows collects one snapshot per date in newest-first order', () => {
  const rows = createCaseTimelineRows(buildBundle(), 'A-200')

  assert.deepEqual(
    rows.map((row) => ({
      reportDate: row.reportDate,
      category: row.category,
      status: row.status,
      signal: row.signal,
    })),
    [
      {
        reportDate: '2026-04-14',
        category: 'Action due',
        status: 'Answered',
        signal: 'Amazon asked for an invoice today.',
      },
      {
        reportDate: '2026-04-13',
        category: 'Watching',
        status: 'Waiting',
        signal: 'Support asked us to confirm the invoice file.',
      },
      {
        reportDate: '2026-04-12',
        category: 'New case',
        status: 'Opened',
        signal: 'Support opened the refund thread today.',
      },
    ],
  )
})

test('createCaseTimelineRows allows an untracked historical case without a case record', () => {
  const rows = createCaseTimelineRows(buildBundle(), 'A-999')

  assert.deepEqual(
    rows.map((row) => ({
      reportDate: row.reportDate,
      caseId: row.caseId,
      entity: row.entity,
      signal: row.signal,
    })),
    [
      {
        reportDate: '2026-04-13',
        caseId: 'A-999',
        entity: 'TARGON',
        signal: 'A historical audit note remains in the old report.',
      },
    ],
  )
})

test('createCaseDetailModel joins timeline snapshots with case metadata and gates approval', () => {
  const bundle = buildBundle()
  const replyDetail = createCaseDetailModel(bundle, createCaseTimelineRows(bundle, 'A-200')[0])

  assert.deepEqual(replyDetail, {
    reportDate: '2026-04-14',
    caseId: 'A-200',
    category: 'Action due',
    issue: 'Refund needs a seller reply',
    status: 'Answered',
    signal: 'Amazon asked for an invoice today.',
    evidence: 'Amazon asked for an invoice today.',
    assessment: 'The thread is blocked on our reply.',
    nextStep: 'Reply with the invoice attachment.',
    metadata: {
      entity: 'TARGON',
      amazonStatus: 'Answered',
      ourStatus: 'waiting_on_us',
      lastReply: '2026-04-14',
      created: '2026-04-12',
      linkedCases: 'A-199',
      primaryEmail: 'ops@targonglobal.com',
      nextAction: 'Reply with the invoice attachment.',
      nextActionDate: '2026-04-14',
      actionKind: 'send_case_reply',
      approvalRequired: true,
    },
    approval: {
      statusLabel: 'Approval required',
      sourceLabel: 'Case reply',
      primaryActionLabel: 'Approve send',
      secondaryActionLabel: 'Hold',
    },
  })

  const readOnlyDetail = createCaseDetailModel(bundle, createCaseTimelineRows(bundle, 'A-400')[0])
  assert.equal(readOnlyDetail.approval, null)
  assert.equal(readOnlyDetail.metadata.approvalRequired, false)
  assert.equal(readOnlyDetail.metadata.actionKind, 'collect_evidence')
})

test('createCaseDetailModel returns nullable metadata and no approval for untracked historical rows', () => {
  const bundle = buildBundle()
  const detail = createCaseDetailModel(bundle, createCaseTimelineRows(bundle, 'A-999')[0])

  assert.deepEqual(detail, {
    reportDate: '2026-04-13',
    caseId: 'A-999',
    category: 'Watching',
    issue: 'Archived reimbursement audit',
    status: 'Watching',
    signal: 'A historical audit note remains in the old report.',
    evidence: 'A historical audit note remains in the old report.',
    assessment: 'This row is only preserved for historical context.',
    nextStep: 'No live action required.',
    metadata: {
      entity: 'TARGON',
      amazonStatus: null,
      ourStatus: null,
      lastReply: null,
      created: null,
      linkedCases: null,
      primaryEmail: null,
      nextAction: null,
      nextActionDate: null,
      actionKind: null,
      approvalRequired: null,
    },
    approval: null,
  })
})

test('filterCaseSelectorRows searches issue, case id, entity, evidence, assessment, and next step', () => {
  const rows = createCaseSelectorRows(buildBundle())

  assert.deepEqual(filterCaseSelectorRows(rows, 'invoice').map((row) => row.caseId), ['A-200'])
  assert.deepEqual(filterCaseSelectorRows(rows, 'nigs').map((row) => row.caseId), ['A-400', 'A-300'])
  assert.deepEqual(filterCaseSelectorRows(rows, 'spillover').map((row) => row.caseId), ['A-300'])
  assert.deepEqual(filterCaseSelectorRows(rows, 'track whether').map((row) => row.caseId), ['A-300'])
})

test('createCaseReportDateOptions condenses day-over-day counts into top-rail labels', () => {
  assert.deepEqual(createCaseReportDateOptions(buildBundle()), [
    {
      reportDate: '2026-04-14',
      label: '2026-04-14 · 5 total · 2 action due · 1 new · 1 forum · 1 watching',
    },
    {
      reportDate: '2026-04-13',
      label: '2026-04-13 · 4 total · 4 watching',
    },
    {
      reportDate: '2026-04-12',
      label: '2026-04-12 · 2 total · 1 new · 1 watching',
    },
  ])
})
