import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { getOutboundOrderById } from '@/lib/services/outbound-order-service'
import { hasPermission } from '@/lib/services/permission-service'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { Prisma } from '@targon/prisma-talos'

const emptyToNull = (value: unknown) => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string' && value.trim().length === 0) return null
  return value
}

const OptionalString = z.preprocess(emptyToNull, z.string().trim().optional().nullable())

const OptionalNumber = z.preprocess(value => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().nonnegative().optional().nullable())

const OptionalInt = z.preprocess(value => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? value : parsed
  }
  return value
}, z.number().int().nonnegative().optional().nullable())

const DateInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date',
  })

const OptionalDateString = z.preprocess(emptyToNull, DateInputSchema.optional().nullable())

export const GET = withAuthAndParams(async (_request, params, _session) => {
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Outbound order ID is required')
  }

  try {
    const order = await getOutboundOrderById(id)
    return ApiResponses.success({ data: order })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})

const UpdateDetailsSchema = z.object({
  destinationName: OptionalString,
  destinationAddress: OptionalString,
  destinationCountry: OptionalString,
  shippingCarrier: OptionalString,
  shippingMethod: OptionalString,
  trackingNumber: OptionalString,
  externalReference: OptionalString,
  amazonShipmentId: OptionalString,
  amazonShipmentName: OptionalString,
  amazonShipmentStatus: OptionalString,
  amazonDestinationFulfillmentCenterId: OptionalString,
  amazonLabelPrepType: OptionalString,
  amazonBoxContentsSource: OptionalString,
  amazonReferenceId: OptionalString,
  amazonShipmentReference: OptionalString,
  amazonShipperId: OptionalString,
  amazonPickupNumber: OptionalString,
  amazonPickupAppointmentId: OptionalString,
  amazonDeliveryAppointmentId: OptionalString,
  amazonLoadId: OptionalString,
  amazonFreightBillNumber: OptionalString,
  amazonBillOfLadingNumber: OptionalString,
  amazonPickupWindowStart: OptionalDateString,
  amazonPickupWindowEnd: OptionalDateString,
  amazonDeliveryWindowStart: OptionalDateString,
  amazonDeliveryWindowEnd: OptionalDateString,
  amazonPickupAddress: OptionalString,
  amazonPickupContactName: OptionalString,
  amazonPickupContactPhone: OptionalString,
  amazonDeliveryAddress: OptionalString,
  amazonShipmentMode: OptionalString,
  amazonBoxCount: OptionalInt,
  amazonPalletCount: OptionalInt,
  amazonCommodityDescription: OptionalString,
  amazonDistanceMiles: OptionalNumber,
  amazonBasePrice: OptionalNumber,
  amazonFuelSurcharge: OptionalNumber,
  amazonTotalPrice: OptionalNumber,
  amazonCurrency: OptionalString,
  notes: OptionalString,
})

