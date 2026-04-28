import { NextResponse } from 'next/server'
import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { generateInboundOrderShippingMarks } from '@/lib/services/inbound-stage-service'
import type { UserContext } from '@/lib/services/inbound-stage-service'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
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
    return ApiResponses.badRequest('Inbound ID is required')
  }

  const canGenerate = await hasPermission(session.user.id, 'inbound.edit')
  if (!canGenerate) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()
  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
    prisma,
    inboundOrderId: id,
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
    const html = await generateInboundOrderShippingMarks({ orderId: id, user: userContext })
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
