import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AMAZON_INBOUND_SHIPMENT_STATUSES,
  buildInboundShipmentsQuery,
  collectInboundShipmentPages,
  extractInboundShipmentsResponsePage,
  normalizeInboundShipmentListRow,
  resolveInboundShipmentsMarketplaceId,
} from '../../src/lib/amazon/inbound-shipments'

test('inbound shipment query requests every documented SP-API shipment status', () => {
  assert.deepEqual(AMAZON_INBOUND_SHIPMENT_STATUSES, [
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

  assert.deepEqual(buildInboundShipmentsQuery('ATVPDKIKX0DER'), {
    QueryType: 'SHIPMENT',
    MarketplaceId: 'ATVPDKIKX0DER',
    ShipmentStatusList: AMAZON_INBOUND_SHIPMENT_STATUSES,
  })
})

test('inbound shipment pagination uses NEXT_TOKEN without carrying status filters', () => {
  assert.deepEqual(buildInboundShipmentsQuery('ATVPDKIKX0DER', ' token-1 '), {
    QueryType: 'NEXT_TOKEN',
    MarketplaceId: 'ATVPDKIKX0DER',
    NextToken: 'token-1',
  })
})

test('resolveInboundShipmentsMarketplaceId keeps local dev mock calls tenant-scoped', () => {
  assert.equal(resolveInboundShipmentsMarketplaceId('US', null), 'ATVPDKIKX0DER')
  assert.equal(resolveInboundShipmentsMarketplaceId('UK', null), 'A1F83G8C2ARO7P')
  assert.equal(
    resolveInboundShipmentsMarketplaceId(undefined, ' custom-marketplace '),
    'custom-marketplace'
  )
})

test('extractInboundShipmentsResponsePage requires the SP-API payload shape', () => {
  assert.deepEqual(
    extractInboundShipmentsResponsePage({
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

  assert.throws(() => extractInboundShipmentsResponsePage({ shipments: [] }), /missing payload/)
})

test('extractInboundShipmentsResponsePage accepts the amazon-sp-api unwrapped response shape', () => {
  assert.deepEqual(
    extractInboundShipmentsResponsePage({
      ShipmentData: [{ ShipmentId: 'FBA-1' }],
      NextToken: 'page-2',
    }),
    {
      shipments: [{ ShipmentId: 'FBA-1' }],
      nextToken: 'page-2',
    }
  )
})

test('collectInboundShipmentPages follows every page and rejects repeated tokens', async () => {
  const requestedTokens: Array<string | null> = []

  const shipments = await collectInboundShipmentPages(async nextToken => {
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
      collectInboundShipmentPages(async () => ({
        payload: {
          ShipmentData: [],
          NextToken: 'same-token',
        },
      })),
    /repeated NextToken/
  )
})

test('normalizeInboundShipmentListRow keeps the shipment table strict and display-ready', () => {
  assert.deepEqual(
    normalizeInboundShipmentListRow({
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
    () => normalizeInboundShipmentListRow({ ShipmentStatus: 'WORKING' }),
    /missing ShipmentId/
  )
})
