import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSchemaScopedDatabaseUrl } from '../../src/lib/tenant/prisma-factory'

test('buildSchemaScopedDatabaseUrl preserves schema and sets search_path', () => {
  const url = buildSchemaScopedDatabaseUrl(
    'postgresql://portal_talos@localhost:5432/portal_db?schema=main_talos_us',
    'main_talos_us'
  )

  const parsed = new URL(url)

  assert.equal(parsed.searchParams.get('schema'), 'main_talos_us')
  assert.equal(parsed.searchParams.get('options'), '-csearch_path=main_talos_us,public')
})

test('buildSchemaScopedDatabaseUrl replaces an existing search_path option', () => {
  const url = buildSchemaScopedDatabaseUrl(
    'postgresql://portal_talos@localhost:5432/portal_db?schema=dev_talos_us&options=-csearch_path%3Ddev_talos_us,public',
    'main_talos_us'
  )

  const parsed = new URL(url)

  assert.equal(parsed.searchParams.get('schema'), 'main_talos_us')
  assert.equal(parsed.searchParams.get('options'), '-csearch_path=main_talos_us,public')
})
