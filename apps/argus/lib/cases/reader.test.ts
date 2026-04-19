import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  parseCaseReportMarkdown,
  readCaseReportBundleFromCaseRoot,
} from './reader-core'

test('parseCaseReportMarkdown extracts entity sections and case rows', () => {
  const report = parseCaseReportMarkdown(
    [
      '## Case Report - 2026-04-08 (UK)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Action due | Account verification status / failed verification | 12339319152 | 0 days ago | Answered | Amazon replied on Apr 8. | Seller action is required now. | Reply from the primary inbox. |',
      '',
      '### NIGS LTD',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Weights and dimensions review | 12006221712 | 21 days ago | Transferred / locked | No new case reply. | Keep monitoring. | None. |',
      '',
    ].join('\n'),
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

  writeFileSync(
    path.join(reportsDir, '2026-04-07.md'),
    [
      '## Case Report - 2026-04-07 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Action due | Old issue | 19550165441 | 1 day ago | Answered | Old evidence. | Old assessment. | Old next step. |',
      '',
    ].join('\n'),
  )

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

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

  writeFileSync(
    path.join(reportsDir, '2026-04-07.md'),
    [
      '## Case Report - 2026-04-07 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Action due | Older case no longer in live case.json | 19096712151 | 1 day ago | Answered | Old evidence. | Old assessment. | Old next step. |',
      '',
    ].join('\n'),
  )

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

  const bundle = await readCaseReportBundleFromCaseRoot(caseRoot, 'us', '2026-04-07')

  assert.equal(bundle.reportDate, '2026-04-07')
  assert.equal(bundle.sections[0]?.rows[0]?.caseId, '19096712151')
  assert.deepEqual(Object.keys(bundle.caseRecordsById), ['19550165441'])
  assert.equal(bundle.caseRecordsById['19550165441']?.primaryEmail, null)
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

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Missing required case\.json case field approval_required for case 19550165441/,
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

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

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

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

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

  writeFileSync(
    path.join(reportsDir, '2026-04-08.md'),
    [
      '## Case Report - 2026-04-08 (US)',
      '',
      '### TARGON',
      '',
      '| Category | Issue | Case ID | Days Ago | Status | Evidence / What Changed | Assessment | Next Step |',
      '|---|---|---|---|---|---|---|---|',
      '| Watching | Shipping label refund ($2,583.96) | 19550165441 | 2 days ago | Work in progress | No new case-thread activity. | Four shipments are still unresolved. | Confirm the approved reimbursement posts in Payments. |',
      '',
    ].join('\n'),
  )

  await assert.rejects(
    () => readCaseReportBundleFromCaseRoot(caseRoot, 'us'),
    /Case\.json case key mismatch: expected 19550165441, got 19096712151/,
  )
})
