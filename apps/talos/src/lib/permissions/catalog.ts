export type TalosPermissionCatalogEntry = {
  code: string
  name: string
  description: string
  category: string
}

export const TALOS_PERMISSION_CATALOG: readonly TalosPermissionCatalogEntry[] = [
  {
    code: 'outbound.create',
    name: 'Create Outbound Orders',
    description: 'Permission to create outbound orders.',
    category: 'outbound_order',
  },
  {
    code: 'outbound.edit',
    name: 'Edit Outbound Orders',
    description: 'Permission to edit outbound order details.',
    category: 'outbound_order',
  },
  {
    code: 'outbound.stage',
    name: 'Advance Outbound Order Stage',
    description: 'Permission to advance outbound orders through stage transitions.',
    category: 'outbound_order',
  },
  {
    code: 'permission.manage',
    name: 'Manage Permissions',
    description: 'Permission to grant and revoke Talos permissions.',
    category: 'user_management',
  },
  {
    code: 'inbound.approve.draft_to_manufacturing',
    name: 'Approve Draft To Manufacturing',
    description: 'Permission to approve inbound from draft to manufacturing.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.approve.manufacturing_to_ocean',
    name: 'Approve Manufacturing To Ocean',
    description: 'Permission to approve inbound from manufacturing to ocean.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.approve.ocean_to_warehouse',
    name: 'Approve Ocean To Warehouse',
    description: 'Permission to approve inbound from ocean to warehouse.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.cancel',
    name: 'Cancel Inbound',
    description: 'Permission to cancel inbound.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.create',
    name: 'Create Inbound',
    description: 'Permission to create inbound.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.edit',
    name: 'Edit Inbound',
    description: 'Permission to edit inbound details.',
    category: 'inbound_order',
  },
  {
    code: 'inbound.view',
    name: 'View Inbound Costs',
    description: 'Permission to view inbound cost details and landed-cost data.',
    category: 'inbound_order',
  },
  {
    code: 'user.manage',
    name: 'Manage Users',
    description: 'Permission to create, edit, and manage Talos users.',
    category: 'user_management',
  },
] as const

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function buildPermissionCatalogUpsertSql(): string {
  const values = TALOS_PERMISSION_CATALOG.map((permission) => {
    return `(
      md5(${sqlString(`talos_permission:${permission.code}`)}),
      ${sqlString(permission.code)},
      ${sqlString(permission.name)},
      ${sqlString(permission.description)},
      ${sqlString(permission.category)},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`
  }).join(',\n        ')

  return `
    INSERT INTO "permissions" ("id", "code", "name", "description", "category", "created_at", "updated_at")
    VALUES
        ${values}
    ON CONFLICT ("code") DO UPDATE SET
      "name" = EXCLUDED."name",
      "description" = EXCLUDED."description",
      "category" = EXCLUDED."category",
      "updated_at" = CURRENT_TIMESTAMP
  `
}
