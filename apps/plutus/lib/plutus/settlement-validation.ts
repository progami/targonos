import type { QboAccount } from '@/lib/qbo/api';
import type { InventoryComponent } from '@/lib/inventory/ledger';
import { toCents } from '@/lib/inventory/money';
import { removeProportionalComponents } from '@/lib/inventory/money';
import { createHash } from 'crypto';
import type { ProcessingBlock, ProcessingReturn } from './settlement-types';
import type { SettlementAuditRow } from './settlement-audit';

export function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function dateToIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeProcessingHash(rows: SettlementAuditRow[]): string {
  const normalized = rows.map((row) => ({
    invoice: row.invoiceId.trim(),
    market: row.market.trim(),
    date: row.date.trim(),
    orderId: row.orderId.trim(),
    sku: normalizeSku(row.sku),
    quantity: row.quantity,
    description: row.description.trim(),
    net: row.net,
  }));

  normalized.sort((a, b) => {
    if (a.invoice !== b.invoice) return a.invoice.localeCompare(b.invoice);
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.orderId !== b.orderId) return a.orderId.localeCompare(b.orderId);
    if (a.sku !== b.sku) return a.sku.localeCompare(b.sku);
    if (a.description !== b.description) return a.description.localeCompare(b.description);
    if (a.quantity !== b.quantity) return a.quantity - b.quantity;
    return a.net - b.net;
  });

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function isSalePrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Sales - Principal');
}

export function isRefundPrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Refunds - Refunded Principal');
}

export function buildPrincipalGroups(
  rows: SettlementAuditRow[],
  predicate: (description: string) => boolean,
): Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }> {
  const groups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();

  for (const row of rows) {
    if (!predicate(row.description)) continue;
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;

    const sku = normalizeSku(skuRaw);
    const orderId = row.orderId.trim();
    const date = row.date;

    if (!Number.isFinite(row.quantity) || !Number.isInteger(row.quantity) || row.quantity === 0) {
      continue;
    }

    const cents = toCents(row.net);

    const key = `${orderId}::${sku}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { orderId, sku, date, quantity: row.quantity, principalCents: cents });
      continue;
    }

    existing.quantity += row.quantity;
    existing.principalCents += cents;
    if (date < existing.date) existing.date = date;
  }

  return groups;
}

export function buildPrincipalGroupsByDate(
  rows: SettlementAuditRow[],
  predicate: (description: string) => boolean,
): Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }> {
  const groups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();

  for (const row of rows) {
    if (!predicate(row.description)) continue;
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;

    const sku = normalizeSku(skuRaw);
    const orderId = row.orderId.trim();
    const date = row.date;

    if (!Number.isFinite(row.quantity) || !Number.isInteger(row.quantity) || row.quantity === 0) {
      continue;
    }

    const cents = toCents(row.net);
    const key = `${orderId}::${sku}::${date}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { orderId, sku, date, quantity: row.quantity, principalCents: cents });
      continue;
    }

    existing.quantity += row.quantity;
    existing.principalCents += cents;
  }

  return groups;
}

export type RefundSaleLayer = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
  principalCents: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type ExistingReturnLayer = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
};

type MutableRefundSaleLayer = RefundSaleLayer & {
  remainingQuantity: number;
};

function createEmptyCostByComponentCents(): Record<InventoryComponent, number> {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}

function buildMutableSaleLayersByKey(saleLayers: RefundSaleLayer[]): Map<string, MutableRefundSaleLayer[]> {
  const byKey = new Map<string, MutableRefundSaleLayer[]>();

  for (const saleLayer of saleLayers) {
    if (!Number.isInteger(saleLayer.quantity) || saleLayer.quantity <= 0) {
      continue;
    }

    const key = `${saleLayer.orderId}::${saleLayer.sku}`;
    const existing = byKey.get(key);
    const layer: MutableRefundSaleLayer = {
      ...saleLayer,
      remainingQuantity: saleLayer.quantity,
    };

    if (!existing) {
      byKey.set(key, [layer]);
      continue;
    }

    existing.push(layer);
  }

  for (const saleLayersForKey of byKey.values()) {
    saleLayersForKey.sort((left, right) => left.date.localeCompare(right.date));
  }

  return byKey;
}

