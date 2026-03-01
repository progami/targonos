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

const poCustomFieldNamePattern = /\b(?:po|p\/o|purchase\s*order)\b/i;
const poMemoPatterns = [
  /^P(?:\s*\/\s*)?O\s*(?:#|:|-)\s*(.+)$/i,
  /^P(?:\s*\/\s*)?O\s+(.+)$/i,
];
const directPoCodePattern = /^P(?:\s*\/\s*)?O-[A-Za-z0-9].*$/i;

function extractPoNumberFromCustomFields(customFields: QboBill['CustomField']): string {
  if (!customFields || customFields.length === 0) return '';

  for (const field of customFields) {
    if (!field) continue;

    const stringValueRaw = field.StringValue;
    if (typeof stringValueRaw !== 'string') continue;

    const stringValue = stringValueRaw.trim();
    if (stringValue === '') continue;

    const nameRaw = field.Name;
    if (typeof nameRaw !== 'string') continue;

    const name = nameRaw.trim();
    if (name === '') continue;
    if (!poCustomFieldNamePattern.test(name)) continue;

    return stringValue;
  }

  return '';
}

function extractPoNumberFromPrivateNote(privateNote: string | undefined): string {
  if (privateNote === undefined) return '';

  const lines = privateNote
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  for (const line of lines) {
    if (directPoCodePattern.test(line)) {
      return line;
    }

    for (const pattern of poMemoPatterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const po = match[1];
      if (!po) continue;
      const trimmed = po.trim();
      if (trimmed === '') continue;
      return trimmed;
    }
  }

  return '';
}

function extractPoNumberFromBill(bill: Pick<QboBill, 'PrivateNote' | 'CustomField'>): string {
  const customFieldPo = extractPoNumberFromCustomFields(bill.CustomField);
  if (customFieldPo !== '') return customFieldPo;
  return extractPoNumberFromPrivateNote(bill.PrivateNote);
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

function inferInventoryAccountMarketplace(account: QboAccount): 'amazon.com' | 'amazon.co.uk' | null {
  const values = [
    account.Name.trim().toLowerCase(),
    (account.FullyQualifiedName ? account.FullyQualifiedName : account.Name).trim().toLowerCase(),
  ];

  let detectedMarketplace: 'amazon.com' | 'amazon.co.uk' | null = null;

  for (const value of values) {
    const tokens = value.split(/[^a-z0-9.]+/).filter((token) => token !== '');
    const hasUk = value.includes('amazon.co.uk') || tokens.includes('uk');
    const hasUs = value.includes('amazon.com') || tokens.includes('us') || tokens.includes('usa');

    if (hasUk && hasUs) {
      throw new Error(`Inventory account has ambiguous marketplace marker: accountId=${account.Id} name="${account.Name}"`);
    }

    const inferred = hasUk ? 'amazon.co.uk' : hasUs ? 'amazon.com' : null;
    if (inferred === null) continue;

    if (detectedMarketplace === null) {
      detectedMarketplace = inferred;
      continue;
    }

    if (detectedMarketplace !== inferred) {
      throw new Error(
        `Inventory account marketplace markers conflict across name/fqn: accountId=${account.Id} name="${account.Name}"`,
      );
    }
  }

  return detectedMarketplace;
}

function isInventoryAccountAllowedForMarketplace(account: QboAccount, marketplace: string): boolean {
  if (marketplace !== 'amazon.com' && marketplace !== 'amazon.co.uk') {
    throw new Error(`Unsupported marketplace: ${marketplace}`);
  }

  const accountMarketplace = inferInventoryAccountMarketplace(account);
  if (accountMarketplace === null) {
    throw new Error(`Inventory account is missing marketplace marker: accountId=${account.Id} name="${account.Name}"`);
  }

  return accountMarketplace === marketplace;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b);
}

function compareBillEvents(a: BillEvent, b: BillEvent): number {
  if (a.date !== b.date) return compareText(a.date, b.date);
  if (a.poNumber !== b.poNumber) return compareText(a.poNumber, b.poNumber);

  if (a.kind !== b.kind) {
    if (a.kind === 'manufacturing') return -1;
    if (b.kind === 'manufacturing') return 1;
    if (a.kind === 'cost') return -1;
    if (b.kind === 'cost') return 1;
  }

  if (a.kind === 'manufacturing' && b.kind === 'manufacturing') {
    if (a.sku !== b.sku) return compareText(a.sku, b.sku);
    if (a.units !== b.units) return a.units - b.units;
    return a.costCents - b.costCents;
  }

  if (a.kind === 'cost' && b.kind === 'cost') {
    if (a.component !== b.component) return compareText(a.component, b.component);
    const aSku = a.sku === undefined ? '' : a.sku;
    const bSku = b.sku === undefined ? '' : b.sku;
    if (aSku !== bSku) return compareText(aSku, bSku);
    return a.costCents - b.costCents;
  }

  if (a.kind === 'brand_cost' && b.kind === 'brand_cost') {
    if (a.brandId !== b.brandId) return compareText(a.brandId, b.brandId);
    if (a.component !== b.component) return compareText(a.component, b.component);
    return a.costCents - b.costCents;
  }

  return 0;
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
  marketplace: string,
): ParsedBills {
  const events: BillEvent[] = [];
  const poUnitsBySku = new Map<string, Map<string, number>>();

  const sortedBills = [...bills].sort((a, b) => {
    if (a.TxnDate !== b.TxnDate) return compareText(a.TxnDate, b.TxnDate);
    return compareText(a.Id, b.Id);
  });

  for (const bill of sortedBills) {
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
      if (!isInventoryAccountAllowedForMarketplace(account, marketplace)) continue;
      candidateLines.push({ line, component });
    }

    if (candidateLines.length === 0) continue;

    const poNumber = extractPoNumberFromBill(bill);
    if (poNumber === '') continue;

    candidateLines.sort((a, b) => {
      const aLineId = a.line.Id ? a.line.Id : '';
      const bLineId = b.line.Id ? b.line.Id : '';
      if (aLineId !== bLineId) return compareText(aLineId, bLineId);
      if (a.component !== b.component) return compareText(a.component, b.component);
      return a.line.Amount - b.line.Amount;
    });

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

  events.sort(compareBillEvents);

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
    sku: string | null;
    quantity: number | null;
  }>;
};

