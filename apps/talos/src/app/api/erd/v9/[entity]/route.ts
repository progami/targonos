import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { ApiResponses } from '@/lib/api/responses'
import {
  ERD_V9_ENTITY_COLUMNS,
  parseErdV9Limit,
  isErdV9Entity,
  type ErdV9Entity,
} from '@/lib/erd/v9'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

const ENTITY_ORDER_BY: Record<ErdV9Entity, string> = {
  sku: '"sku_code"',
  supplier: '"name"',
  warehouse: '"code"',
  lot: '"po_id", "sku_id"',
  purchase_order: '"created_at" DESC',
  po_ci: '"po_id", "sku_id", "ci_id"',
  commercial_invoice: '"ci_ref"',
  ci_allocation: '"po_id", "sku_id"',
  grn: '"received_date" DESC',
  grn_line_item: '"grn_id", "line_id"',
  discrepancy: '"logged_at" DESC',
}

type EntityRow = Record<string, unknown>

export const GET = withAuthAndParams(async (request, params) => {
  const entityRaw = typeof params.entity === 'string' ? params.entity : null
  if (entityRaw === null || !isErdV9Entity(entityRaw)) {
    return ApiResponses.badRequest(`Invalid ERD entity. Use one of: ${Object.keys(ERD_V9_ENTITY_COLUMNS).join(', ')}`)
  }

  const limit = parseErdV9Limit(request.nextUrl.searchParams.get('limit'))
  const orderBy = ENTITY_ORDER_BY[entityRaw]

  const prisma = await getTenantPrisma()
  const rows = await prisma.$queryRawUnsafe<EntityRow[]>(
    `SELECT * FROM "${entityRaw}" ORDER BY ${orderBy} LIMIT ${limit}`
  )

  return ApiResponses.success({
    version: 'erd-v9',
    entity: entityRaw,
    columns: ERD_V9_ENTITY_COLUMNS[entityRaw],
    count: rows.length,
    rows,
  })
})
