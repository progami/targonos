import { getTenantPrisma } from '@/lib/tenant/server'
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api'
import { Prisma, PurchaseOrderStatus } from '@targon/prisma-talos'
import { auditLog } from '@/lib/security/audit-logger'
import { toPublicOrderNumber } from './purchase-order-utils'

export interface UserContext {
  id?: string | null
  name?: string | null
}

export type PurchaseOrderWithLines = Prisma.PurchaseOrderGetPayload<{
  include: { lines: true }
}>

export type PurchaseOrderWithLinesAndProformaInvoices = Prisma.PurchaseOrderGetPayload<{
  include: { lines: true; proformaInvoices: true }
}>

const VISIBLE_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.ISSUED,
  PurchaseOrderStatus.MANUFACTURING,
  PurchaseOrderStatus.OCEAN,
  PurchaseOrderStatus.WAREHOUSE,
  PurchaseOrderStatus.SHIPPED,
  PurchaseOrderStatus.REJECTED,
  PurchaseOrderStatus.CANCELLED,
]

export function serializePurchaseOrder(
  order: PurchaseOrderWithLines,
  metadata?: {
    voidedFromStatus?: PurchaseOrderStatus | null
    voidedAt?: Date | string | null
  }
) {
  return {
    ...order,
    expectedDate: order.expectedDate?.toISOString() ?? null,
    postedAt: order.postedAt?.toISOString() ?? null,
    voidedFromStatus: metadata?.voidedFromStatus ?? null,
    voidedAt: metadata?.voidedAt
      ? typeof metadata.voidedAt === 'string'
        ? metadata.voidedAt
        : metadata.voidedAt.toISOString()
      : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    orderNumber: toPublicOrderNumber(order.orderNumber),
    lines: order.lines.map(line => ({
      ...line,
      unitCost: line.unitCost ? Number(line.unitCost) : null,
      totalCost: line.totalCost ? Number(line.totalCost) : null,
      createdAt: line.createdAt.toISOString(),
      updatedAt: line.updatedAt.toISOString(),
    })),
  }
}

export interface UpdatePurchaseOrderInput {
  expectedDate?: string | null
  incoterms?: string | null
  paymentTerms?: string | null
  counterpartyName?: string | null
  notes?: string | null
}

export async function getPurchaseOrders() {
  const prisma = await getTenantPrisma()

  return prisma.purchaseOrder.findMany({
    where: {
      isLegacy: false,
      status: { in: VISIBLE_STATUSES },
    },
    orderBy: { createdAt: 'desc' },
    include: { lines: true },
  })
}

export async function getPurchaseOrderById(id: string) {
  const prisma = await getTenantPrisma()

  return prisma.purchaseOrder.findFirst({
    where: {
      id,
      isLegacy: false,
      status: { in: VISIBLE_STATUSES },
    },
    include: { lines: true, proformaInvoices: { orderBy: [{ createdAt: 'asc' }] } },
  })
}

export async function updatePurchaseOrderDetails(
  id: string,
  input: UpdatePurchaseOrderInput,
  user?: UserContext
): Promise<PurchaseOrderWithLinesAndProformaInvoices> {
  const prisma = await getTenantPrisma()
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError('Purchase order not found')
  }

  if (
    order.isLegacy ||
    order.status !== PurchaseOrderStatus.DRAFT
  ) {
    throw new ConflictError('Only draft purchase orders can be edited')
  }

  let expectedDate: Date | null | undefined = order.expectedDate
  if (input.expectedDate !== undefined) {
    if (input.expectedDate === null || input.expectedDate === '') {
      expectedDate = null
    } else {
      const parsed = new Date(input.expectedDate)
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError('Invalid cargo ready date value')
      }
      expectedDate = parsed
    }
  }

  const incoterms =
    input.incoterms !== undefined
      ? input.incoterms === null || input.incoterms.trim().length === 0
        ? null
        : input.incoterms.trim().toUpperCase()
      : order.incoterms

  const paymentTerms =
    input.paymentTerms !== undefined
      ? input.paymentTerms === null || input.paymentTerms.trim().length === 0
        ? null
        : input.paymentTerms.trim()
      : order.paymentTerms

  const counterpartyName =
    input.counterpartyName !== undefined ? input.counterpartyName : order.counterpartyName

  let counterpartyAddress = order.counterpartyAddress ?? null
  if (input.counterpartyName !== undefined) {
    if (!counterpartyName) {
      counterpartyAddress = null
    } else if (counterpartyName !== order.counterpartyName) {
      const supplier = await prisma.supplier.findUnique({
        where: { name: counterpartyName },
        select: { address: true },
      })
      counterpartyAddress = supplier?.address ?? null
    }
  }
  const notes = input.notes !== undefined ? input.notes : order.notes

  const auditOldValue: Record<string, unknown> = {}
  const auditNewValue: Record<string, unknown> = {}

  const track = (key: string, before: unknown, after: unknown) => {
    if (before === after) return
    auditOldValue[key] = before
    auditNewValue[key] = after
  }

  track('counterpartyName', order.counterpartyName ?? null, counterpartyName ?? null)
  track('counterpartyAddress', order.counterpartyAddress ?? null, counterpartyAddress ?? null)
  track(
    'expectedDate',
    order.expectedDate ? order.expectedDate.toISOString() : null,
    expectedDate ? expectedDate.toISOString() : null
  )
  track('incoterms', order.incoterms ?? null, incoterms ?? null)
  track('paymentTerms', order.paymentTerms ?? null, paymentTerms ?? null)
  track('notes', order.notes ?? null, notes ?? null)

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: {
      counterpartyName,
      counterpartyAddress,
      expectedDate,
      incoterms,
      paymentTerms,
      notes,
    },
    include: { lines: true, proformaInvoices: { orderBy: [{ createdAt: 'asc' }] } },
  })

  if (Object.keys(auditNewValue).length > 0) {
    await auditLog({
      entityType: 'PurchaseOrder',
      entityId: order.id,
      action: 'UPDATE_DETAILS',
      userId: user?.id ?? 'SYSTEM',
      oldValue: auditOldValue,
      newValue: auditNewValue,
    })
  }

  return updated
}