function applyExistingReturnsToSaleLayers(
  saleLayersByKey: Map<string, MutableRefundSaleLayer[]>,
  existingReturns: ExistingReturnLayer[],
) {
  const sortedReturns = [...existingReturns].sort((left, right) => left.date.localeCompare(right.date));

  for (const existingReturn of sortedReturns) {
    if (!Number.isInteger(existingReturn.quantity) || existingReturn.quantity <= 0) {
      continue;
    }

    const key = `${existingReturn.orderId}::${existingReturn.sku}`;
    const saleLayers = saleLayersByKey.get(key);
    if (!saleLayers) {
      continue;
    }

    let remainingQuantity = existingReturn.quantity;
    for (const saleLayer of saleLayers) {
      if (saleLayer.remainingQuantity === 0 || saleLayer.date > existingReturn.date) {
        continue;
      }

      const matchedQuantity = Math.min(remainingQuantity, saleLayer.remainingQuantity);
      saleLayer.remainingQuantity -= matchedQuantity;
      remainingQuantity -= matchedQuantity;

      if (remainingQuantity === 0) {
        break;
      }
    }
  }
}

export function requireAccountMapping(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') {
    throw new Error('Missing setup config');
  }
  const value = (config as Record<string, unknown>)[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing account mapping: ${key}`);
  }
  return value;
}

export function findRequiredSubAccountId(
  accounts: QboAccount[],
  parentAccountId: string,
  subAccountName: string,
): { id: string; name: string; fullyQualifiedName?: string; acctNum?: string } {
  const account = accounts.find((a) => a.ParentRef?.value === parentAccountId && a.Name === subAccountName);
  if (!account) {
    throw new Error(`Missing brand sub-account in QBO: ${subAccountName}`);
  }
  return { id: account.Id, name: account.Name, fullyQualifiedName: account.FullyQualifiedName, acctNum: account.AcctNum };
}

export function matchRefundsToSales(
  refundGroups: Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>,
  saleLayers: RefundSaleLayer[],
  existingReturns: ExistingReturnLayer[],
  blocks: ProcessingBlock[],
  options?: { allowFutureSales?: boolean },
): ProcessingReturn[] {
  const allowFutureSales = options?.allowFutureSales === true;
  const matchedReturns: ProcessingReturn[] = [];
  const saleLayersByKey = buildMutableSaleLayersByKey(saleLayers);
  applyExistingReturnsToSaleLayers(saleLayersByKey, existingReturns);

  for (const refund of refundGroups.values()) {
    const key = `${refund.orderId}::${refund.sku}`;
    const saleLayersForKey = saleLayersByKey.get(key);
    if (!saleLayersForKey) {
      blocks.push({
        code: 'REFUND_UNMATCHED',
        message: 'Refund cannot be matched to an original sale',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const refundQty = Math.abs(refund.quantity);
    if (!Number.isInteger(refundQty) || refundQty <= 0) continue;

    const saleLayersBeforeRefund = saleLayersForKey.filter((saleLayer) => allowFutureSales || saleLayer.date <= refund.date);
    if (saleLayersBeforeRefund.length === 0) {
      blocks.push({
        code: 'REFUND_UNMATCHED',
        message: 'Refund cannot be matched to an original sale',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const eligibleSaleLayers = saleLayersBeforeRefund.filter((saleLayer) => saleLayer.remainingQuantity > 0);
    const saleQty = saleLayersBeforeRefund.reduce((sum, saleLayer) => sum + saleLayer.quantity, 0);
    const remainingQty = eligibleSaleLayers.reduce((sum, saleLayer) => sum + saleLayer.remainingQuantity, 0);
    const returnedSoFar = saleQty - remainingQty;
    if (refundQty > remainingQty) {
      blocks.push({
        code: 'REFUND_ADJUSTMENT',
        message: 'Refund exceeds remaining sale quantity; treated as a financial adjustment (no additional inventory return)',
        details: { orderId: refund.orderId, sku: refund.sku, saleQty, returnedSoFar, refundQty },
      });
      continue;
    }

    let remainingToMatch = refundQty;
    let expectedAbs = 0;
    const returnCost = createEmptyCostByComponentCents();
    const matchedSaleLayers: Array<{ saleLayer: MutableRefundSaleLayer; quantity: number }> = [];

    for (const saleLayer of eligibleSaleLayers) {
      if (remainingToMatch === 0) {
        break;
      }

      const matchedQuantity = Math.min(remainingToMatch, saleLayer.remainingQuantity);
      matchedSaleLayers.push({ saleLayer, quantity: matchedQuantity });
      remainingToMatch -= matchedQuantity;

      expectedAbs += Math.round((Math.abs(saleLayer.principalCents) * matchedQuantity) / saleLayer.quantity);
      const matchedCost = removeProportionalComponents(
        saleLayer.costByComponentCents,
        matchedQuantity,
        saleLayer.quantity,
      ) as Record<InventoryComponent, number>;
      for (const component of Object.keys(returnCost) as InventoryComponent[]) {
        returnCost[component] += matchedCost[component];
      }
    }

    const actualAbs = Math.abs(refund.principalCents);
    if (expectedAbs === 0) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Cannot validate refund: expected principal is 0',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const ratio = actualAbs / expectedAbs;
    if (ratio < 0.8 || ratio > 1.1) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Possible partial refund / promo adjustment (requires review)',
        details: { orderId: refund.orderId, sku: refund.sku, expectedAbs, actualAbs },
      });
      continue;
    }

    for (const matchedSaleLayer of matchedSaleLayers) {
      matchedSaleLayer.saleLayer.remainingQuantity -= matchedSaleLayer.quantity;
    }

    matchedReturns.push({
      orderId: refund.orderId,
      sku: refund.sku,
      date: refund.date,
      quantity: refundQty,
      principalCents: refund.principalCents,
      costByComponentCents: returnCost,
    });
  }

  return matchedReturns;
}

export function sumCentsByBrandComponent(costs: Array<{ sku: string; costByComponentCents: Record<InventoryComponent, number> }>, skuToBrand: Map<string, string>) {
  const byBrand: Record<string, Record<InventoryComponent, number>> = {};

  for (const item of costs) {
    const brand = skuToBrand.get(item.sku);
    if (!brand) {
      throw new Error(`SKU not mapped to brand: ${item.sku}`);
    }

    const current = byBrand[brand];
    if (!current) {
      byBrand[brand] = { manufacturing: 0, freight: 0, duty: 0, mfgAccessories: 0 };
    }

    for (const component of Object.keys(item.costByComponentCents) as InventoryComponent[]) {
      byBrand[brand]![component] += item.costByComponentCents[component];
    }
  }

  return byBrand;
}

export function sumCentsByBrandComponentSku(
  costs: Array<{ sku: string; costByComponentCents: Record<InventoryComponent, number> }>,
  skuToBrand: Map<string, string>,
): Record<string, Record<InventoryComponent, Record<string, number>>> {
  const byBrand: Record<string, Record<InventoryComponent, Record<string, number>>> = {};

  for (const item of costs) {
    const brand = skuToBrand.get(item.sku);
    if (!brand) {
      throw new Error(`SKU not mapped to brand: ${item.sku}`);
    }

    const current = byBrand[brand];
    if (!current) {
      byBrand[brand] = {
        manufacturing: {},
        freight: {},
        duty: {},
        mfgAccessories: {},
      };
    }

    for (const component of Object.keys(item.costByComponentCents) as InventoryComponent[]) {
      const brandComponent = byBrand[brand]![component];
      const existing = brandComponent[item.sku];
      brandComponent[item.sku] = (existing === undefined ? 0 : existing) + item.costByComponentCents[component];
    }
  }

  return byBrand;
}

export function mergeBrandComponentCents(
  left: Record<string, Record<InventoryComponent, number>>,
  right: Record<string, Record<InventoryComponent, number>>,
  op: 'add' | 'sub',
): Record<string, Record<InventoryComponent, number>> {
  const result: Record<string, Record<InventoryComponent, number>> = {};
  const brands = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const brand of brands) {
    result[brand] = { manufacturing: 0, freight: 0, duty: 0, mfgAccessories: 0 };
    for (const component of Object.keys(result[brand]) as InventoryComponent[]) {
      const leftBrand = left[brand];
      const rightBrand = right[brand];
      const a = leftBrand ? leftBrand[component] : 0;
      const b = rightBrand ? rightBrand[component] : 0;
      result[brand]![component] = op === 'add' ? a + b : a - b;
    }
  }

  return result;
}

export function mergeBrandComponentSkuCents(
  left: Record<string, Record<InventoryComponent, Record<string, number>>>,
  right: Record<string, Record<InventoryComponent, Record<string, number>>>,
  op: 'add' | 'sub',
): Record<string, Record<InventoryComponent, Record<string, number>>> {
  const result: Record<string, Record<InventoryComponent, Record<string, number>>> = {};
  const brands = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const brand of brands) {
    result[brand] = {
      manufacturing: {},
      freight: {},
      duty: {},
      mfgAccessories: {},
    };

    for (const component of Object.keys(result[brand]) as InventoryComponent[]) {
      const leftComponent = left[brand] ? left[brand]![component] : undefined;
      const rightComponent = right[brand] ? right[brand]![component] : undefined;

      const skus = new Set([
        ...(leftComponent ? Object.keys(leftComponent) : []),
        ...(rightComponent ? Object.keys(rightComponent) : []),
      ]);

      for (const sku of skus) {
        let a = 0;
        if (leftComponent) {
          const value = leftComponent[sku];
          a = value === undefined ? 0 : value;
        }
        let b = 0;
        if (rightComponent) {
          const value = rightComponent[sku];
          b = value === undefined ? 0 : value;
        }
        result[brand]![component][sku] = op === 'add' ? a + b : a - b;
      }
    }
  }

  return result;
}
