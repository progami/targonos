import { normalizeAliasLookupValue } from './sku-alias';

export type LegacyBrandRow = {
  id: string;
  name: string;
  marketplace: string;
  currency: string;
};

export type LegacySkuRow = {
  id: string;
  sku: string;
  asin: string | null;
  productName: string | null;
  brandId: string;
};

export type LegacyBillMappingRow = {
  id: string;
  qboBillId: string;
  poNumber: string;
  brandId: string;
  billDate: string;
  vendorName: string;
  totalAmount: number;
};

export type LegacyBillLineMappingRow = {
  id: string;
  billMappingId: string;
  qboLineId: string;
  component: string;
  amountCents: number;
  sku: string | null;
  quantity: number | null;
};

export type LegacySubledgerBackfillPlan = {
  productGroups: Array<{ code: string; name: string }>;
  canonicalProducts: Array<{ key: string; name: string; productGroupCode: string }>;
  skuAliases: Array<{
    canonicalProductKey: string;
    marketplace: string;
    aliasType: 'SKU' | 'ASIN';
    value: string;
    normalizedAliasType: string;
    normalizedValue: string;
  }>;
  purchaseOrders: Array<{
    internalRef: string;
    sourceType: 'LEGACY_PO' | 'LEGACY_BILL';
    sourceId: string;
    marketplace: string;
    supplierRef: string | null;
  }>;
  costLayers: Array<{
    purchaseOrderSourceType: 'LEGACY_PO' | 'LEGACY_BILL';
    purchaseOrderSourceId: string;
    canonicalProductKey: string | null;
    component: string;
    quantity: number | null;
    amountCents: number;
    currency: string;
    sourceQboTxnType: 'Bill';
    sourceQboTxnId: string;
    sourceQboLineId: string;
  }>;
};

export type LegacySubledgerBackfillInput = {
  brands: LegacyBrandRow[];
  skus: LegacySkuRow[];
  billMappings: LegacyBillMappingRow[];
  billLineMappings: LegacyBillLineMappingRow[];
};

type PurchaseOrderSource = {
  internalRef: string;
  sourceType: 'LEGACY_PO' | 'LEGACY_BILL';
  sourceId: string;
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareText(left, right);
}

function sortBrands(brands: LegacyBrandRow[]): LegacyBrandRow[] {
  return [...brands].sort((left, right) => {
    const marketplaceComparison = compareText(left.marketplace, right.marketplace);
    if (marketplaceComparison !== 0) return marketplaceComparison;
    const nameComparison = compareText(left.name, right.name);
    if (nameComparison !== 0) return nameComparison;
    return compareText(left.id, right.id);
  });
}

function sortSkus(skus: LegacySkuRow[]): LegacySkuRow[] {
  return [...skus].sort((left, right) => {
    const brandComparison = compareText(left.brandId, right.brandId);
    if (brandComparison !== 0) return brandComparison;
    const skuComparison = compareText(left.sku, right.sku);
    if (skuComparison !== 0) return skuComparison;
    const asinComparison = compareNullableText(left.asin, right.asin);
    if (asinComparison !== 0) return asinComparison;
    return compareText(left.id, right.id);
  });
}

function sortBillMappings(mappings: LegacyBillMappingRow[]): LegacyBillMappingRow[] {
  return [...mappings].sort((left, right) => {
    const dateComparison = compareText(left.billDate, right.billDate);
    if (dateComparison !== 0) return dateComparison;
    const billComparison = compareText(left.qboBillId, right.qboBillId);
    if (billComparison !== 0) return billComparison;
    return compareText(left.id, right.id);
  });
}

function sortBillLines(lines: LegacyBillLineMappingRow[]): LegacyBillLineMappingRow[] {
  return [...lines].sort((left, right) => {
    const mappingComparison = compareText(left.billMappingId, right.billMappingId);
    if (mappingComparison !== 0) return mappingComparison;
    const qboLineComparison = compareText(left.qboLineId, right.qboLineId);
    if (qboLineComparison !== 0) return qboLineComparison;
    return compareText(left.id, right.id);
  });
}

