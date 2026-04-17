export type TalosPermissionCatalogEntry = {
  code: string
  name: string
  description: string
  category: string
}

export const TALOS_PERMISSION_CATALOG: readonly TalosPermissionCatalogEntry[] = [
  {
    code: 'fo.create',
    name: 'Create Fulfillment Orders',
    description: 'Permission to create fulfillment orders.',
    category: 'fulfillment_order',
  },
  {
    code: 'fo.edit',
    name: 'Edit Fulfillment Orders',
    description: 'Permission to edit fulfillment order details.',
    category: 'fulfillment_order',
  },
  {
    code: 'fo.stage',
    name: 'Advance Fulfillment Order Stage',
    description: 'Permission to advance fulfillment orders through stage transitions.',
    category: 'fulfillment_order',
  },
  {
    code: 'permission.manage',
    name: 'Manage Permissions',
    description: 'Permission to grant and revoke Talos permissions.',
    category: 'user_management',
  },
  {
    code: 'po.approve.draft_to_manufacturing',
    name: 'Approve Draft To Manufacturing',
    description: 'Permission to approve purchase orders from draft to manufacturing.',
    category: 'purchase_order',
  },
  {
    code: 'po.approve.manufacturing_to_ocean',
    name: 'Approve Manufacturing To Ocean',
    description: 'Permission to approve purchase orders from manufacturing to ocean.',
    category: 'purchase_order',
  },
  {
    code: 'po.approve.ocean_to_warehouse',
    name: 'Approve Ocean To Warehouse',
    description: 'Permission to approve purchase orders from ocean to warehouse.',
    category: 'purchase_order',
  },
  {
    code: 'po.cancel',
    name: 'Cancel Purchase Orders',
    description: 'Permission to cancel purchase orders.',
    category: 'purchase_order',
  },
  {
    code: 'po.create',
    name: 'Create Purchase Orders',
    description: 'Permission to create purchase orders.',
    category: 'purchase_order',
  },
  {
    code: 'po.edit',
    name: 'Edit Purchase Orders',
    description: 'Permission to edit purchase order details.',
    category: 'purchase_order',
  },
  {
    code: 'po.view',
    name: 'View Purchase Order Costs',
    description: 'Permission to view purchase-order cost details and landed-cost data.',
    category: 'purchase_order',
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
