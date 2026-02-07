import { NextRequest } from 'next/server'
import { withAuth, ApiResponses, z } from '@/lib/api'
import {
  createFulfillmentOrder,
  listFulfillmentOrders,
  type CreateFulfillmentOrderInput,
  type FulfillmentUserContext,
} from '@/lib/services/fulfillment-order-service'
import { hasPermission } from '@/lib/services/permission-service'
import { FulfillmentDestinationType } from '@targon/prisma-talos'

export const GET = withAuth(async (_request: NextRequest, _session) => {
  const orders = await listFulfillmentOrders()
  return ApiResponses.success({ data: orders })
})

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

const OptionalDateString = z.preprocess(emptyToNull, z.string().trim().optional().nullable())

const LineItemSchema = z.object({
  skuCode: z.string().min(1),
  skuDescription: z.string().optional(),
  lotRef: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
})

const CreateFOSchema = z.object({
  warehouseCode: z.string().min(1),
  warehouseName: z.string().optional(),
  destinationType: z.nativeEnum(FulfillmentDestinationType).optional(),
  destinationName: z.string().optional(),
  destinationAddress: z.string().optional(),
  destinationCountry: z.string().optional(),
  shippingCarrier: z.string().optional(),
  shippingMethod: z.string().optional(),
  trackingNumber: z.string().optional(),
  externalReference: z.string().optional(),
  amazonShipmentId: OptionalString,
  amazonShipmentName: OptionalString,
  amazonShipmentStatus: OptionalString,
  amazonDestinationFulfillmentCenterId: OptionalString,
  amazonLabelPrepType: OptionalString,
  amazonBoxContentsSource: OptionalString,
  amazonShipFromAddress: z.record(z.unknown()).optional().nullable(),
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
  notes: z.string().optional(),
  lines: z.array(LineItemSchema).min(1, 'At least one line item is required'),
})

/**
 * POST /api/fulfillment-orders
 * Create a new Fulfillment Order (FO) in DRAFT status.
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const payload = await request.json().catch(() => null)
  const result = CreateFOSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map((e) => e.message).join(', ')}`
    )
  }

  const userContext: FulfillmentUserContext = {
    id: session.user.id,
    name: session.user.name || session.user.email || 'Unknown',
  }

  const canCreate = await hasPermission(userContext.id, 'fo.create')
  if (!canCreate) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const input: CreateFulfillmentOrderInput = {
    warehouseCode: result.data.warehouseCode,
    warehouseName: result.data.warehouseName,
    destinationType: result.data.destinationType,
    destinationName: result.data.destinationName,
    destinationAddress: result.data.destinationAddress,
    destinationCountry: result.data.destinationCountry,
    shippingCarrier: result.data.shippingCarrier,
    shippingMethod: result.data.shippingMethod,
    trackingNumber: result.data.trackingNumber,
    externalReference: result.data.externalReference,
    amazonShipmentId: result.data.amazonShipmentId,
    amazonShipmentName: result.data.amazonShipmentName,
    amazonShipmentStatus: result.data.amazonShipmentStatus,
    amazonDestinationFulfillmentCenterId: result.data.amazonDestinationFulfillmentCenterId,
    amazonLabelPrepType: result.data.amazonLabelPrepType,
    amazonBoxContentsSource: result.data.amazonBoxContentsSource,
    amazonShipFromAddress: result.data.amazonShipFromAddress ?? undefined,
    amazonReferenceId: result.data.amazonReferenceId,
    amazonShipmentReference: result.data.amazonShipmentReference,
    amazonShipperId: result.data.amazonShipperId,
    amazonPickupNumber: result.data.amazonPickupNumber,
    amazonPickupAppointmentId: result.data.amazonPickupAppointmentId,
    amazonDeliveryAppointmentId: result.data.amazonDeliveryAppointmentId,
    amazonLoadId: result.data.amazonLoadId,
    amazonFreightBillNumber: result.data.amazonFreightBillNumber,
    amazonBillOfLadingNumber: result.data.amazonBillOfLadingNumber,
    amazonPickupWindowStart: result.data.amazonPickupWindowStart,
    amazonPickupWindowEnd: result.data.amazonPickupWindowEnd,
    amazonDeliveryWindowStart: result.data.amazonDeliveryWindowStart,
    amazonDeliveryWindowEnd: result.data.amazonDeliveryWindowEnd,
    amazonPickupAddress: result.data.amazonPickupAddress,
    amazonPickupContactName: result.data.amazonPickupContactName,
    amazonPickupContactPhone: result.data.amazonPickupContactPhone,
    amazonDeliveryAddress: result.data.amazonDeliveryAddress,
    amazonShipmentMode: result.data.amazonShipmentMode,
    amazonBoxCount: result.data.amazonBoxCount,
    amazonPalletCount: result.data.amazonPalletCount,
    amazonCommodityDescription: result.data.amazonCommodityDescription,
    amazonDistanceMiles: result.data.amazonDistanceMiles,
    amazonBasePrice: result.data.amazonBasePrice,
    amazonFuelSurcharge: result.data.amazonFuelSurcharge,
    amazonTotalPrice: result.data.amazonTotalPrice,
    amazonCurrency: result.data.amazonCurrency,
    notes: result.data.notes,
    lines: result.data.lines.map((line) => ({
      skuCode: line.skuCode,
      skuDescription: line.skuDescription,
      lotRef: line.lotRef,
      quantity: line.quantity,
      notes: line.notes,
    })),
  }

  try {
    const order = await createFulfillmentOrder(input, userContext)
    return ApiResponses.success({ data: order })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
