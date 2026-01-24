export type WarehouseOption = {
  id: string
  code: string
  name: string
  kind?: string
}

export type SkuBatchOption = {
  id: string
  batchCode: string
  unitsPerCarton?: number | null
  availableCartons?: number
}

export type SkuOption = {
  id: string
  skuCode: string
  description: string
  unitsPerCarton?: number | null
  batches: SkuBatchOption[]
}

export type LineItem = {
  id: string
  skuCode: string
  skuDescription: string
  batchLot: string
  quantity: number
  notes: string
}

export type FormData = {
  warehouseCode: string
  destinationType: string
  destinationName: string
  destinationAddress: string
  shippingCarrier: string
  shippingMethod: string
  trackingNumber: string
  externalReference: string
  notes: string
}

export type AmazonShipmentState = {
  shipmentId: string
  shipmentName: string
  shipmentStatus: string
  destinationFulfillmentCenterId: string
  labelPrepType: string
  boxContentsSource: string
  shipFromAddress: Record<string, unknown> | null
  shipToAddress: Record<string, unknown> | null
  referenceId: string
  inboundPlanId: string
  inboundOrderId: string
}

export type AmazonFreightState = {
  shipmentReference: string
  shipperId: string
  pickupNumber: string
  pickupAppointmentId: string
  deliveryAppointmentId: string
  loadId: string
  freightBillNumber: string
  billOfLadingNumber: string
  pickupWindowStart: string
  pickupWindowEnd: string
  deliveryWindowStart: string
  deliveryWindowEnd: string
  pickupAddress: string
  pickupContactName: string
  pickupContactPhone: string
  deliveryAddress: string
  shipmentMode: string
  boxCount: string
  palletCount: string
  commodityDescription: string
  distanceMiles: string
  basePrice: string
  fuelSurcharge: string
  totalPrice: string
  currency: string
}

export type NormalizedInboundItem = {
  sku: string
  quantityExpected: number
  quantityReceived?: number
  quantityInCase?: number
}

export type AmazonInboundShipment = {
  ShipmentId?: string
  ShipmentName?: string
  ShipFromAddress?: Record<string, unknown>
  DestinationFulfillmentCenterId?: string
  ShipmentStatus?: string
  LabelPrepType?: string
  BoxContentsSource?: string
}

export type AmazonInboundShipmentItem = Record<string, unknown>

export type AmazonInboundShipmentNormalized = {
  shipmentId?: string
  shipmentName?: string
  shipmentStatus?: string
  destinationFulfillmentCenterId?: string
  labelPrepType?: string
  boxContentsSource?: string
  referenceId?: string
  shipFromAddress?: Record<string, unknown> | null
  shipToAddress?: Record<string, unknown> | null
  inboundPlanId?: string
  inboundOrderId?: string
}

export type AmazonInboundDetails = {
  shipmentId?: string
  shipment?: AmazonInboundShipment | null
  items?: AmazonInboundShipmentItem[]
  billOfLadingUrl?: string | null
  awdShipment?: Record<string, unknown> | null
  awdInboundOrder?: Record<string, unknown> | null
  inboundPlan?: Record<string, unknown> | null
  inboundPlanShipment?: Record<string, unknown> | null
  inboundPlanItems?: AmazonInboundShipmentItem[]
  inboundPlanPlacementOptions?: Record<string, unknown> | unknown[] | null
  inboundPlanTransportationOptions?: Record<string, unknown> | unknown[] | null
  normalized?: AmazonInboundShipmentNormalized
}

export const DESTINATION_TYPES = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'AMAZON_FBA', label: 'Amazon FBA' },
  { value: 'TRANSFER', label: 'Transfer' },
] as const