export function buildInventoryEventsFromMappings(
  mappings: BillMappingWithLines[],
): ParsedBills {
  const events: BillEvent[] = [];
  const poUnitsBySku = new Map<string, Map<string, number>>();

  const sortedMappings = [...mappings].sort((a, b) => {
    if (a.billDate !== b.billDate) return compareText(a.billDate, b.billDate);
    if (a.poNumber !== b.poNumber) return compareText(a.poNumber, b.poNumber);
    return compareText(a.qboBillId, b.qboBillId);
  });

  for (const mapping of sortedMappings) {
    const sortedLines = [...mapping.lines].sort((a, b) => {
      if (a.qboLineId !== b.qboLineId) return compareText(a.qboLineId, b.qboLineId);
      if (a.component !== b.component) return compareText(a.component, b.component);
      return a.amountCents - b.amountCents;
    });

    for (const line of sortedLines) {
      const knownNonInventoryComponent =
        line.component === 'warehousing3pl' ||
        line.component === 'warehouseAmazonFc' ||
        line.component === 'warehousingAmazonFc' ||
        line.component === 'warehouseAwd' ||
        line.component === 'warehousingAwd' ||
        line.component === 'productExpenses';

      if (
        line.component !== 'manufacturing' &&
        line.component !== 'freight' &&
        line.component !== 'duty' &&
        line.component !== 'mfgAccessories'
      ) {
        if (knownNonInventoryComponent) {
          continue;
        }
        throw new Error(
          `Unsupported bill mapping component: billId=${mapping.qboBillId} lineId=${line.qboLineId} component=${line.component}`,
        );
      }

      const component = line.component as InventoryComponent;

      if (component === 'manufacturing') {
        if (!line.sku || !line.quantity || line.quantity <= 0) {
          throw new Error(
            `Manufacturing bill mapping line requires sku+quantity: billId=${mapping.qboBillId} lineId=${line.qboLineId}`,
          );
        }

        // Per-SKU manufacturing event
        addPoUnits(poUnitsBySku, mapping.poNumber, line.sku, line.quantity);
        events.push({
          kind: 'manufacturing',
          date: mapping.billDate,
          poNumber: mapping.poNumber,
          sku: line.sku,
          units: line.quantity,
          costCents: line.amountCents,
        });
        continue;
      }

      // Cost-only components (freight/duty/accessories)
      events.push({
        kind: 'cost',
        date: mapping.billDate,
        poNumber: mapping.poNumber,
        component,
        costCents: line.amountCents,
        ...(line.sku ? { sku: line.sku } : {}),
      });
    }
  }

  events.sort(compareBillEvents);

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

  const weights = Array.from(skuUnits.entries())
    .map(([sku, units]) => ({ key: sku, weight: units }))
    .sort((a, b) => compareText(a.key, b.key));
  return allocateByWeight(totalCents, weights);
}
