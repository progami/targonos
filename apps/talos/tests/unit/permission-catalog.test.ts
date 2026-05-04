import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TALOS_PERMISSION_CATALOG,
  buildPermissionCatalogUpsertSql,
} from '../../src/lib/permissions/catalog'

test('permission catalog covers every live Talos authorization code', () => {
  assert.deepEqual(
    TALOS_PERMISSION_CATALOG.map((permission) => permission.code),
    [
      'outbound.create',
      'outbound.edit',
      'outbound.stage',
      'permission.manage',
      'inbound.approve.draft_to_manufacturing',
      'inbound.approve.manufacturing_to_ocean',
      'inbound.approve.ocean_to_warehouse',
      'inbound.cancel',
      'inbound.create',
      'inbound.edit',
      'inbound.view',
      'user.manage',
    ]
  )
})

test('permission catalog upsert SQL seeds the full catalog idempotently', () => {
  const sql = buildPermissionCatalogUpsertSql()

  assert.match(sql, /INSERT INTO "permissions"/)
  assert.match(sql, /ON CONFLICT \("code"\) DO UPDATE SET/)

  for (const permission of TALOS_PERMISSION_CATALOG) {
    assert.match(sql, new RegExp(`'${permission.code.replaceAll('.', '\\.')}'`))
  }
})
