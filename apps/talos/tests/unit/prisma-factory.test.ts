import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSchemaScopedDatabaseUrl } from '../../src/lib/tenant/prisma-factory'
import { resolveTenantSchema } from '../../src/lib/tenant/schema'

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

test('resolveTenantSchema prefers the schema embedded in the tenant URL', () => {
  const resolved = resolveTenantSchema(
    'postgresql://portal_talos@localhost:5432/portal_db?schema=main_talos_us',
    'dev_talos_us'
  )

  assert.deepEqual(resolved, {
    schema: 'main_talos_us',
    source: 'database-url',
  })
})

test('resolveTenantSchema uses PRISMA_SCHEMA when the tenant URL has no schema', () => {
  const resolved = resolveTenantSchema(
    'postgresql://portal_talos@localhost:5432/portal_db',
    'dev_talos_us'
  )

  assert.deepEqual(resolved, {
    schema: 'dev_talos_us',
    source: 'override',
  })
})
