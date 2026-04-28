import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AMAZON_OUTBOUND_SHIPMENT_STATUSES,
  buildOutboundShipmentsQuery,
  collectOutboundShipmentPages,
  extractOutboundShipmentsResponsePage,
  normalizeOutboundShipmentListRow,
  resolveOutboundShipmentsMarketplaceId,
} from '../../src/lib/amazon/outbound-shipments'

test('outbound shipment query requests every documented SP-API shipment status', () => {
  assert.deepEqual(AMAZON_OUTBOUND_SHIPMENT_STATUSES, [
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
  ])

  assert.deepEqual(buildOutboundShipmentsQuery('ATVPDKIKX0DER'), {
    QueryType: 'SHIPMENT',
    MarketplaceId: 'ATVPDKIKX0DER',
    ShipmentStatusList: AMAZON_OUTBOUND_SHIPMENT_STATUSES,
  })
})

test('outbound shipment pagination uses NEXT_TOKEN without carrying status filters', () => {
  assert.deepEqual(buildOutboundShipmentsQuery('ATVPDKIKX0DER', ' token-1 '), {
    QueryType: 'NEXT_TOKEN',
    MarketplaceId: 'ATVPDKIKX0DER',
    NextToken: 'token-1',
  })
})

test('resolveOutboundShipmentsMarketplaceId keeps local dev mock calls tenant-scoped', () => {
  assert.equal(resolveOutboundShipmentsMarketplaceId('US', null), 'ATVPDKIKX0DER')
  assert.equal(resolveOutboundShipmentsMarketplaceId('UK', null), 'A1F83G8C2ARO7P')
  assert.equal(
    resolveOutboundShipmentsMarketplaceId(undefined, ' custom-marketplace '),
    'custom-marketplace'
  )
})

test('extractOutboundShipmentsResponsePage requires the SP-API payload shape', () => {
  assert.deepEqual(
    extractOutboundShipmentsResponsePage({
      payload: {
        ShipmentData: [{ ShipmentId: 'FBA-1' }, { ShipmentId: 'FBA-2' }],
        NextToken: 'page-2',
      },
    }),
    {
      shipments: [{ ShipmentId: 'FBA-1' }, { ShipmentId: 'FBA-2' }],
      nextToken: 'page-2',
    }
  )

  assert.throws(() => extractOutboundShipmentsResponsePage({ shipments: [] }), /missing payload/)
})

test('extractOutboundShipmentsResponsePage accepts the amazon-sp-api unwrapped response shape', () => {
  assert.deepEqual(
    extractOutboundShipmentsResponsePage({
      ShipmentData: [{ ShipmentId: 'FBA-1' }],
      NextToken: 'page-2',
    }),
    {
      shipments: [{ ShipmentId: 'FBA-1' }],
      nextToken: 'page-2',
    }
  )
})

test('collectOutboundShipmentPages follows every page and rejects repeated tokens', async () => {
  const requestedTokens: Array<string | null> = []

  const shipments = await collectOutboundShipmentPages(async nextToken => {
    requestedTokens.push(nextToken)

    if (nextToken === null) {
      return {
        payload: {
          ShipmentData: [{ ShipmentId: 'FBA-1' }],
          NextToken: 'page-2',
        },
      }
    }

    return {
      payload: {
        ShipmentData: [{ ShipmentId: 'FBA-2' }],
      },
    }
  })

  assert.deepEqual(requestedTokens, [null, 'page-2'])
  assert.deepEqual(shipments, [{ ShipmentId: 'FBA-1' }, { ShipmentId: 'FBA-2' }])

  await assert.rejects(
    () =>
      collectOutboundShipmentPages(async () => ({
        payload: {
          ShipmentData: [],
          NextToken: 'same-token',
        },
      })),
    /repeated NextToken/
  )
})

test('normalizeOutboundShipmentListRow keeps the shipment table strict and display-ready', () => {
  assert.deepEqual(
    normalizeOutboundShipmentListRow({
      ShipmentId: ' FBA-1 ',
      ShipmentName: ' April inbound ',
      ShipmentStatus: ' READY_TO_SHIP ',
      DestinationFulfillmentCenterId: ' LGB8 ',
      LabelPrepType: ' SELLER_LABEL ',
      BoxContentsSource: ' FEED ',
      AreCasesRequired: true,
      ConfirmedNeedByDate: '2026-04-22T00:00:00Z',
    }),
    {
      shipmentId: 'FBA-1',
      shipmentName: 'April inbound',
      shipmentStatus: 'READY_TO_SHIP',
      destinationFulfillmentCenterId: 'LGB8',
      labelPrepType: 'SELLER_LABEL',
      boxContentsSource: 'FEED',
      areCasesRequired: true,
      confirmedNeedByDate: '2026-04-22T00:00:00Z',
    }
  )

  assert.throws(
    () => normalizeOutboundShipmentListRow({ ShipmentStatus: 'WORKING' }),
    /missing ShipmentId/
  )
})
