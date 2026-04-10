import assert from 'node:assert/strict'
import test from 'node:test'

import { hasRoleBaselinePermission } from '../../src/lib/permissions/baseline'
import {
  buildPermissionRows,
  filterPermissionUsers,
  getSelectedUserId,
  groupPermissionRows,
  summarizePermissionUsers,
} from '../../src/app/config/permissions/view-model'

const permissionCatalog = [
  {
    id: 'po-approve',
    code: 'po.approve',
    name: 'Approve PO',
    description: null,
    category: 'purchase_order',
  },
  {
    id: 'users-manage',
    code: 'users.manage',
    name: 'Manage users',
    description: null,
    category: 'user_management',
  },
] as const

const users = [
  {
    id: 'hamad',
    email: 'hamadkhan@targonglobal.com',
    fullName: 'Hamad Khan',
    role: 'admin',
    isActive: true,
    isSuperAdmin: false,
    permissions: [permissionCatalog[0]],
  },
  {
    id: 'umair',
    email: 'umair@targonglobal.com',
    fullName: 'Umair',
    role: 'staff',
    isActive: true,
    isSuperAdmin: false,
    permissions: [],
  },
  {
    id: 'jarrar',
    email: 'jarrar@targonglobal.com',
    fullName: 'Jarrar Amjad',
    role: 'admin',
    isActive: true,
    isSuperAdmin: true,
    permissions: [],
  },
] as const

test('admin baseline includes purchase-order and fulfillment-order permissions', () => {
  assert.equal(hasRoleBaselinePermission('admin', 'po.approve'), true)
  assert.equal(hasRoleBaselinePermission('admin', 'fo.edit'), true)
  assert.equal(hasRoleBaselinePermission('admin', 'users.manage'), false)
})

test('staff baseline only includes the fixed Talos staff permission set', () => {
  assert.equal(hasRoleBaselinePermission('staff', 'po.create'), true)
  assert.equal(hasRoleBaselinePermission('staff', 'fo.stage'), true)
  assert.equal(hasRoleBaselinePermission('staff', 'users.manage'), false)
})

test('filtering and selection stay stable as the roster changes', () => {
  const filtered = filterPermissionUsers(users, 'ham', 'all')
  assert.deepEqual(filtered.map((user) => user.id), ['hamad'])
  assert.equal(getSelectedUserId(filtered, 'hamad'), 'hamad')
  assert.equal(getSelectedUserId(filtered, 'missing'), 'hamad')
})

test('permission rows distinguish direct baseline off and all states', () => {
  const hamadRows = buildPermissionRows(users[0], permissionCatalog)
  assert.equal(hamadRows[0].source, 'direct')
  assert.equal(hamadRows[0].action, 'revoke')
  assert.equal(hamadRows[1].source, 'off')
  assert.equal(hamadRows[1].action, 'grant')

  const umairRows = buildPermissionRows(users[1], permissionCatalog)
  assert.equal(umairRows[0].source, 'off')

  const jarrarRows = buildPermissionRows(users[2], permissionCatalog)
  assert.equal(jarrarRows[0].source, 'all')
  assert.equal(jarrarRows[0].action, 'readonly')
})

test('summary counts reflect visible users and direct overrides', () => {
  assert.deepEqual(summarizePermissionUsers(users), {
    userCount: 3,
    overrideCount: 1,
    superAdminCount: 1,
  })
})

test('groupPermissionRows preserves catalog order by category', () => {
  const grouped = groupPermissionRows(buildPermissionRows(users[0], permissionCatalog))

  assert.deepEqual(
    grouped.map((group) => group.category),
    ['purchase_order', 'user_management']
  )
  assert.equal(grouped[0].rows[0].code, 'po.approve')
})
