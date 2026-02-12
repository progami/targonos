import { randomUUID } from 'crypto'
import { ApiResponses, withAuthAndParams, z } from '@/lib/api'
import { PO_COST_CURRENCIES, normalizePoCostCurrency } from '@/lib/constants/cost-currency'
import { hasPermission } from '@/lib/services/permission-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { getCurrentTenant, getTenantPrisma } from '@/lib/tenant/server'
import { FinancialLedgerSourceType, FinancialLedgerCategory, Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

const WarehouseCostSchema = z.object({
  category: z.enum(['Inbound', 'Storage']),
  costName: z.string().trim().min(1),
  amount: z.number().positive(),
  currency: z.preprocess(
    value => normalizePoCostCurrency(value) ?? value,
    z.enum(PO_COST_CURRENCIES).optional()
  ),
  notes: z.string().trim().optional(),
})

const SOURCE_PREFIX = 'po_warehouse_cost'

function buildSourceId(purchaseOrderId: string, entryId: string) {
  return `${SOURCE_PREFIX}:${purchaseOrderId}:${entryId}`
}

function isOwnedSourceId(sourceId: string, purchaseOrderId: string) {
  return sourceId.startsWith(`${SOURCE_PREFIX}:${purchaseOrderId}:`)
}

const CATEGORY_MAP: Record<string, FinancialLedgerCategory> = {
  Inbound: FinancialLedgerCategory.Inbound,
  Storage: FinancialLedgerCategory.Storage,
}

function formatEntry(entry: {
  id: string
  category: FinancialLedgerCategory
  costName: string
  amount: Prisma.Decimal
  currency: string
  effectiveAt: Date
  createdAt: Date
  createdByName: string | null
  notes: string | null
}) {
  return {
    id: entry.id,
    category: entry.category,
    costName: entry.costName,
    amount: Number(entry.amount),
    currency: entry.currency,
    effectiveAt: entry.effectiveAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    createdByName: entry.createdByName ?? 'Unknown',
    notes: entry.notes ?? null,
  }
}

export const GET = withAuthAndParams(async (_request, params, session) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canView = await hasPermission(session.user.id, 'po.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const entries = await prisma.financialLedgerEntry.findMany({
    where: {
      sourceType: FinancialLedgerSourceType.MANUAL,
      purchaseOrderId: id,
      sourceId: { startsWith: `${SOURCE_PREFIX}:${id}:` },
      category: { in: [FinancialLedgerCategory.Inbound, FinancialLedgerCategory.Storage] },
    },
    orderBy: { createdAt: 'asc' },
  })

  return ApiResponses.success({
    data: entries.map(formatEntry),
  })
})

export const POST = withAuthAndParams(async (request, params, session) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = WarehouseCostSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()
  const tenant = await getCurrentTenant()
  const tenantCurrency = normalizePoCostCurrency(tenant.currency)
  if (!tenantCurrency) {
    return ApiResponses.badRequest(`Unsupported tenant currency: ${tenant.currency}`)
  }

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, status: true, warehouseCode: true, warehouseName: true },
  })

  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
    purchaseOrderStatus: order.status,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const warehouseCode =
    typeof order.warehouseCode === 'string' && order.warehouseCode.trim().length > 0
      ? order.warehouseCode.trim()
      : null
  const warehouseName =
    typeof order.warehouseName === 'string' && order.warehouseName.trim().length > 0
      ? order.warehouseName.trim()
      : null

  if (!warehouseCode || !warehouseName) {
    return ApiResponses.badRequest('Warehouse is required before recording warehouse costs')
  }

  const entryId = randomUUID()
  const notes =
    parsed.data.notes && parsed.data.notes.trim().length > 0 ? parsed.data.notes.trim() : null
  const rounded = Number(parsed.data.amount.toFixed(2))
  const decimalAmount = new Prisma.Decimal(rounded.toFixed(2))
  const category = CATEGORY_MAP[parsed.data.category]
  const currency = parsed.data.currency ?? tenantCurrency

  const entry = await prisma.financialLedgerEntry.create({
    data: {
      id: entryId,
      sourceType: FinancialLedgerSourceType.MANUAL,
      sourceId: buildSourceId(id, entryId),
      category,
      costName: parsed.data.costName.trim(),
      amount: decimalAmount,
      currency,
      warehouseCode,
      warehouseName,
      purchaseOrderId: id,
      effectiveAt: new Date(),
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
      notes,
    },
  })

  return ApiResponses.success({ data: formatEntry(entry) })
})

export const DELETE = withAuthAndParams(async (request, params, session) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const url = new URL(request.url)
  const costId = url.searchParams.get('costId')
  if (!costId) {
    return ApiResponses.badRequest('costId query parameter is required')
  }

  const prisma = await getTenantPrisma()

  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
  }

  const entry = await prisma.financialLedgerEntry.findUnique({
    where: { id: costId },
    select: { id: true, sourceId: true, sourceType: true },
  })

  if (!entry) {
    return ApiResponses.notFound('Cost entry not found')
  }

  if (
    entry.sourceType !== FinancialLedgerSourceType.MANUAL ||
    !isOwnedSourceId(entry.sourceId, id)
  ) {
    return ApiResponses.forbidden('Cannot delete this cost entry')
  }

  await prisma.financialLedgerEntry.delete({ where: { id: costId } })

  return ApiResponses.success({ deleted: true })
})
