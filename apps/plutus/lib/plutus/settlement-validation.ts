import type { QboAccount } from '@/lib/qbo/api';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import type { InventoryComponent } from '@/lib/inventory/ledger';
import { toCents } from '@/lib/inventory/money';
import { removeProportionalComponents } from '@/lib/inventory/money';
import { createHash } from 'crypto';
import type { ProcessingBlock, ProcessingReturn } from './settlement-types';

export function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function dateToIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeProcessingHash(rows: LmbAuditRow[]): string {
  const normalized = rows.map((row) => ({
    invoice: row.invoice.trim(),
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

export function groupByInvoice(rows: LmbAuditRow[]): Map<string, LmbAuditRow[]> {
  const invoiceGroups = new Map<string, LmbAuditRow[]>();
  for (const row of rows) {
    const group = invoiceGroups.get(row.invoice);
    if (!group) {
      invoiceGroups.set(row.invoice, [row]);
    } else {
      group.push(row);
    }
  }
  return invoiceGroups;
}

export function isSalePrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Sales - Principal');
}

export function isRefundPrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Refunds - Refunded Principal');
}

export function buildPrincipalGroups(
  rows: LmbAuditRow[],
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
): { id: string; name: string } {
  const account = accounts.find((a) => a.ParentRef?.value === parentAccountId && a.Name === subAccountName);
  if (!account) {
    throw new Error(`Missing brand sub-account in QBO: ${subAccountName}`);
  }
  return { id: account.Id, name: account.Name };
}

export function matchRefundsToSales(
  refundGroups: Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>,
  saleRecordByKey: Map<string, { orderId: string; sku: string; quantity: number; principalCents: number; costManufacturingCents: number; costFreightCents: number; costDutyCents: number; costMfgAccessoriesCents: number }>,
  returnedQtyByKey: Map<string, number>,
  blocks: ProcessingBlock[],
): ProcessingReturn[] {
  const matchedReturns: ProcessingReturn[] = [];

  for (const refund of refundGroups.values()) {
    const key = `${refund.orderId}::${refund.sku}`;
    const saleRecord = saleRecordByKey.get(key);
    if (!saleRecord) {
      blocks.push({
        code: 'REFUND_UNMATCHED',
        message: 'Refund cannot be matched to an original sale',
        details: { orderId: refund.orderId, sku: refund.sku },
      });
      continue;
    }

    const saleQty = saleRecord.quantity;
    const refundQty = Math.abs(refund.quantity);
    if (!Number.isInteger(refundQty) || refundQty <= 0) continue;

    const alreadyReturned = returnedQtyByKey.get(key);
    const returnedSoFar = alreadyReturned === undefined ? 0 : alreadyReturned;
    if (returnedSoFar + refundQty > saleQty) {
      blocks.push({
        code: 'REFUND_PARTIAL',
        message: 'Refund quantity exceeds remaining sale quantity',
        details: { orderId: refund.orderId, sku: refund.sku, saleQty, returnedSoFar, refundQty },
      });
      continue;
    }

    const expectedAbs = Math.round((Math.abs(saleRecord.principalCents) * refundQty) / saleQty);
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

    const saleCostTotals: Record<InventoryComponent, number> = {
      manufacturing: saleRecord.costManufacturingCents,
      freight: saleRecord.costFreightCents,
      duty: saleRecord.costDutyCents,
      mfgAccessories: saleRecord.costMfgAccessoriesCents,
    };
    const returnCost = removeProportionalComponents(saleCostTotals, refundQty, saleQty) as Record<InventoryComponent, number>;

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
