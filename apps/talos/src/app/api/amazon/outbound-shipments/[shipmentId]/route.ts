import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { getOutboundShipmentDetails } from '@/lib/amazon/client'
import { getCurrentTenantCode } from '@/lib/tenant/server'

export const GET = withAuthAndParams(async (_request, params, _session) => {
  const shipmentId =
    typeof params?.shipmentId === 'string'
      ? params.shipmentId
      : Array.isArray(params?.shipmentId)
        ? params.shipmentId[0]
        : undefined

  if (!shipmentId) {
    return ApiResponses.badRequest('Shipment ID is required')
  }

  try {
    const tenantCode = await getCurrentTenantCode()
    const details = await getOutboundShipmentDetails(shipmentId, tenantCode ?? undefined)

    if (!details.shipment && !details.awdShipment && !details.inboundPlanShipment && !details.inboundPlan) {
      return ApiResponses.notFound(`Amazon shipment ${shipmentId} not found`)
    }

    return ApiResponses.success({ data: details })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
