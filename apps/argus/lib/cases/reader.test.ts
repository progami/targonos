import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  parseCaseReportSnapshotJson,
  readCaseReportBundleFromCaseRoot,
} from './reader-core'

function writeReportSnapshot(
  reportsDir: string,
  reportDate: string,
  market: string,
  sections: Array<{
    entity: string
    rows: Array<{
      category: string
      issue: string
      case_id: string
      days_ago: string
      status: string
      evidence: string
      assessment: string
      next_step: string
    }>
  }>,
) {
  writeFileSync(
    path.join(reportsDir, `${reportDate}.json`),
    JSON.stringify(
      {
        report_date: reportDate,
        market,
        sections,
      },
      null,
      2,
    ),
  )
}

test('parseCaseReportSnapshotJson extracts entity sections and case rows', () => {
  const report = parseCaseReportSnapshotJson(
    JSON.stringify({
      report_date: '2026-04-08',
      market: 'UK',
      sections: [
        {
          entity: 'TARGON',
          rows: [
            {
              category: 'Action due',
              issue: 'Account verification status / failed verification',
              case_id: '12339319152',
              days_ago: '0 days ago',
              status: 'Answered',
              evidence: 'Amazon replied on Apr 8.',
              assessment: 'Seller action is required now.',
              next_step: 'Reply from the primary inbox.',
            },
          ],
        },
        {
          entity: 'NIGS LTD',
          rows: [
            {
              category: 'Watching',
              issue: 'Weights and dimensions review',
              case_id: '12006221712',
              days_ago: '21 days ago',
              status: 'Transferred / locked',
              evidence: 'No new case reply.',
              assessment: 'Keep monitoring.',
              next_step: 'None.',
            },
          ],
        },
      ],
    }),
  )

  assert.equal(report.reportDate, '2026-04-08')
  assert.equal(report.marketCode, 'UK')
  assert.equal(report.sections.length, 2)
  assert.equal(report.sections[0]?.entity, 'TARGON')
  assert.equal(report.sections[0]?.rows[0]?.caseId, '12339319152')
  assert.equal(report.sections[0]?.rows[0]?.status, 'Answered')
  assert.equal(report.sections[0]?.rows[0]?.evidence, 'Amazon replied on Apr 8.')
  assert.equal(report.sections[0]?.rows[0]?.assessment, 'Seller action is required now.')
  assert.equal(report.sections[0]?.rows[0]?.nextStep, 'Reply from the primary inbox.')
  assert.equal(report.sections[1]?.entity, 'NIGS LTD')
  assert.equal(report.sections[1]?.rows[0]?.issue, 'Weights and dimensions review')
})

test('parseCaseReportSnapshotJson normalizes looping rows to Watching', () => {
  const report = parseCaseReportSnapshotJson(
    JSON.stringify({
      report_date: '2026-04-21',
      market: 'US',
      sections: [
        {
          entity: 'TARGON',
          rows: [
            {
              category: 'looping',
              issue: 'Shipping label refund ($2,583.96)',
              case_id: '19550165441',
              days_ago: '0 days ago',
              status: 'Work in progress',
              evidence: 'Forum thread has a new seller follow-up.',
              assessment: 'Amazon is still looping.',
              next_step: 'Wait for an Amazon update.',
            },
          ],
        },
      ],
    }),
  )

  assert.equal(report.sections[0]?.rows[0]?.category, 'Watching')
})

test('readCaseReportBundleFromCaseRoot resolves the latest dated report and tracked cases', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            case_url: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case?ie=UTF8&caseID=19550165441',
            forum_post:
              'https://sellercentral.amazon.com/seller-forums/discussions/t/example-thread (posted Apr 8, 4 replies)',
            forum_post_url: 'https://sellercentral.amazon.com/seller-forums/discussions/t/example-thread',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
          '19096712151': {
            case_id: '19096712151',
            title: 'Older resolved case',
            amazon_status: 'Answered',
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-07', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Action due',
          issue: 'Old issue',
          case_id: '19550165441',
          days_ago: '1 day ago',
          status: 'Answered',
          evidence: 'Old evidence.',
          assessment: 'Old assessment.',
          next_step: 'Old next step.',
        },
      ],
    },
  ])

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  const bundle = await readCaseReportBundleFromCaseRoot(caseRoot, 'us')

  assert.equal(bundle.reportDate, '2026-04-08')
  assert.deepEqual(bundle.availableReportDates, ['2026-04-08', '2026-04-07'])
  assert.deepEqual(bundle.daySummaries, [
    {
      reportDate: '2026-04-08',
      totalRows: 1,
      actionDueRows: 0,
      newCaseRows: 0,
      forumWatchRows: 0,
      watchingRows: 1,
    },
    {
      reportDate: '2026-04-07',
      totalRows: 1,
      actionDueRows: 1,
      newCaseRows: 0,
      forumWatchRows: 0,
      watchingRows: 0,
    },
  ])
  assert.deepEqual(bundle.trackedCaseIds, ['19550165441'])
  assert.equal(bundle.sections[0]?.rows[0]?.caseId, '19550165441')
  assert.deepEqual(bundle.caseRecordsById, {
    '19550165441': {
      caseId: '19550165441',
      title: 'Shipping label refund ($2,583.96)',
      entity: 'TARGON',
      amazonStatus: 'Work in progress',
      ourStatus: 'looping',
      created: '2026-04-06',
      lastReply: '2026-04-07',
      nextAction: 'Confirm the approved reimbursement posts in Payments.',
      nextActionDate: '2026-04-09',
      linkedCases: '19096712151',
      primaryEmail: null,
      caseUrl: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case?ie=UTF8&caseID=19550165441',
      forumPost: 'https://sellercentral.amazon.com/seller-forums/discussions/t/example-thread (posted Apr 8, 4 replies)',
      forumPostUrl: 'https://sellercentral.amazon.com/seller-forums/discussions/t/example-thread',
      actionKind: 'send_case_reply',
      approvalRequired: true,
    },
  })
  assert.deepEqual(bundle.reportSectionsByDate, {
    '2026-04-08': [
      {
        entity: 'TARGON',
        rows: [
          {
            category: 'Watching',
            issue: 'Shipping label refund ($2,583.96)',
            caseId: '19550165441',
            daysAgo: '2 days ago',
            status: 'Work in progress',
            evidence: 'No new case-thread activity.',
            assessment: 'Four shipments are still unresolved.',
            nextStep: 'Confirm the approved reimbursement posts in Payments.',
          },
        ],
      },
    ],
    '2026-04-07': [
      {
        entity: 'TARGON',
        rows: [
          {
            category: 'Action due',
            issue: 'Old issue',
            caseId: '19550165441',
            daysAgo: '1 day ago',
            status: 'Answered',
            evidence: 'Old evidence.',
            assessment: 'Old assessment.',
            nextStep: 'Old next step.',
          },
        ],
      },
    ],
  })
  assert.equal(bundle.caseRecordsById['19096712151'], undefined)
})

