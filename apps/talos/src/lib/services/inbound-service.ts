import { getTenantPrisma } from '@/lib/tenant/server'
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api'
import { Prisma, InboundOrderStatus } from '@targon/prisma-talos'
import { auditLog } from '@/lib/security/audit-logger'
import {
  resolveInboundOrderUnitCost,
  toInboundOrderTotalCostNumberOrNull,
} from '@/lib/inbound-line-costs'
import {
  assertInboundOrderMutable,
  getQueryableInboundOrderStatuses,
  normalizeInboundOrderWorkflowStatus,
} from '@/lib/inbound/workflow'
import { toPublicOrderNumber } from './inbound-utils'

export interface UserContext {
  id?: string | null
  name?: string | null
}

export type InboundOrderWithLines = Prisma.InboundOrderGetPayload<{
  include: {
    lines: true
    grns: {
      select: {
        referenceNumber: true
        receivedAt: true
        createdAt: true
      }
    }
  }
}>

export type InboundOrderWithLinesAndProformaInvoices = Prisma.InboundOrderGetPayload<{
  include: {
    lines: true
    proformaInvoices: true
    grns: {
      select: {
        referenceNumber: true
        receivedAt: true
        createdAt: true
      }
    }
  }
}>

const QUERYABLE_STATUSES = getQueryableInboundOrderStatuses()

export function serializeInboundOrder(
  order: InboundOrderWithLines,
  metadata?: {
    voidedFromStatus?: InboundOrderStatus | null
    voidedAt?: Date | string | null
  }
) {
  return {
    ...order,
    status: normalizeInboundOrderWorkflowStatus(order.status),
    expectedDate: order.expectedDate?.toISOString() ?? null,
    postedAt: order.postedAt?.toISOString() ?? null,
    voidedFromStatus: metadata?.voidedFromStatus
      ? normalizeInboundOrderWorkflowStatus(metadata.voidedFromStatus)
      : null,
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
      unitCost: resolveInboundOrderUnitCost({
        unitCost: line.unitCost,
        totalCost: line.totalCost,
        unitsOrdered: line.unitsOrdered,
      }),
      totalCost: toInboundOrderTotalCostNumberOrNull(line.totalCost),
      createdAt: line.createdAt.toISOString(),
      updatedAt: line.updatedAt.toISOString(),
    })),
  }
}

export interface UpdateInboundOrderInput {
  expectedDate?: string | null
  incoterms?: string | null
  paymentTerms?: string | null
  counterpartyName?: string | null
  notes?: string | null
  manufacturingStartDate?: string | null
}

export async function getInboundOrders() {
  const prisma = await getTenantPrisma()

  const where: Prisma.InboundOrderWhereInput = {
    isLegacy: false,
    status: { in: QUERYABLE_STATUSES },
  }

  return prisma.inboundOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
      grns: {
        select: {
          referenceNumber: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function getInboundOrdersBySplitGroup(splitGroupId: string) {
  const prisma = await getTenantPrisma()

  const trimmed = splitGroupId.trim()
  if (!trimmed) {
    return []
  }

  const where: Prisma.InboundOrderWhereInput = {
    isLegacy: false,
    status: { in: QUERYABLE_STATUSES },
    splitGroupId: trimmed,
  }

  return prisma.inboundOrder.findMany({
    where: {
      ...where,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
      grns: {
        select: {
          referenceNumber: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function getInboundOrderById(id: string) {
  const prisma = await getTenantPrisma()

  return prisma.inboundOrder.findFirst({
    where: {
      id,
      isLegacy: false,
      status: { in: QUERYABLE_STATUSES },
    },
    include: {
      lines: true,
      proformaInvoices: { orderBy: [{ createdAt: 'asc' }] },
      grns: {
        select: {
          referenceNumber: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  })
}

export async function updateInboundOrderDetails(
  id: string,
  input: UpdateInboundOrderInput,
  user?: UserContext
): Promise<InboundOrderWithLinesAndProformaInvoices> {
  const prisma = await getTenantPrisma()
  const order = await prisma.inboundOrder.findUnique({
    where: { id },
  })

  if (!order) {
    throw new NotFoundError('Inbound not found')
  }

  if (order.isLegacy) {
    throw new ConflictError('Cannot edit legacy inbound')
  }

  assertInboundOrderMutable({
    status: order.status,
    postedAt: order.postedAt,
  })

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

  let manufacturingStartDate: Date | null | undefined = order.manufacturingStartDate
  if (input.manufacturingStartDate !== undefined) {
    if (input.manufacturingStartDate === null || input.manufacturingStartDate === '') {
      manufacturingStartDate = null
    } else {
      const parsed = new Date(input.manufacturingStartDate)
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError('Invalid manufacturing start date value')
      }
      manufacturingStartDate = parsed
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

  let counterpartyName =
    input.counterpartyName !== undefined ? input.counterpartyName : order.counterpartyName

  let counterpartyAddress = order.counterpartyAddress ?? null
  if (input.counterpartyName !== undefined) {
    const supplierName =
      typeof counterpartyName === 'string' && counterpartyName.trim().length > 0
        ? counterpartyName.trim()
        : null

    if (!supplierName) {
      counterpartyName = null
      counterpartyAddress = null
    } else {
      const supplier = await prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: 'insensitive' } },
        select: { name: true, address: true },
      })

      if (!supplier) {
        throw new ValidationError(
          `Supplier ${supplierName} not found. Create it in Config → Suppliers first.`
        )
      }

      counterpartyName = supplier.name
      counterpartyAddress = supplier.address ?? null
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
  track(
    'manufacturingStartDate',
    order.manufacturingStartDate ? order.manufacturingStartDate.toISOString() : null,
    manufacturingStartDate ? manufacturingStartDate.toISOString() : null
  )

  const updated = await prisma.inboundOrder.update({
    where: { id },
    data: {
      counterpartyName,
      counterpartyAddress,
      expectedDate,
      incoterms,
      paymentTerms,
      notes,
      manufacturingStartDate,
    },
    include: {
      lines: true,
      proformaInvoices: { orderBy: [{ createdAt: 'asc' }] },
      grns: {
        select: {
          referenceNumber: true,
          receivedAt: true,
          createdAt: true,
        },
      },
    },
  })

  if (Object.keys(auditNewValue).length > 0) {
    await auditLog({
      entityType: 'InboundOrder',
      entityId: order.id,
      action: 'UPDATE_DETAILS',
      userId: user?.id ?? 'SYSTEM',
      oldValue: auditOldValue,
      newValue: auditNewValue,
    })
  }

  return updated
}
