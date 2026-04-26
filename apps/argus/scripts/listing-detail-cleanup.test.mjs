import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(scriptDir, '..')

test('listing detail no longer exposes snapshot ingest or reset controls', () => {
  const detailSource = readFileSync(join(appDir, 'app/(app)/listings/[id]/listing-detail.tsx'), 'utf8')
  const dialogsSource = readFileSync(join(appDir, 'app/(app)/listings/[id]/listing-detail-dialogs.tsx'), 'utf8')
  const shellSource = readFileSync(join(appDir, 'components/layout/app-shell.tsx'), 'utf8')
  const combined = `${detailSource}\n${dialogsSource}\n${shellSource}`

  assert.equal(combined.includes('ListingDetailHeader'), false)
  assert.equal(combined.includes('snapshotIngest'), false)
  assert.equal(combined.includes('snapshot ingest'), false)
  assert.equal(combined.includes('Ingest snapshot zip'), false)
  assert.equal(combined.includes('Reset listing'), false)
  assert.equal(combined.includes('/ingest'), false)
  assert.equal(combined.includes('/reset'), false)
})

test('obsolete listing ingest/reset endpoints are removed', () => {
  assert.equal(existsSync(join(appDir, 'app/api/listings/[id]/ingest/route.ts')), false)
  assert.equal(existsSync(join(appDir, 'app/api/listings/[id]/ingest-fixture/route.ts')), false)
  assert.equal(existsSync(join(appDir, 'app/api/listings/[id]/reset/route.ts')), false)
  assert.equal(existsSync(join(appDir, 'app/api/fixture/seed/route.ts')), false)
  assert.equal(existsSync(join(appDir, 'lib/ingest.ts')), false)
})
