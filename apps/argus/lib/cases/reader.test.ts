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
            entity: 'TARGON',
            title: 'Shipping label refund ($2,583.96)',
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
      '| Watching | Old issue | 19550165441 | 1 day ago | Work in progress | Old evidence. | Old assessment. | Old next step. |',
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
  assert.deepEqual(bundle.trackedCaseIds, ['19550165441'])
  assert.equal(bundle.sections[0]?.rows[0]?.caseId, '19550165441')
})
