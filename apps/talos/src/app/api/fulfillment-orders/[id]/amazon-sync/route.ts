import { withAuthAndParams, ApiResponses } from '@/lib/api'
import { getInboundShipmentDetails } from '@/lib/amazon/client'
import { hasPermission } from '@/lib/services/permission-service'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'

const hasText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const pickText = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    if (!hasText(candidate)) continue
    return candidate.trim()
  }
  return null
}

const getRecordString = (
  record: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null => {
  if (!record) return null

  for (const key of keys) {
    const direct = record[key]
    if (hasText(direct)) return direct.trim()
    const lowered = key.toLowerCase()
    const match = Object.keys(record).find(entry => entry.toLowerCase() === lowered)
    const value = match ? record[match] : undefined
    if (hasText(value)) return value.trim()
  }

  return null
}

const formatShipToAddress = (address: Record<string, unknown> | null | undefined) => {
  if (!address) return null

  const name = getRecordString(address, ['Name', 'name'])
  const line1 = getRecordString(address, ['AddressLine1', 'addressLine1', 'line1', 'address1'])
  const line2 = getRecordString(address, ['AddressLine2', 'addressLine2', 'line2', 'address2'])
  const city = getRecordString(address, ['City', 'city', 'town'])
  const state = getRecordString(address, ['StateOrProvinceCode', 'stateOrProvinceCode', 'state', 'province'])
  const postal = getRecordString(address, ['PostalCode', 'postalCode', 'zipCode', 'zip'])
  const country = getRecordString(address, ['CountryCode', 'countryCode', 'country'])

  const cityState = [city, state].filter(Boolean).join(', ')
  const cityStatePostal = [cityState, postal].filter(Boolean).join(' ')

  const parts = [name, line1, line2, cityStatePostal, country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * POST /api/fulfillment-orders/[id]/amazon-sync
 * Refresh Amazon shipment metadata on an existing FO (Amazon FBA only).
 */
export const POST = withAuthAndParams(async (_request, params, session) => {
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Fulfillment order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'fo.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  try {
    const prisma = await getTenantPrisma()
    const order = await prisma.fulfillmentOrder.findUnique({
      where: { id },
      select: {
        id: true,
        destinationType: true,
        amazonShipmentId: true,
        destinationName: true,
        destinationAddress: true,
        destinationCountry: true,
        externalReference: true,
      },
    })

    if (!order) {
      return ApiResponses.notFound('Fulfillment order not found')
    }

    if (order.destinationType !== 'AMAZON_FBA') {
      return ApiResponses.badRequest('Amazon sync is only available for Amazon FBA orders')
    }

    const shipmentId = pickText(order.amazonShipmentId)
    if (!shipmentId) {
      return ApiResponses.badRequest('Amazon shipment ID is required')
    }

    const tenantCode = await getCurrentTenantCode()
    const details = await getInboundShipmentDetails(shipmentId, tenantCode ?? undefined)

    const normalized = details.normalized ?? undefined
    const shipment = details.shipment ?? null

    const shipmentName = pickText(normalized?.shipmentName, shipment?.ShipmentName)
    const shipmentStatus = pickText(normalized?.shipmentStatus, shipment?.ShipmentStatus)
    const destinationFc = pickText(
      normalized?.destinationFulfillmentCenterId,
      shipment?.DestinationFulfillmentCenterId
    )
    const labelPrepType = pickText(normalized?.labelPrepType, shipment?.LabelPrepType)
    const boxContentsSource = pickText(normalized?.boxContentsSource, shipment?.BoxContentsSource)
    const referenceId = pickText(normalized?.referenceId)

    const shipFromAddress =
      normalized?.shipFromAddress ??
      (shipment?.ShipFromAddress && typeof shipment.ShipFromAddress === 'object' && !Array.isArray(shipment.ShipFromAddress)
        ? (shipment.ShipFromAddress as Record<string, unknown>)
        : null)
    const shipToAddress = normalized?.shipToAddress ?? null

    const updates: Prisma.FulfillmentOrderUpdateInput = {}

    if (shipmentName) updates.amazonShipmentName = sanitizeForDisplay(shipmentName)
    if (shipmentStatus) updates.amazonShipmentStatus = sanitizeForDisplay(shipmentStatus)
    if (destinationFc) {
      updates.amazonDestinationFulfillmentCenterId = sanitizeForDisplay(destinationFc)
      if (!hasText(order.destinationName)) {
        updates.destinationName = sanitizeForDisplay(destinationFc)
      }
    }
    if (labelPrepType) updates.amazonLabelPrepType = sanitizeForDisplay(labelPrepType)
    if (boxContentsSource) updates.amazonBoxContentsSource = sanitizeForDisplay(boxContentsSource)
    if (referenceId) updates.amazonReferenceId = sanitizeForDisplay(referenceId)

    if (shipFromAddress) {
      updates.amazonShipFromAddress = JSON.parse(JSON.stringify(shipFromAddress)) as Prisma.InputJsonValue
    }

    if (!hasText(order.externalReference)) {
      updates.externalReference = sanitizeForDisplay(shipmentId)
    }

    if (!hasText(order.destinationCountry)) {
      const country = getRecordString(shipToAddress, ['CountryCode', 'countryCode', 'country'])
      if (country) {
        updates.destinationCountry = sanitizeForDisplay(country)
      }
    }

    if (!hasText(order.destinationAddress)) {
      const formatted = formatShipToAddress(shipToAddress)
      if (formatted) {
        updates.destinationAddress = sanitizeForDisplay(formatted)
      }
    }

    const updated = await prisma.fulfillmentOrder.update({
      where: { id },
      data: updates,
      include: { lines: true, documents: true },
    })

    return ApiResponses.success({ data: updated })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})

