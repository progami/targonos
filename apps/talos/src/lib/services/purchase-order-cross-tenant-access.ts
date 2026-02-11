import { ApiResponses } from '@/lib/api'
import { isCrossTenantOverrideRequest } from '@/lib/tenant/cross-tenant'
import type { PrismaClient } from '@targon/prisma-talos'
import { PurchaseOrderStatus } from '@targon/prisma-talos'

type Params = {
  prisma: PrismaClient
  purchaseOrderId: string
  purchaseOrderStatus?: PurchaseOrderStatus | null
}

export async function enforceCrossTenantManufacturingOnlyForPurchaseOrder(
  params: Params
): Promise<Response | null> {
  const isCrossTenant = await isCrossTenantOverrideRequest()
  if (!isCrossTenant) {
    return null
  }

  const status =
    params.purchaseOrderStatus !== undefined
      ? params.purchaseOrderStatus
      : (
          await params.prisma.purchaseOrder.findUnique({
            where: { id: params.purchaseOrderId },
            select: { status: true },
          })
        )?.status ?? null

  if (!status) {
    return ApiResponses.notFound('Purchase order not found')
  }

  if (status !== PurchaseOrderStatus.MANUFACTURING) {
    return ApiResponses.forbidden('Cross-tenant access is only allowed during Manufacturing stage')
  }

  return null
}
