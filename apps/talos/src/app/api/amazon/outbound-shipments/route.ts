import { withAuth, ApiResponses } from '@/lib/api'
import { getOutboundShipments } from '@/lib/amazon/client'
import { isAmazonSpApiConfigurationError } from '@/lib/amazon/config'
import { collectOutboundShipmentPages } from '@/lib/amazon/outbound-shipments'
import { getCurrentTenantCode } from '@/lib/tenant/server'

export const GET = withAuth(async (_request, _session) => {
  try {
    const tenantCode = await getCurrentTenantCode()
    const shipments = await collectOutboundShipmentPages(nextToken =>
      getOutboundShipments(tenantCode, nextToken === null ? undefined : { nextToken })
    )

    return ApiResponses.success({ data: { shipments, count: shipments.length } })
  } catch (error) {
    if (isAmazonSpApiConfigurationError(error)) {
      return ApiResponses.badRequest(error.message)
    }

    return ApiResponses.handleError(error)
  }
})
