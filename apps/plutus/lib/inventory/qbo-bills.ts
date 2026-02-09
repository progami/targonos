import type { QboAccount, QboBill } from '@/lib/qbo/api';
import { allocateByWeight, toCents } from '@/lib/inventory/money';

export type InventoryComponent = 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';

export type InventoryAccountMappings = {
  invManufacturing: string;
  invFreight: string;
  invDuty: string;
  invMfgAccessories: string;
};

export type BillEvent =
  | {
      kind: 'manufacturing';
      date: string;
      poNumber: string;
      sku: string;
      units: number;
      costCents: number;
    }
  | {
      kind: 'cost';
      date: string;
      poNumber: string;
      component: Exclude<InventoryComponent, 'manufacturing'>;
      costCents: number;
      sku?: string;
    }
  | {
      kind: 'brand_cost';
      date: string;
      poNumber: string;
      brandId: string;
      component: InventoryComponent;
      costCents: number;
    };

export type ParsedBills = {
  events: BillEvent[];
  poUnitsBySku: Map<string, Map<string, number>>;
};

function parsePoNumber(memo: string): string {
  const trimmed = memo.trim();
  if (!trimmed.startsWith('PO: ')) {
    throw new Error(`Bill memo must start with "PO: " (got "${memo}")`);
  }
  const po = trimmed.slice(4).trim();
  if (po === '') {
    throw new Error(`Bill memo PO number is empty (got "${memo}")`);
  }
  return po;
}

export function parseSkuQuantityFromDescription(description: string): { sku: string; quantity: number } {
  const normalized = description.trim().replace(/×/g, 'x').replace(/\s+/g, ' ');
  if (normalized === '') {
    throw new Error('Line description is empty');
  }

  const qtyMatch = normalized.match(/(\d+)\s*(units?)?$/i);
  if (!qtyMatch || qtyMatch.index === undefined) {
    throw new Error(`Unrecognized SKU+qty format: "${description}"`);
  }

  const qty = Number(qtyMatch[1]);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`Invalid quantity in description: "${description}"`);
  }

  const beforeQty = normalized.slice(0, qtyMatch.index).trim();
  const skuPart = beforeQty.endsWith('x') ? beforeQty.slice(0, -1).trim() : beforeQty;
  if (skuPart === '') {
    throw new Error(`Missing SKU in description: "${description}"`);
  }

  const sku = skuPart.replace(/\s+/g, '-').toUpperCase();
  return { sku, quantity: qty };
}

function classifyInventoryComponentFromAccount(account: QboAccount): InventoryComponent | null {
  if (account.AccountType !== 'Other Current Asset') return null;
  if (account.AccountSubType !== 'Inventory') return null;

  let name = account.Name.trim();
  if (name.startsWith('Inv ')) {
    name = name.slice('Inv '.length).trimStart();
  }

  if (name.startsWith('Manufacturing')) return 'manufacturing';
  if (name.startsWith('Freight')) return 'freight';
  if (name.startsWith('Duty')) return 'duty';
  if (name.startsWith('Mfg Accessories')) return 'mfgAccessories';
  return null;
}

function addPoUnits(poUnitsBySku: Map<string, Map<string, number>>, poNumber: string, sku: string, units: number) {
  const existing = poUnitsBySku.get(poNumber);
  if (!existing) {
    const skuMap = new Map<string, number>();
    skuMap.set(sku, units);
    poUnitsBySku.set(poNumber, skuMap);
    return;
  }

  const current = existing.get(sku);
  existing.set(sku, (current === undefined ? 0 : current) + units);
}

export function parseQboBillsToInventoryEvents(
  bills: QboBill[],
  accountsById: Map<string, QboAccount>,
  _mappings: InventoryAccountMappings,
): ParsedBills {
  const events: BillEvent[] = [];
  const poUnitsBySku = new Map<string, Map<string, number>>();

  for (const bill of bills) {
    const memo = bill.PrivateNote ? bill.PrivateNote : '';
    const date = bill.TxnDate;

    if (!bill.Line) continue;

    const candidateLines: Array<{
      line: NonNullable<QboBill['Line']>[number];
      component: InventoryComponent;
    }> = [];

    for (const line of bill.Line) {
      if (!line.AccountBasedExpenseLineDetail) continue;
      const accountId = line.AccountBasedExpenseLineDetail.AccountRef.value;
      const account = accountsById.get(accountId);
      if (!account) {
        throw new Error(`Unknown QBO account referenced on bill line: billId=${bill.Id} accountId=${accountId}`);
      }
      const component = classifyInventoryComponentFromAccount(account);
      if (!component) continue;
      candidateLines.push({ line, component });
    }

    if (candidateLines.length === 0) continue;

    const poNumber = parsePoNumber(memo);

    for (const { line, component } of candidateLines) {
      if (!line.AccountBasedExpenseLineDetail) continue;

      const rawAmount = line.Amount;
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
        throw new Error(`Invalid bill line amount for inventory: billId=${bill.Id}`);
      }
      const costCents = toCents(rawAmount);

      const description = line.Description ? line.Description : '';

      if (component === 'manufacturing') {
        const parsed = parseSkuQuantityFromDescription(description);
        addPoUnits(poUnitsBySku, poNumber, parsed.sku, parsed.quantity);
        events.push({
          kind: 'manufacturing',
          date,
          poNumber,
          sku: parsed.sku,
          units: parsed.quantity,
          costCents,
        });
        continue;
      }

      // Cost-only components (freight/duty/accessories)
      let sku: string | undefined = undefined;
      try {
        const parsed = parseSkuQuantityFromDescription(description);
        sku = parsed.sku;
      } catch {
        sku = undefined;
      }

      events.push({
        kind: 'cost',
        date,
        poNumber,
        component,
        costCents,
        sku,
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.kind !== b.kind) return a.kind === 'manufacturing' ? -1 : 1;
    return 0;
  });

  return { events, poUnitsBySku };
}

export type BillMappingWithLines = {
  qboBillId: string;
  poNumber: string;
  brandId: string;
  billDate: string;
  lines: Array<{
    qboLineId: string;
    component: string;
    amountCents: number;
  }>;
};

export function buildInventoryEventsFromMappings(
  mappings: BillMappingWithLines[],
): ParsedBills {
  const events: BillEvent[] = [];
  const poUnitsBySku = new Map<string, Map<string, number>>();

  for (const mapping of mappings) {
    for (const line of mapping.lines) {
      const component = line.component as InventoryComponent;

      events.push({
        kind: 'brand_cost',
        date: mapping.billDate,
        poNumber: mapping.poNumber,
        brandId: mapping.brandId,
        component,
        costCents: line.amountCents,
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return 0;
  });

  return { events, poUnitsBySku };
}

export function allocatePoCostAcrossSkus(
  totalCents: number,
  poNumber: string,
  poUnitsBySku: Map<string, Map<string, number>>,
): Record<string, number> {
  const skuUnits = poUnitsBySku.get(poNumber);
  if (!skuUnits) {
    throw new Error(`Missing manufacturing units for PO: ${poNumber}`);
  }

  const weights = Array.from(skuUnits.entries()).map(([sku, units]) => ({ key: sku, weight: units }));
  return allocateByWeight(totalCents, weights);
}
