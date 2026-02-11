import { Prisma } from '@targon/prisma-talos'
import { getTenantPrisma } from '@/lib/tenant/server'
import { getAccessibleTenantCodesForEmail, getPrismaForTenant } from '@/lib/tenant/access'
import type { TenantCode } from '@/lib/tenant/constants'

export type PoProductAssignmentRecord = {
  userEmail: string
  skuCode: string
  createdAt: Date
  createdByEmail: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function listAssignmentsByEmail(email: string): Promise<PoProductAssignmentRecord[]> {
  const normalizedEmail = normalizeEmail(email)
  const prisma = await getTenantPrisma()

  return prisma.$queryRaw<PoProductAssignmentRecord[]>(Prisma.sql`
    SELECT
      user_email AS "userEmail",
      sku_code AS "skuCode",
      created_at AS "createdAt",
      created_by_email AS "createdByEmail"
    FROM "po_product_assignments"
    WHERE user_email = ${normalizedEmail}
    ORDER BY sku_code ASC
  `)
}

export async function assignSkuToEmail(
  email: string,
  skuCode: string,
  createdByEmail: string
): Promise<PoProductAssignmentRecord> {
  const normalizedEmail = normalizeEmail(email)
  const prisma = await getTenantPrisma()

  const rows = await prisma.$queryRaw<PoProductAssignmentRecord[]>(Prisma.sql`
    INSERT INTO "po_product_assignments" (
      user_email,
      sku_code,
      created_by_email
    )
    VALUES (
      ${normalizedEmail},
      ${skuCode},
      ${normalizeEmail(createdByEmail)}
    )
    ON CONFLICT (user_email, sku_code)
    DO UPDATE SET created_by_email = EXCLUDED.created_by_email
    RETURNING
      user_email AS "userEmail",
      sku_code AS "skuCode",
      created_at AS "createdAt",
      created_by_email AS "createdByEmail"
  `)

  const assignment = rows[0]
  if (!assignment) {
    throw new Error('Failed to upsert PO product assignment')
  }

  return assignment
}

export async function unassignSkuFromEmail(email: string, skuCode: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email)
  const prisma = await getTenantPrisma()

  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "po_product_assignments"
    WHERE user_email = ${normalizedEmail}
      AND sku_code = ${skuCode}
  `)
}

export async function getAssignedSkuCodesAcrossTenants(
  email: string,
  tenantCodes: TenantCode[]
): Promise<string[]> {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || tenantCodes.length === 0) {
    return []
  }

  const assigned = new Set<string>()

  for (const tenantCode of tenantCodes) {
    const prisma = await getPrismaForTenant(tenantCode)
    const rows = await prisma.$queryRaw<{ skuCode: string }[]>(Prisma.sql`
      SELECT sku_code AS "skuCode"
      FROM "po_product_assignments"
      WHERE user_email = ${normalizedEmail}
    `)

    for (const row of rows) {
      assigned.add(row.skuCode)
    }
  }

  return Array.from(assigned)
}

export async function canViewManufacturingOrder(params: {
  email: string
  tenantCode: TenantCode
  poId: string
  isSuperAdmin: boolean
}): Promise<boolean> {
  if (params.isSuperAdmin) {
    return true
  }

  const accessibleTenantCodes = await getAccessibleTenantCodesForEmail(params.email)
  const assignedSkuCodes = await getAssignedSkuCodesAcrossTenants(params.email, accessibleTenantCodes)

  if (assignedSkuCodes.length === 0) {
    return false
  }

  const prisma = await getPrismaForTenant(params.tenantCode)
  const matches = await prisma.purchaseOrder.findFirst({
    where: {
      id: params.poId,
      isLegacy: false,
      status: 'MANUFACTURING',
      lines: {
        some: {
          skuCode: {
            in: assignedSkuCodes,
          },
        },
      },
    },
    select: { id: true },
  })

  return Boolean(matches)
}
