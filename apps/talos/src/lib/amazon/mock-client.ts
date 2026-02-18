// Mock Amazon client for testing without API credentials

export function getAmazonClient() {
 return {
 callAPI: async ({ operation }: { operation: string }) => {
 // console.log(`Mock Amazon API call: ${operation}`)
 return getMockData(operation)
 }
 }
}

function getMockData(operation: string) {
 switch (operation) {
 case 'getMarketplaceParticipations':
 return {
 payload: [
 {
 marketplaceId: 'ATVPDKIKX0DER',
 sellerId: 'MOCK_SELLER',
 },
 ],
 }
 case 'getInventorySummaries':
 return {
 inventorySummaries: [
 { sellerSku: 'SKU001', asin: 'B001TEST01', totalQuantity: 150, fnSku: 'X001TEST01' },
 { sellerSku: 'SKU002', asin: 'B001TEST02', totalQuantity: 200, fnSku: 'X001TEST02' },
 { sellerSku: 'SKU003', asin: 'B001TEST03', totalQuantity: 75, fnSku: 'X001TEST03' },
 { sellerSku: 'SKU004', asin: 'B001TEST04', totalQuantity: 300, fnSku: 'X001TEST04' },
 { sellerSku: 'SKU005', asin: 'B001TEST05', totalQuantity: 25, fnSku: 'X001TEST05' },
 { sellerSku: 'TEST-SKU-001', asin: 'B001TEST06', totalQuantity: 100, fnSku: 'X001TEST06' },
 { sellerSku: 'TEST-SKU-002', asin: 'B001TEST07', totalQuantity: 50, fnSku: 'X001TEST07' },
 { sellerSku: 'TEST-SKU-003', asin: 'B001TEST08', totalQuantity: 0, fnSku: 'X001TEST08' },
 ]
 }
 case 'searchListingsItems':
 return {
 items: [
 {
 sku: 'SKU001',
 summaries: [{ asin: 'B001TEST01', itemName: 'Sample Product 1' }],
 },
 {
 sku: 'SKU002',
 summaries: [{ asin: 'B001TEST02', itemName: 'Sample Product 2' }],
 },
 {
 sku: 'SKU003',
 summaries: [{ asin: 'B001TEST03', itemName: 'Sample Product 3' }],
 },
 ],
 pagination: { nextToken: null },
 }
 case 'getCatalogItem':
 return {
 asin: 'B001TEST01',
 attributes: {
 item_name: [{ value: 'Sample Product Description' }],
 item_dimensions: [
 {
 length: { value: 10, unit: 'inches' },
 width: { value: 8, unit: 'inches' },
 height: { value: 6, unit: 'inches' },
 },
 ],
 item_weight: [{ value: 2.5, unit: 'pounds' }],
 },
 summaries: [
 {
 itemName: 'Sample Product Description',
 itemClassification: 'BASE_PRODUCT',
 browseClassification: { displayName: 'Mock Category' },
 },
 ],
 }
 default:
 return {}
 }
}

export async function getInventory() {
 // console.log('Mock: Fetching Amazon inventory')
 return getMockData('getInventorySummaries')
}

export async function getInboundShipments(
  _tenantCode?: unknown,
  _options?: { nextToken?: string; includeCancelled?: boolean }
) {
 // console.log('Mock: Fetching inbound shipments')
 return { shipments: [] }
}

export async function getOrders(_createdAfter?: Date) {
 // console.log('Mock: Fetching orders')
 return { orders: [] }
}

export async function getCatalogItem(_asin: string) {
 // console.log(`Mock: Fetching catalog item for ${asin}`)
 return getMockData('getCatalogItem')
}

export async function getProductFees(_asin: string, _price: number) {
 // console.log(`Mock: Fetching product fees for ${asin}`)
 return { fees: [] }
}

export async function getMonthlyStorageFees(_startDate?: Date, _endDate?: Date) {
 // console.log('Mock: Fetching storage fees')
 return []
}

export async function getInventoryAgedData() {
 // console.log('Mock: Fetching aged inventory data')
 return getMockData('getInventorySummaries')
}
