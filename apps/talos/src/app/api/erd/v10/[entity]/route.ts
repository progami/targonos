import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { ApiResponses } from '@/lib/api/responses'
import {
  ERD_V10_ENTITY_COLUMNS,
  parseErdV10Limit,
  isErdV10Entity,
  type ErdV10Entity,
} from '@/lib/erd/v10'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

const ENTITY_ORDER_BY: Record<ErdV10Entity, string> = {
  sku: '"sku_code"',
  supplier: '"name"',
  warehouse: '"code"',
  lot: '"created_at" DESC',
  rfq: '"created_at" DESC',
  purchase_order: '"created_at" DESC',
  po_ci: '"ci_id", "lot_id"',
  commercial_invoice: '"ci_ref"',
  ci_allocation: '"ci_id", "lot_id"',
  grn: '"received_date" DESC',
  grn_line_item: '"grn_id", "line_id"',
  discrepancy: '"logged_at" DESC',
}

type EntityRow = Record<string, unknown>

export const GET = withAuthAndParams(async (request, params) => {
  const entityRaw = typeof params.entity === 'string' ? params.entity : null
  if (entityRaw === null || !isErdV10Entity(entityRaw)) {
    return ApiResponses.badRequest(
      `Invalid ERD entity. Use one of: ${Object.keys(ERD_V10_ENTITY_COLUMNS).join(', ')}`
    )
  }

  const limit = parseErdV10Limit(request.nextUrl.searchParams.get('limit'))
  const orderBy = ENTITY_ORDER_BY[entityRaw]

  const prisma = await getTenantPrisma()
  const rows = await prisma.$queryRawUnsafe<EntityRow[]>(
    `SELECT * FROM "${entityRaw}" ORDER BY ${orderBy} LIMIT ${limit}`
  )

  return ApiResponses.success({
    version: 'erd-v10',
    entity: entityRaw,
    columns: ERD_V10_ENTITY_COLUMNS[entityRaw],
    count: rows.length,
    rows,
  })
})

