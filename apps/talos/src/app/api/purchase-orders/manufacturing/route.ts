import { NextRequest } from 'next/server'
import { ApiResponses } from '@/lib/api'
import { auth } from '@/lib/auth'
import { PURCHASE_ORDER_BASE_CURRENCY } from '@/lib/constants/cost-currency'
import { serializePurchaseOrder } from '@/lib/services/po-stage-service'
import { getPrismaForTenant } from '@/lib/tenant/access'
import type { TenantCode } from '@/lib/tenant/constants'
import { getAuthorizedTenantCodesForSession, isPortalPlatformAdmin } from '@/lib/tenant/session'
import { getAssignedSkuCodesAcrossTenants } from '@/lib/services/po-product-assignment-service'

export const dynamic = 'force-dynamic'

type SerializedManufacturingOrder = Record<string, unknown> & {
  id: string
  createdAt: string
  lines?: Array<{ skuCode: string }>
}

export const GET = async (_request: NextRequest) => {
  const session = await auth()
  if (!session) {
    return ApiResponses.unauthorized()
  }

  const email = (session.user.email || '').trim().toLowerCase()
  if (!email) {
    return ApiResponses.unauthorized('Session email is required')
  }

  const superAdmin = isPortalPlatformAdmin(session)
  const tenantCodes: TenantCode[] = getAuthorizedTenantCodesForSession(session as never)

  const assignedSkuCodes = superAdmin
    ? []
    : await getAssignedSkuCodesAcrossTenants(email, tenantCodes)

  if (!superAdmin && assignedSkuCodes.length === 0) {
    return ApiResponses.success({ data: [] })
  }

  const assignedSkuSet = new Set(assignedSkuCodes)
  const rows: Array<Record<string, unknown>> = []

  for (const tenantCode of tenantCodes) {
    const prisma = await getPrismaForTenant(tenantCode)

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        isLegacy: false,
        status: 'MANUFACTURING',
        ...(superAdmin
          ? {}
          : {
              lines: {
                some: {
                  skuCode: {
                    in: assignedSkuCodes,
                  },
                },
              },
            }),
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

    for (const order of orders) {
      const serialized = serializePurchaseOrder(order, {
        defaultCurrency: PURCHASE_ORDER_BASE_CURRENCY,
      }) as SerializedManufacturingOrder

      const lineSkuCodes = Array.isArray(serialized.lines)
        ? serialized.lines
            .map(line => line.skuCode)
            .filter((skuCode): skuCode is string => typeof skuCode === 'string')
        : []

      const matchedSkuCodes = superAdmin
        ? Array.from(new Set(lineSkuCodes))
        : Array.from(new Set(lineSkuCodes.filter(skuCode => assignedSkuSet.has(skuCode))))

      rows.push({
        ...serialized,
        tenantCode,
        matchedSkuCodes,
      })
    }
  }

  rows.sort((a, b) => {
    const aCreated = typeof a.createdAt === 'string' ? Date.parse(a.createdAt) : 0
    const bCreated = typeof b.createdAt === 'string' ? Date.parse(b.createdAt) : 0
    return bCreated - aCreated
  })

  return ApiResponses.success({ data: rows })
}
