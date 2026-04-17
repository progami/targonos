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
      'fo.create',
      'fo.edit',
      'fo.stage',
      'permission.manage',
      'po.approve.draft_to_manufacturing',
      'po.approve.manufacturing_to_ocean',
      'po.approve.ocean_to_warehouse',
      'po.cancel',
      'po.create',
      'po.edit',
      'po.view',
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