export const PATCH = withAuthAndParams(async (request, params, session) => {
  const id =
    typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params?.id?.[0] : undefined

  if (!id) {
    return ApiResponses.badRequest('Outbound order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'outbound.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return ApiResponses.badRequest('Invalid update payload')
  }

  const parsed = UpdateDetailsSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const normalize = (value: string | null | undefined) => {
    if (value === undefined) return undefined
    if (value === null) return null
    const trimmed = value.trim()
    return trimmed ? sanitizeForDisplay(trimmed) : null
  }

  const parseOptionalDate = (value: string | null | undefined, label: string) => {
    if (value === undefined) return undefined
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${label} is invalid`)
    }
    return parsed
  }

  const updates: Prisma.OutboundOrderUpdateInput = {
    destinationName: normalize(parsed.data.destinationName),
    destinationAddress: normalize(parsed.data.destinationAddress),
    destinationCountry: normalize(parsed.data.destinationCountry),
    shippingCarrier: normalize(parsed.data.shippingCarrier),
    shippingMethod: normalize(parsed.data.shippingMethod),
    trackingNumber: normalize(parsed.data.trackingNumber),
    externalReference: normalize(parsed.data.externalReference),
    amazonShipmentId: normalize(parsed.data.amazonShipmentId),
    amazonShipmentName: normalize(parsed.data.amazonShipmentName),
    amazonShipmentStatus: normalize(parsed.data.amazonShipmentStatus),
    amazonDestinationFulfillmentCenterId: normalize(parsed.data.amazonDestinationFulfillmentCenterId),
    amazonLabelPrepType: normalize(parsed.data.amazonLabelPrepType),
    amazonBoxContentsSource: normalize(parsed.data.amazonBoxContentsSource),
    amazonReferenceId: normalize(parsed.data.amazonReferenceId),
    amazonShipmentReference: normalize(parsed.data.amazonShipmentReference),
    amazonShipperId: normalize(parsed.data.amazonShipperId),
    amazonPickupNumber: normalize(parsed.data.amazonPickupNumber),
    amazonPickupAppointmentId: normalize(parsed.data.amazonPickupAppointmentId),
    amazonDeliveryAppointmentId: normalize(parsed.data.amazonDeliveryAppointmentId),
    amazonLoadId: normalize(parsed.data.amazonLoadId),
    amazonFreightBillNumber: normalize(parsed.data.amazonFreightBillNumber),
    amazonBillOfLadingNumber: normalize(parsed.data.amazonBillOfLadingNumber),
    amazonPickupWindowStart: parseOptionalDate(parsed.data.amazonPickupWindowStart, 'Pickup window start'),
    amazonPickupWindowEnd: parseOptionalDate(parsed.data.amazonPickupWindowEnd, 'Pickup window end'),
    amazonDeliveryWindowStart: parseOptionalDate(
      parsed.data.amazonDeliveryWindowStart,
      'Delivery window start'
    ),
    amazonDeliveryWindowEnd: parseOptionalDate(
      parsed.data.amazonDeliveryWindowEnd,
      'Delivery window end'
    ),
    amazonPickupAddress: normalize(parsed.data.amazonPickupAddress),
    amazonPickupContactName: normalize(parsed.data.amazonPickupContactName),
    amazonPickupContactPhone: normalize(parsed.data.amazonPickupContactPhone),
    amazonDeliveryAddress: normalize(parsed.data.amazonDeliveryAddress),
    amazonShipmentMode: normalize(parsed.data.amazonShipmentMode),
    amazonCommodityDescription: normalize(parsed.data.amazonCommodityDescription),
    amazonCurrency: normalize(parsed.data.amazonCurrency),
    notes: normalize(parsed.data.notes),
  }

  if (parsed.data.amazonBoxCount !== undefined) {
    updates.amazonBoxCount = parsed.data.amazonBoxCount
  }
  if (parsed.data.amazonPalletCount !== undefined) {
    updates.amazonPalletCount = parsed.data.amazonPalletCount
  }
  if (parsed.data.amazonDistanceMiles !== undefined) {
    updates.amazonDistanceMiles = parsed.data.amazonDistanceMiles
  }
  if (parsed.data.amazonBasePrice !== undefined) {
    updates.amazonBasePrice = parsed.data.amazonBasePrice
  }
  if (parsed.data.amazonFuelSurcharge !== undefined) {
    updates.amazonFuelSurcharge = parsed.data.amazonFuelSurcharge
  }
  if (parsed.data.amazonTotalPrice !== undefined) {
    updates.amazonTotalPrice = parsed.data.amazonTotalPrice
  }

  try {
    const { getTenantPrisma } = await import('@/lib/tenant/server')
    const prisma = await getTenantPrisma()
    const updated = await prisma.outboundOrder.update({
      where: { id },
      data: updates,
      include: { lines: true, documents: true },
    })
    return ApiResponses.success({ data: updated })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