test('readCaseReportBundleFromCaseRoot loads a historical report date when the historical case is no longer live', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-07', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Action due',
          issue: 'Older case no longer in live case.json',
          case_id: '19096712151',
          days_ago: '1 day ago',
          status: 'Answered',
          evidence: 'Old evidence.',
          assessment: 'Old assessment.',
          next_step: 'Old next step.',
        },
      ],
    },
  ])

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  const bundle = await readCaseReportBundleFromCaseRoot(caseRoot, 'us', '2026-04-07')

  assert.equal(bundle.reportDate, '2026-04-07')
  assert.equal(bundle.sections[0]?.rows[0]?.caseId, '19096712151')
  assert.deepEqual(Object.keys(bundle.caseRecordsById), ['19550165441'])
  assert.equal(bundle.caseRecordsById['19550165441']?.primaryEmail, null)
})

test('readCaseReportBundleFromCaseRoot throws when tracked_case_ids is missing', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Missing required case\.json field tracked_case_ids/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when tracked_case_ids is malformed', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441', 123],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json field tracked_case_ids/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when a tracked case id is missing from cases', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441', '19096712151'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Missing required case\.json case record for case 19096712151/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when a case record is missing required machine-readable fields', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            primary_email: 'ops@targonglobal.com',
            action_kind: 'send_case_reply',
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Missing required case\.json case field approval_required for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when case_url is blank', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            case_url: '',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json case field case_url for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when forum_post_url is malformed', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            case_url: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case?ie=UTF8&caseID=19550165441',
            forum_post: 'https://sellercentral.amazon.com/seller-forums/discussions/t/example-thread (posted Apr 8, 4 replies)',
            forum_post_url: 'not-a-url',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json case field forum_post_url for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when case_url is not a string', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            case_url: { href: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case?ie=UTF8&caseID=19550165441' },
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json case field case_url for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when action_kind is not an allowed value', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            primary_email: 'ops@targonglobal.com',
            action_kind: 'invented_action',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json action_kind invented_action for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when approval is required for a non-send action kind', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19550165441',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            action_kind: 'monitor',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Invalid case\.json approval_required true for non-send action_kind monitor for case 19550165441/,
  )
})

test('readCaseReportBundleFromCaseRoot throws when a cases map key does not match case_id', async () => {
  const caseRoot = mkdtempSync(path.join(tmpdir(), 'argus-cases-'))
  const reportsDir = path.join(caseRoot, 'reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(
    path.join(caseRoot, 'case.json'),
    JSON.stringify(
      {
        market: 'US',
        generated_at: '2026-04-08T04:15:00-05:00',
        tracked_case_ids: ['19550165441'],
        cases: {
          '19550165441': {
            case_id: '19096712151',
            title: 'Shipping label refund ($2,583.96)',
            entity: 'TARGON',
            amazon_status: 'Work in progress',
            our_status: 'looping',
            created: '2026-04-06',
            last_reply: '2026-04-07',
            next_action: 'Confirm the approved reimbursement posts in Payments.',
            next_action_date: '2026-04-09',
            linked_cases: '19096712151',
            primary_email: 'ops@targonglobal.com',
            action_kind: 'send_case_reply',
            approval_required: true,
          },
        },
      },
      null,
      2,
    ),
  )

  writeReportSnapshot(reportsDir, '2026-04-08', 'US', [
    {
      entity: 'TARGON',
      rows: [
        {
          category: 'Watching',
          issue: 'Shipping label refund ($2,583.96)',
          case_id: '19550165441',
          days_ago: '2 days ago',
          status: 'Work in progress',
          evidence: 'No new case-thread activity.',
          assessment: 'Four shipments are still unresolved.',
          next_step: 'Confirm the approved reimbursement posts in Payments.',
        },
      ],
    },
  ])

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Case\.json case key mismatch: expected 19550165441, got 19096712151/,
  )
})
