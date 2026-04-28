import { ApiResponses } from '@/lib/api'
import { auth } from '@/lib/auth'
import { INBOUND_BASE_CURRENCY } from '@/lib/constants/cost-currency'
import { getS3Service } from '@/services/s3.service'
import { serializeInboundOrder } from '@/lib/services/inbound-stage-service'
import { getPrismaForTenant } from '@/lib/tenant/access'
import { isValidTenantCode, type TenantCode } from '@/lib/tenant/constants'
import { getAuthorizedTenantCodesForSession, isPortalPlatformAdmin } from '@/lib/tenant/session'
import { getAssignedSkuCodesAcrossTenants } from '@/lib/services/inbound-product-assignment-service'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'
import { CostCategory, FinancialLedgerSourceType } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

type RouteParams = {
  tenant?: string
  id?: string
}

type CostBreakdownRow = {
  costName: string
  totalCost: number
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2))
}

const buildSupplierAdjustmentSourceId = (inboundOrderId: string) =>
  `inbound_receiving_discrepancy:${inboundOrderId}`

export const GET = async (_request: Request, context: { params: Promise<RouteParams> }) => {
  const session = await auth()
  if (!session) {
    return ApiResponses.unauthorized()
  }

  const params = await context.params
  const tenantRaw = typeof params.tenant === 'string' ? params.tenant.trim().toUpperCase() : ''
  const id = typeof params.id === 'string' ? params.id : ''

  if (!isValidTenantCode(tenantRaw)) {
    return ApiResponses.badRequest('Invalid tenant code')
  }

  if (!id) {
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const tenantCode = tenantRaw as TenantCode
  const email = (session.user.email || '').trim().toLowerCase()
  if (!email) {
    return ApiResponses.unauthorized('Session email is required')
  }

  const superAdmin = isPortalPlatformAdmin(session)
  const accessibleTenantCodes: TenantCode[] = getAuthorizedTenantCodesForSession(session as never)

  if (!accessibleTenantCodes.includes(tenantCode)) {
    return ApiResponses.forbidden('Access denied for tenant')
  }

  const assignedSkuCodes = superAdmin
    ? []
    : await getAssignedSkuCodesAcrossTenants(email, accessibleTenantCodes)
  const assignedSkuSet = new Set(assignedSkuCodes)

  if (!superAdmin && assignedSkuCodes.length === 0) {
    return ApiResponses.notFound('Inbound not found')
  }

  const prisma = await getPrismaForTenant(tenantCode)

  const order = await prisma.inboundOrder.findFirst({
    where: {
      id,
      isLegacy: false,
      status: 'MANUFACTURING',
    },
    include: {
      lines: true,
      proformaInvoices: {
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  })

  if (!order) {
    return ApiResponses.notFound('Inbound not found')
  }

  const matchedSkuCodes = Array.from(
    new Set(
      order.lines
        .map(line => line.skuCode)
        .filter(skuCode => superAdmin || assignedSkuSet.has(skuCode))
    )
  )

  if (!superAdmin && matchedSkuCodes.length === 0) {
    return ApiResponses.notFound('Inbound not found')
  }

  const supplier =
    order.counterpartyName && order.counterpartyName.trim().length > 0
      ? await prisma.supplier.findFirst({
          where: { name: { equals: order.counterpartyName.trim(), mode: 'insensitive' } },
          select: { phone: true, bankingDetails: true, address: true },
        })
      : null

  const serialized = serializeInboundOrder(order, {
    defaultCurrency: INBOUND_BASE_CURRENCY,
  })

  const s3Service = getS3Service()
  const docs = await prisma.inboundOrderDocument.findMany({
    where: { inboundOrderId: id },
    orderBy: [{ stage: 'asc' }, { documentType: 'asc' }, { uploadedAt: 'desc' }],
  })

  const documents = await Promise.all(
    docs.map(async doc => ({
      id: doc.id,
      stage: doc.stage,
      documentType: doc.documentType,
      fileName: doc.fileName,
      contentType: doc.contentType,
      size: doc.size,
      uploadedAt: doc.uploadedAt.toISOString(),
      uploadedByName: doc.uploadedByName,
      s3Key: doc.s3Key,
      viewUrl: await s3Service.getPresignedUrl(doc.s3Key, 'get', { expiresIn: 3600 }),
    }))
  )

  const forwardingCosts = await prisma.inboundOrderForwardingCost.findMany({
    where: { inboundOrderId: id },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      inboundOrderId: true,
      warehouseId: true,
      costRateId: true,
      costName: true,
      quantity: true,
      unitRate: true,
      totalCost: true,
      currency: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdById: true,
      createdByName: true,
      warehouse: { select: { code: true, name: true } },
    },
  })

  const costEntries = await prisma.costLedger.findMany({
    where: {
      transaction: { inboundOrderId: id },
    },
    select: {
      costCategory: true,
      costName: true,
      totalCost: true,
    },
  })

  const totals = {
    inbound: 0,
    outbound: 0,
    forwarding: 0,
    storage: 0,
    total: 0,
  }

  const breakdownByCategory = new Map<CostCategory, Map<string, number>>()

  for (const entry of costEntries) {
    const totalCost = Number(entry.totalCost)
    if (!Number.isFinite(totalCost) || totalCost <= 0) continue

    totals.total += totalCost

    switch (entry.costCategory) {
      case CostCategory.Inbound:
        totals.inbound += totalCost
        break
      case CostCategory.Outbound:
        totals.outbound += totalCost
        break
      case CostCategory.Forwarding:
        totals.forwarding += totalCost
        break
      case CostCategory.Storage:
        totals.storage += totalCost
        break
    }

    if (!breakdownByCategory.has(entry.costCategory)) {
      breakdownByCategory.set(entry.costCategory, new Map<string, number>())
    }

    const categoryMap = breakdownByCategory.get(entry.costCategory)
    if (!categoryMap) continue
    categoryMap.set(entry.costName, (categoryMap.get(entry.costName) ?? 0) + totalCost)
  }

  const toBreakdown = (category: CostCategory): CostBreakdownRow[] => {
    const categoryMap = breakdownByCategory.get(category)
    if (!categoryMap) return []

    return Array.from(categoryMap.entries())
      .map(([costName, totalCost]) => ({ costName, totalCost: roundMoney(totalCost) }))
      .sort((a, b) => a.costName.localeCompare(b.costName))
  }

  const supplierAdjustment = await prisma.financialLedgerEntry.findUnique({
    where: {
      sourceType_sourceId: {
        sourceType: FinancialLedgerSourceType.MANUAL,
        sourceId: buildSupplierAdjustmentSourceId(id),
      },
    },
  })

  return ApiResponses.success({
    ...serialized,
    tenantCode,
    matchedSkuCodes,
    crossTenantReadOnly: true,
    supplier: supplier
      ? {
          phone: supplier.phone ?? null,
          bankingDetails: supplier.bankingDetails ?? null,
          address: supplier.address ?? null,
          country: deriveSupplierCountry(supplier.address),
        }
      : null,
    documents,
    forwardingCosts: forwardingCosts.map(row => ({
      id: row.id,
      inboundOrderId: row.inboundOrderId,
      warehouse: row.warehouse,
      costRateId: row.costRateId,
      costName: row.costName,
      quantity: Number(row.quantity),
      unitRate: Number(row.unitRate),
      totalCost: Number(row.totalCost),
      currency: row.currency ?? null,
      notes: row.notes ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdById: row.createdById ?? null,
      createdByName: row.createdByName ?? null,
    })),
    costSummary: {
      totals: {
        inbound: roundMoney(totals.inbound),
        outbound: roundMoney(totals.outbound),
        forwarding: roundMoney(totals.forwarding),
        storage: roundMoney(totals.storage),
        total: roundMoney(totals.total),
      },
      breakdown: {
        inbound: toBreakdown(CostCategory.Inbound),
        outbound: toBreakdown(CostCategory.Outbound),
        forwarding: toBreakdown(CostCategory.Forwarding),
        storage: toBreakdown(CostCategory.Storage),
      },
    },
    supplierAdjustment: supplierAdjustment
      ? {
          id: supplierAdjustment.id,
          category: supplierAdjustment.category,
          costName: supplierAdjustment.costName,
          amount: Number(supplierAdjustment.amount),
          currency: INBOUND_BASE_CURRENCY,
          effectiveAt: supplierAdjustment.effectiveAt.toISOString(),
          createdAt: supplierAdjustment.createdAt.toISOString(),
          createdByName: supplierAdjustment.createdByName,
          notes: supplierAdjustment.notes ?? null,
        }
      : null,
  })
}
