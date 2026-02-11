import { NextResponse } from 'next/server'
import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { generatePurchaseOrderShippingMarks } from '@/lib/services/po-stage-service'
import type { UserContext } from '@/lib/services/po-stage-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { getTenantPrisma } from '@/lib/tenant/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export const POST = withAuthAndParams(async (_request, params, session) => {
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params?.id?.[0]
        : undefined

  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canGenerate = await hasPermission(session.user.id, 'po.edit')
  if (!canGenerate) {
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

  const userContext: UserContext = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? 'Unknown',
    email: session.user.email ?? '',
  }

  try {
    const html = await generatePurchaseOrderShippingMarks({ orderId: id, user: userContext })
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
