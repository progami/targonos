export type TalosRegion = 'US' | 'UK'

export const AMAZON_WAREHOUSE_CODES = ['AMZN', 'AMZN-US', 'AMZN-UK'] as const

const AMAZON_WAREHOUSE_BY_REGION: Record<TalosRegion, { code: string; name: string }> = {
  US: {
    code: 'AMZN-US',
    name: 'Amazon FBA US',
  },
  UK: {
    code: 'AMZN-UK',
    name: 'Amazon FBA UK',
  },
}

const AMAZON_WAREHOUSE_REGION_BY_CODE = new Map<string, TalosRegion>([
  ['AMZN', 'US'],
  ['AMZN-US', 'US'],
  ['AMZN-UK', 'UK'],
])

export function getAmazonWarehouseCodeForRegion(region: TalosRegion): string {
  return AMAZON_WAREHOUSE_BY_REGION[region].code
}

export function getAmazonWarehouseNameForRegion(region: TalosRegion): string {
  return AMAZON_WAREHOUSE_BY_REGION[region].name
}

export function isAmazonWarehouseCode(code: string): boolean {
  return AMAZON_WAREHOUSE_REGION_BY_CODE.has(code)
}

export function canRegionUseWarehouseCode(region: TalosRegion, code: string): boolean {
  const warehouseRegion = AMAZON_WAREHOUSE_REGION_BY_CODE.get(code)

  if (warehouseRegion === undefined) {
    return true
  }

  return warehouseRegion === region
}