function buildPurchaseOrderSource(
  mapping: LegacyBillMappingRow,
  marketplace: string,
): PurchaseOrderSource {
  const poNumber = mapping.poNumber.trim();
  if (poNumber !== '') {
    return {
      internalRef: poNumber,
      sourceType: 'LEGACY_PO',
      sourceId: `${marketplace}:${poNumber}`,
    };
  }

  return {
    internalRef: `UNASSIGNED-BILL-${mapping.qboBillId}`,
    sourceType: 'LEGACY_BILL',
    sourceId: mapping.qboBillId,
  };
}

function productNameForSku(sku: LegacySkuRow, key: string): string {
  if (sku.productName !== null) {
    const productName = sku.productName.trim();
    if (productName !== '') return productName;
  }

  const skuValue = sku.sku.trim();
  if (skuValue !== '') return skuValue;
  return key;
}

export function normalizeAliasValue(value: string): string {
  return normalizeAliasLookupValue(value);
}

export function mapLegacyBrandNameToProductGroupCode(name: string): string {
  const trimmedName = name.trim();
  const parts = trimmedName
    .split('-')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length > 1) return parts[parts.length - 1].toUpperCase();
  return trimmedName.toUpperCase();
}

export function planLegacySubledgerBackfill(
  input: LegacySubledgerBackfillInput,
): LegacySubledgerBackfillPlan {
  const brandsById = new Map<string, LegacyBrandRow>();
  const productGroupsByCode = new Map<string, { code: string; name: string }>();
  const canonicalProductsByKey = new Map<
    string,
    { key: string; name: string; productGroupCode: string }
  >();
  const skuAliasesByKey = new Map<
    string,
    {
      canonicalProductKey: string;
      marketplace: string;
      aliasType: 'SKU' | 'ASIN';
      value: string;
      normalizedAliasType: string;
      normalizedValue: string;
    }
  >();
  const canonicalProductKeyByMarketplaceSku = new Map<string, string>();
  const billMappingsById = new Map<string, LegacyBillMappingRow>();
  const billMappingBrandsById = new Map<string, LegacyBrandRow>();
  const purchaseOrderSourceByBillMappingId = new Map<string, PurchaseOrderSource>();

  for (const brand of sortBrands(input.brands)) {
    brandsById.set(brand.id, brand);
    const productGroupCode = mapLegacyBrandNameToProductGroupCode(brand.name);
    if (!productGroupsByCode.has(productGroupCode)) {
      productGroupsByCode.set(productGroupCode, { code: productGroupCode, name: productGroupCode });
    }
  }

  for (const sku of sortSkus(input.skus)) {
    const brand = brandsById.get(sku.brandId);
    if (brand === undefined) throw new Error(`Missing brand for SKU ${sku.id}`);

    const marketplace = brand.marketplace.trim();
    const productGroupCode = mapLegacyBrandNameToProductGroupCode(brand.name);
    const normalizedSku = normalizeAliasLookupValue(sku.sku);
    const normalizedAsin = sku.asin === null ? '' : normalizeAliasLookupValue(sku.asin);
    const canonicalProductKey =
      normalizedAsin !== '' ? `ASIN:${normalizedAsin}` : `SKU:${marketplace}:${normalizedSku}`;

    if (!canonicalProductsByKey.has(canonicalProductKey)) {
      canonicalProductsByKey.set(canonicalProductKey, {
        key: canonicalProductKey,
        name: productNameForSku(sku, canonicalProductKey),
        productGroupCode,
      });
    }

    if (normalizedSku !== '') {
      canonicalProductKeyByMarketplaceSku.set(
        `${marketplace}:${normalizedSku}`,
        canonicalProductKey,
      );
      const aliasKey = `${marketplace}:SKU:${normalizedSku}`;
      if (!skuAliasesByKey.has(aliasKey)) {
        skuAliasesByKey.set(aliasKey, {
          canonicalProductKey,
          marketplace,
          aliasType: 'SKU',
          value: sku.sku.trim(),
          normalizedAliasType: 'SKU',
          normalizedValue: normalizedSku,
        });
      }
    }

    if (normalizedAsin !== '') {
      const aliasKey = `${marketplace}:ASIN:${normalizedAsin}`;
      if (!skuAliasesByKey.has(aliasKey)) {
        skuAliasesByKey.set(aliasKey, {
          canonicalProductKey,
          marketplace,
          aliasType: 'ASIN',
          value: normalizedAsin,
          normalizedAliasType: 'ASIN',
          normalizedValue: normalizedAsin,
        });
      }
    }
  }

  const purchaseOrdersByKey = new Map<
    string,
    LegacySubledgerBackfillPlan['purchaseOrders'][number]
  >();

  for (const mapping of sortBillMappings(input.billMappings)) {
    const brand = brandsById.get(mapping.brandId);
    if (brand === undefined) throw new Error(`Missing brand for bill mapping ${mapping.id}`);

    billMappingsById.set(mapping.id, mapping);
    billMappingBrandsById.set(mapping.id, brand);

    const marketplace = brand.marketplace.trim();
    const purchaseOrderSource = buildPurchaseOrderSource(mapping, marketplace);
    purchaseOrderSourceByBillMappingId.set(mapping.id, purchaseOrderSource);

    const purchaseOrderKey = `${purchaseOrderSource.sourceType}:${purchaseOrderSource.sourceId}`;
    if (!purchaseOrdersByKey.has(purchaseOrderKey)) {
      purchaseOrdersByKey.set(purchaseOrderKey, {
        internalRef: purchaseOrderSource.internalRef,
        sourceType: purchaseOrderSource.sourceType,
        sourceId: purchaseOrderSource.sourceId,
        marketplace,
        supplierRef: null,
      });
    }
  }

  const costLayers: LegacySubledgerBackfillPlan['costLayers'] = [];

  for (const line of sortBillLines(input.billLineMappings)) {
    const mapping = billMappingsById.get(line.billMappingId);
    if (mapping === undefined) throw new Error(`Missing bill mapping for line ${line.id}`);

    const brand = billMappingBrandsById.get(line.billMappingId);
    if (brand === undefined) throw new Error(`Missing brand for bill mapping ${mapping.id}`);

    const purchaseOrderSource = purchaseOrderSourceByBillMappingId.get(line.billMappingId);
    if (purchaseOrderSource === undefined)
      throw new Error(`Missing bill mapping for line ${line.id}`);

    let canonicalProductKey: string | null = null;
    if (line.sku !== null) {
      const normalizedLineSku = normalizeAliasLookupValue(line.sku);
      if (normalizedLineSku !== '') {
        const resolvedKey = canonicalProductKeyByMarketplaceSku.get(
          `${brand.marketplace.trim()}:${normalizedLineSku}`,
        );
        if (resolvedKey !== undefined) canonicalProductKey = resolvedKey;
      }
    }

    costLayers.push({
      purchaseOrderSourceType: purchaseOrderSource.sourceType,
      purchaseOrderSourceId: purchaseOrderSource.sourceId,
      canonicalProductKey,
      component: line.component,
      quantity: line.quantity,
      amountCents: line.amountCents,
      currency: brand.currency,
      sourceQboTxnType: 'Bill',
      sourceQboTxnId: mapping.qboBillId,
      sourceQboLineId: line.qboLineId,
    });
  }

  return {
    productGroups: Array.from(productGroupsByCode.values()).sort((left, right) =>
      compareText(left.code, right.code),
    ),
    canonicalProducts: Array.from(canonicalProductsByKey.values()).sort((left, right) =>
      compareText(left.key, right.key),
    ),
    skuAliases: Array.from(skuAliasesByKey.values()).sort((left, right) => {
      const marketplaceComparison = compareText(left.marketplace, right.marketplace);
      if (marketplaceComparison !== 0) return marketplaceComparison;
      const typeComparison = compareText(left.aliasType, right.aliasType);
      if (typeComparison !== 0) return typeComparison;
      const valueComparison = compareText(left.normalizedValue, right.normalizedValue);
      if (valueComparison !== 0) return valueComparison;
      return compareText(left.canonicalProductKey, right.canonicalProductKey);
    }),
    purchaseOrders: Array.from(purchaseOrdersByKey.values()).sort((left, right) => {
      const sourceTypeComparison = compareText(left.sourceType, right.sourceType);
      if (sourceTypeComparison !== 0) return sourceTypeComparison;
      return compareText(left.sourceId, right.sourceId);
    }),
    costLayers: costLayers.sort((left, right) => {
      const qboTxnComparison = compareText(left.sourceQboTxnId, right.sourceQboTxnId);
      if (qboTxnComparison !== 0) return qboTxnComparison;
      const qboLineComparison = compareText(left.sourceQboLineId, right.sourceQboLineId);
      if (qboLineComparison !== 0) return qboLineComparison;
      return compareText(left.component, right.component);
    }),
  };
}
