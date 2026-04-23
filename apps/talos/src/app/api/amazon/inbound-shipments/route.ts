import { withAuth, ApiResponses } from '@/lib/api'
import { getInboundShipments } from '@/lib/amazon/client'
import { isAmazonSpApiConfigurationError } from '@/lib/amazon/config'
import { collectInboundShipmentPages } from '@/lib/amazon/inbound-shipments'
import { getCurrentTenantCode } from '@/lib/tenant/server'

export const GET = withAuth(async (_request, _session) => {
  try {
    const tenantCode = await getCurrentTenantCode()
    const shipments = await collectInboundShipmentPages(nextToken =>
      getInboundShipments(tenantCode, nextToken === null ? undefined : { nextToken })
    )

    return ApiResponses.success({ data: { shipments, count: shipments.length } })
  } catch (error) {
    if (isAmazonSpApiConfigurationError(error)) {
      return ApiResponses.badRequest(error.message)
    }

    return ApiResponses.handleError(error)
  }
})
