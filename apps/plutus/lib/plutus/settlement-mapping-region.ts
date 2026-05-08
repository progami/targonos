export type SettlementMappingRegion = 'US' | 'UK';
export type SettlementMappingMarketplace = 'all' | SettlementMappingRegion;

export function settlementMappingRegionFromMarketplace(marketplace: SettlementMappingMarketplace): SettlementMappingRegion | null {
  switch (marketplace) {
    case 'US':
      return 'US';
    case 'UK':
      return 'UK';
    case 'all':
      return null;
  }
}

export function marketplaceFromSettlementMappingRegion(region: SettlementMappingRegion): SettlementMappingMarketplace {
  switch (region) {
    case 'US':
      return 'US';
    case 'UK':
      return 'UK';
  }
}
