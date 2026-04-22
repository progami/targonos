import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createWprChangeLogEntry } from './change-log-write'

function createWprWorkspaceRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'argus-wpr-change-log-'))
  const salesRoot = path.join(root, 'Sales')
  const wprRoot = path.join(salesRoot, 'WPR')
  const dataDir = path.join(wprRoot, 'wpr-workspace', 'output')
  return { root, salesRoot, wprRoot, dataDir }
}

test('createWprChangeLogEntry writes the canonical markdown log into the selected week folder', async () => {
  const { wprRoot, dataDir } = createWprWorkspaceRoot()
  process.env.WPR_DATA_DIR = dataDir

  const weekDir = path.join(wprRoot, 'Week 16 - 2026-04-12 (Sun)')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(weekDir, 'output', 'Plans'), { recursive: true }))

  let rebuildCalls = 0
  const result = await createWprChangeLogEntry(
    {
      weekLabel: 'W16',
      entryDate: '2026-04-20',
      category: 'CONTENT',
      title: 'Content update across 2 ASINs',
      summary: 'Backend terms and bullets refreshed.',
      asins: ['B09HXC3NL8', 'B0CR1GSBQ9'],
      fieldLabels: ['Backend terms', 'Bullet points'],
      highlights: ['Rewrote backend terms for root coverage.', 'Tightened bullet hierarchy for mobile.'],
      statusLines: ['Submitted in Seller Central.', 'Waiting for propagation.'],
    },
    async () => {
      rebuildCalls += 1
    },
  )

  assert.equal(rebuildCalls, 1)
  assert.match(result.filePath, /Week 16 - 2026-04-12 \(Sun\)\/output\/Plans\/W16_Content_update_across_2_ASINs_Log_2026-04-20\.md$/)

  const markdown = readFileSync(result.filePath, 'utf8')
  assert.match(markdown, /^# Content update across 2 ASINs/m)
  assert.match(markdown, /^Entry date: 2026-04-20$/m)
  assert.match(markdown, /^Source: Plan Log$/m)
  assert.match(markdown, /^Type: CONTENT$/m)
  assert.match(markdown, /^ASINs: B09HXC3NL8, B0CR1GSBQ9$/m)
  assert.match(markdown, /^Fields: Backend terms, Bullet points$/m)
  assert.match(markdown, /^## Change Summary$/m)
  assert.match(markdown, /^Backend terms and bullets refreshed\.$/m)
  assert.match(markdown, /^## What Changed \(Observed\)$/m)
  assert.match(markdown, /^- Rewrote backend terms for root coverage\.$/m)
  assert.match(markdown, /^## Status$/m)
  assert.match(markdown, /^- Submitted in Seller Central\.$/m)
})

test('createWprChangeLogEntry fails when the target week folder does not exist', async () => {
  const { dataDir } = createWprWorkspaceRoot()
  process.env.WPR_DATA_DIR = dataDir

  await assert.rejects(
    () =>
      createWprChangeLogEntry(
        {
          weekLabel: 'W16',
          entryDate: '2026-04-20',
          category: 'CONTENT',
          title: 'Missing target week',
          summary: 'Summary',
          asins: ['B09HXC3NL8'],
          fieldLabels: [],
          highlights: ['Logged the change.'],
          statusLines: [],
        },
        async () => undefined,
      ),
    /Missing WPR week folder for W16/,
  )
})

test('createWprChangeLogEntry rejects the removed manual category for new entries', async () => {
  const { wprRoot, dataDir } = createWprWorkspaceRoot()
  process.env.WPR_DATA_DIR = dataDir

  const weekDir = path.join(wprRoot, 'Week 16 - 2026-04-12 (Sun)')
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.join(weekDir, 'output', 'Plans'), { recursive: true }))

  await assert.rejects(
    () =>
      createWprChangeLogEntry(
        {
          weekLabel: 'W16',
          entryDate: '2026-04-20',
          category: 'MANUAL',
          title: 'Removed category',
          summary: 'Summary',
          asins: ['B09HXC3NL8'],
          fieldLabels: [],
          highlights: ['Logged the change.'],
          statusLines: ['Queued.'],
        },
        async () => undefined,
      ),
    /Invalid WPR change category: MANUAL/,
  )
})
