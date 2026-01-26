import { randomUUID } from 'crypto'
import { ApiResponses, withAuthAndParams, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { getCurrentTenant, getTenantPrisma } from '@/lib/tenant/server'
import { FinancialLedgerSourceType, FinancialLedgerCategory, Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

const SupplierAdjustmentSchema = z.object({
  kind: z.enum(['credit', 'debit']),
  amount: z.number().positive(),
  notes: z.string().trim().optional(),
})

const buildSourceId = (purchaseOrderId: string) => `po_receiving_discrepancy:${purchaseOrderId}`

export const GET = withAuthAndParams(async (_request, params) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const prisma = await getTenantPrisma()
  const entry = await prisma.financialLedgerEntry.findUnique({
    where: {
      sourceType_sourceId: {
        sourceType: FinancialLedgerSourceType.MANUAL,
        sourceId: buildSourceId(id),
      },
    },
  })

  if (!entry) {
    return ApiResponses.success({ data: null })
  }

  return ApiResponses.success({
    data: {
      id: entry.id,
      category: entry.category,
      costName: entry.costName,
      amount: Number(entry.amount),
      currency: entry.currency,
      effectiveAt: entry.effectiveAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      createdByName: entry.createdByName,
      notes: entry.notes ?? null,
    },
  })
})

export const PATCH = withAuthAndParams(async (request, params, session) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = SupplierAdjustmentSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()
  const tenant = await getCurrentTenant()
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { id: true, warehouseCode: true, warehouseName: true },
  })

  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
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
    return ApiResponses.badRequest('Warehouse is required before recording supplier adjustments')
  }

  const notes = parsed.data.notes && parsed.data.notes.trim().length > 0 ? parsed.data.notes.trim() : null

  const rounded = Number(parsed.data.amount.toFixed(2))
  const decimalAmount = new Prisma.Decimal(rounded.toFixed(2))
  const category =
    parsed.data.kind === 'credit'
      ? FinancialLedgerCategory.SupplierCredit
      : FinancialLedgerCategory.SupplierDebit
  const amount = parsed.data.kind === 'credit' ? decimalAmount.neg() : decimalAmount
  const costName = parsed.data.kind === 'credit' ? 'Supplier Credit Note' : 'Supplier Debit Note'

  const entry = await prisma.financialLedgerEntry.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: FinancialLedgerSourceType.MANUAL,
        sourceId: buildSourceId(id),
      },
    },
    create: {
      id: randomUUID(),
      sourceType: FinancialLedgerSourceType.MANUAL,
      sourceId: buildSourceId(id),
      category,
      costName,
      amount,
      currency: tenant.currency,
      warehouseCode,
      warehouseName,
      purchaseOrderId: id,
      effectiveAt: new Date(),
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
      notes,
    },
    update: {
      category,
      costName,
      amount,
      currency: tenant.currency,
      warehouseCode,
      warehouseName,
      createdByName: session.user.name ?? session.user.email ?? 'Unknown',
      notes,
    },
  })

  return ApiResponses.success({
    data: {
      id: entry.id,
      category: entry.category,
      costName: entry.costName,
      amount: Number(entry.amount),
      currency: entry.currency,
      effectiveAt: entry.effectiveAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      createdByName: entry.createdByName,
      notes: entry.notes ?? null,
    },
  })
})
