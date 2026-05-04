import { ApiResponses } from '@/lib/api'
import { isCrossTenantOverrideRequest } from '@/lib/tenant/cross-tenant'
import type { PrismaClient } from '@targon/prisma-talos'
import { InboundOrderStatus } from '@targon/prisma-talos'

type Params = {
  prisma: PrismaClient
  inboundOrderId: string
  inboundOrderStatus?: InboundOrderStatus | null
}

export async function enforceCrossTenantManufacturingOnlyForInboundOrder(
  params: Params
): Promise<Response | null> {
  const isCrossTenant = await isCrossTenantOverrideRequest()
  if (!isCrossTenant) {
    return null
  }

  const status =
    params.inboundOrderStatus !== undefined
      ? params.inboundOrderStatus
      : (
          await params.prisma.inboundOrder.findUnique({
            where: { id: params.inboundOrderId },
            select: { status: true },
          })
        )?.status ?? null

  if (!status) {
    return ApiResponses.notFound('Inbound not found')
  }

  if (status !== InboundOrderStatus.MANUFACTURING) {
    return ApiResponses.forbidden('Cross-tenant access is only allowed during Manufacturing stage')
  }

  return null
}
