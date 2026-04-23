export const AMAZON_INBOUND_SHIPMENT_STATUSES = [
  'WORKING',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVING',
  'DELIVERED',
  'CHECKED_IN',
  'CLOSED',
  'CANCELLED',
  'DELETED',
  'ERROR',
] as const

export type AmazonInboundShipmentStatus = (typeof AMAZON_INBOUND_SHIPMENT_STATUSES)[number]

export type AmazonInboundShipmentsQuery =
  | {
      QueryType: 'SHIPMENT'
      MarketplaceId: string
      ShipmentStatusList: readonly AmazonInboundShipmentStatus[]
    }
  | {
      QueryType: 'NEXT_TOKEN'
      MarketplaceId: string
      NextToken: string
    }

export function resolveInboundShipmentsMarketplaceId(
  tenantCode: 'US' | 'UK' | undefined,
  configuredMarketplaceId: string | null | undefined
): string {
  if (typeof configuredMarketplaceId === 'string') {
    const trimmed = configuredMarketplaceId.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  if (tenantCode === 'UK') {
    return 'A1F83G8C2ARO7P'
  }

  return 'ATVPDKIKX0DER'
}

export function buildInboundShipmentsQuery(
  marketplaceId: string,
  nextToken?: string
): AmazonInboundShipmentsQuery {
  const trimmedToken = typeof nextToken === 'string' ? nextToken.trim() : ''

  if (trimmedToken.length > 0) {
    return {
      QueryType: 'NEXT_TOKEN',
      MarketplaceId: marketplaceId,
      NextToken: trimmedToken,
    }
  }

  return {
    QueryType: 'SHIPMENT',
    MarketplaceId: marketplaceId,
    ShipmentStatusList: AMAZON_INBOUND_SHIPMENT_STATUSES,
  }
}

type InboundShipmentPage = {
  shipments: unknown[]
  nextToken: string | null
}

export type AmazonInboundShipmentListRow = {
  shipmentId: string
  shipmentName: string
  shipmentStatus: AmazonInboundShipmentStatus
  destinationFulfillmentCenterId: string
  labelPrepType: string
  boxContentsSource: string
  areCasesRequired: boolean | null
  confirmedNeedByDate: string
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value) {
    throw new Error(`SP-API getShipments response missing ${label}`)
  }

  if (typeof value !== 'object') {
    throw new Error(`SP-API getShipments response missing ${label}`)
  }

  if (Array.isArray(value)) {
    throw new Error(`SP-API getShipments response missing ${label}`)
  }

  return value as Record<string, unknown>
}

function getRequiredStringField(record: Record<string, unknown>, fieldName: string): string {
  const value = record[fieldName]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  throw new Error(`Amazon shipment row missing ${fieldName}`)
}

function getOptionalStringField(record: Record<string, unknown>, fieldName: string): string {
  const value = record[fieldName]
  if (value === undefined) {
    return ''
  }

  if (value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    throw new Error(`Amazon shipment row has a non-string ${fieldName}`)
  }

  return value.trim()
}

function getOptionalBooleanField(
  record: Record<string, unknown>,
  fieldName: string
): boolean | null {
  const value = record[fieldName]
  if (value === undefined) {
    return null
  }

  if (value === null) {
    return null
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Amazon shipment row has a non-boolean ${fieldName}`)
  }

  return value
}

function getRequiredShipmentStatus(record: Record<string, unknown>): AmazonInboundShipmentStatus {
  const status = getRequiredStringField(record, 'ShipmentStatus')
  const knownStatus = AMAZON_INBOUND_SHIPMENT_STATUSES.find(value => value === status)
  if (!knownStatus) {
    throw new Error(`Amazon shipment row has unknown ShipmentStatus ${status}`)
  }

  return knownStatus
}

export function normalizeInboundShipmentListRow(value: unknown): AmazonInboundShipmentListRow {
  const record = expectRecord(value, 'shipment row')

  return {
    shipmentId: getRequiredStringField(record, 'ShipmentId'),
    shipmentName: getOptionalStringField(record, 'ShipmentName'),
    shipmentStatus: getRequiredShipmentStatus(record),
    destinationFulfillmentCenterId: getOptionalStringField(
      record,
      'DestinationFulfillmentCenterId'
    ),
    labelPrepType: getOptionalStringField(record, 'LabelPrepType'),
    boxContentsSource: getOptionalStringField(record, 'BoxContentsSource'),
    areCasesRequired: getOptionalBooleanField(record, 'AreCasesRequired'),
    confirmedNeedByDate: getOptionalStringField(record, 'ConfirmedNeedByDate'),
  }
}

export function extractInboundShipmentsResponsePage(response: unknown): InboundShipmentPage {
  const root = expectRecord(response, 'root object')
  const payload = root.payload === undefined ? root : expectRecord(root.payload, 'payload')

  if (!Array.isArray(payload.ShipmentData)) {
    throw new Error('SP-API getShipments response missing payload.ShipmentData')
  }

  const tokenValue = payload.NextToken
  if (tokenValue === undefined) {
    return { shipments: payload.ShipmentData, nextToken: null }
  }

  if (tokenValue === null) {
    return { shipments: payload.ShipmentData, nextToken: null }
  }

  if (typeof tokenValue !== 'string') {
    throw new Error('SP-API getShipments response has a non-string payload.NextToken')
  }

  const trimmedToken = tokenValue.trim()
  if (trimmedToken.length === 0) {
    return { shipments: payload.ShipmentData, nextToken: null }
  }

  return { shipments: payload.ShipmentData, nextToken: trimmedToken }
}

export async function collectInboundShipmentPages(
  loadPage: (nextToken: string | null) => Promise<unknown>
): Promise<unknown[]> {
  const shipments: unknown[] = []
  const seenTokens = new Set<string>()
  let nextToken: string | null = null

  while (true) {
    const response = await loadPage(nextToken)
    const page = extractInboundShipmentsResponsePage(response)
    shipments.push(...page.shipments)

    if (page.nextToken === null) {
      return shipments
    }

    if (seenTokens.has(page.nextToken)) {
      throw new Error(`SP-API getShipments returned repeated NextToken ${page.nextToken}`)
    }

    seenTokens.add(page.nextToken)
    nextToken = page.nextToken
  }
}
