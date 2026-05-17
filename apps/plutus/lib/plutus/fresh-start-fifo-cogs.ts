import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';

export type CostLayerStatus = 'NOT_READY' | 'READY';

export type FreshCostLayer = {
  id: string;
  marketplace: string;
  qboPurchaseOrderId: string | null;
  poNumber: string;
  qboPurchaseOrderLineId: string | null;
  sku: string;
  qboItemId: string | null;
  qtyReceived: number;
  qtyRemaining: number;
  landedTotal: number;
  unitCost: number;
  currency: string;
  status: CostLayerStatus;
  receiptDate: string | null;
};

export type OpeningCostLayerDraft = {
  marketplace: string;
  poNumber: string;
  sku: string;
  qtyReceived: number;
  qtyRemaining: number;
  landedTotal: number;
  unitCost: number;
  currency: string;
  status: 'READY';
  openingRef: string;
};

export type SoldUnitInput = {
  sku: string;
  quantity: number;
};

export type FreshCogsConsumptionDraft = {
  settlementId: string;
  marketplace: string;
  sku: string;
  poNumber: string;
  costLayerId: string;
  qtyConsumed: number;
  unitCost: number;
  cogsAmount: number;
};

export type FreshCogsBlock = {
  code: 'INSUFFICIENT_READY_LAYER';
  sku: string;
  requestedQuantity: number;
  availableReadyQuantity: number;
  missingQuantity: number;
};

export type FreshCogsJournalDraft = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: Array<{
    accountName: 'COGS - Product FIFO' | 'Inventory Asset - Plutus';
    postingType: 'Debit' | 'Credit';
    amount: number;
    description: string;
  }>;
};

export type FreshCogsPlan = {
  ok: boolean;
  blocks: FreshCogsBlock[];
  consumptions: FreshCogsConsumptionDraft[];
  cogsTotal: number;
  qboCogsJournalDraft: FreshCogsJournalDraft | null;
};

export type LandedCostAllocationDraft = {
  costType: string;
  allocatedAmount: number;
};

function normalizeSku(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') throw new Error('SKU is required');
  return normalized;
}

function isPrincipalSaleRow(description: string): boolean {
  return description.trim().startsWith('Amazon Sales - Principal');
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUnitCost(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

export function buildFreshCogsDocNumber(settlementId: string): string {
  const docNumber = `C-${settlementId}`;
  if (docNumber.length > 21) {
    throw new Error(`QBO COGS doc number exceeds 21 characters: ${docNumber}`);
  }
  return docNumber;
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer`);
}

function requireMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a non-negative amount`);
}

export function deriveSoldUnitsFromSettlementAuditRows(
  rows: SettlementAuditRow[],
): SoldUnitInput[] {
  const totalsBySku = new Map<string, number>();

  for (const row of rows) {
    if (row.quantity <= 0) continue;
    if (!isPrincipalSaleRow(row.description)) continue;
    const sku = normalizeSku(row.sku);
    totalsBySku.set(sku, (totalsBySku.get(sku) ?? 0) + row.quantity);
  }

  return Array.from(totalsBySku.entries())
    .sort(([leftSku], [rightSku]) => leftSku.localeCompare(rightSku))
    .map(([sku, quantity]) => ({ sku, quantity }));
}

function sortReadyLayersForFifo(layers: FreshCostLayer[]): FreshCostLayer[] {
  return layers
    .filter((layer) => layer.status === 'READY')
    .slice()
    .sort((left, right) => {
      const leftDate = left.receiptDate ?? '';
      const rightDate = right.receiptDate ?? '';
      const dateCompare = leftDate.localeCompare(rightDate);
      if (dateCompare !== 0) return dateCompare;
      const poCompare = left.poNumber.localeCompare(right.poNumber);
      if (poCompare !== 0) return poCompare;
      return left.id.localeCompare(right.id);
    });
}

export function buildFreshStartCogsPlan(input: {
  settlementId: string;
  marketplace: string;
  txnDate: string;
  currency: string;
  soldUnits: SoldUnitInput[];
  layers: FreshCostLayer[];
}): FreshCogsPlan {
  const consumptions: FreshCogsConsumptionDraft[] = [];
  const blocks: FreshCogsBlock[] = [];
  const readyLayers = sortReadyLayersForFifo(input.layers);

  for (const sold of input.soldUnits) {
    const sku = normalizeSku(sold.sku);
    requirePositiveInteger(sold.quantity, `Sold quantity for ${sku}`);
    let qtyToConsume = sold.quantity;

    for (const layer of readyLayers) {
      if (normalizeSku(layer.sku) !== sku) continue;
      if (qtyToConsume === 0) break;
      if (layer.qtyRemaining <= 0) continue;

      const qtyConsumed = Math.min(layer.qtyRemaining, qtyToConsume);
      const cogsAmount = roundMoney(qtyConsumed * layer.unitCost);
      consumptions.push({
        settlementId: input.settlementId,
        marketplace: input.marketplace,
        sku,
        poNumber: layer.poNumber,
        costLayerId: layer.id,
        qtyConsumed,
        unitCost: layer.unitCost,
        cogsAmount,
      });
      qtyToConsume -= qtyConsumed;
      layer.qtyRemaining -= qtyConsumed;
    }

    if (qtyToConsume > 0) {
      const availableReadyQuantity = readyLayers
        .filter((layer) => normalizeSku(layer.sku) === sku)
        .reduce((sum, layer) => sum + Math.max(0, layer.qtyRemaining), 0);
      blocks.push({
        code: 'INSUFFICIENT_READY_LAYER',
        sku,
        requestedQuantity: sold.quantity,
        availableReadyQuantity,
        missingQuantity: qtyToConsume,
      });
    }
  }

  if (blocks.length > 0) {
    return {
      ok: false,
      blocks,
      consumptions: [],
      cogsTotal: 0,
      qboCogsJournalDraft: null,
    };
  }

  const cogsTotal = roundMoney(consumptions.reduce((sum, line) => sum + line.cogsAmount, 0));
  const descriptions = consumptions.map(
    (line) =>
      `SKU=${line.sku} | PO=${line.poNumber} | Qty=${line.qtyConsumed} | UnitCost=${line.unitCost.toFixed(6)}`,
  );

  return {
    ok: true,
    blocks,
    consumptions,
    cogsTotal,
    qboCogsJournalDraft: {
      txnDate: input.txnDate,
      docNumber: buildFreshCogsDocNumber(input.settlementId),
      privateNote: `Plutus FIFO COGS | Settlement ${input.settlementId}`,
      lines: [
        {
          accountName: 'COGS - Product FIFO',
          postingType: 'Debit',
          amount: cogsTotal,
          description: descriptions.join('\n'),
        },
        {
          accountName: 'Inventory Asset - Plutus',
          postingType: 'Credit',
          amount: cogsTotal,
          description: descriptions.join('\n'),
        },
      ],
    },
  };
}

export function calculateLayerCost(input: {
  qtyReceived: number;
  nativeManufacturingAmount: number;
  allocations: LandedCostAllocationDraft[];
}): { landedTotal: number; unitCost: number } {
  requirePositiveInteger(input.qtyReceived, 'qtyReceived');
  requireMoney(input.nativeManufacturingAmount, 'nativeManufacturingAmount');
  const allocated = input.allocations.reduce((sum, allocation) => {
    if (allocation.costType.trim() === '') throw new Error('allocation costType is required');
    requireMoney(allocation.allocatedAmount, `${allocation.costType} allocation`);
    return sum + allocation.allocatedAmount;
  }, 0);
  const landedTotal = roundMoney(input.nativeManufacturingAmount + allocated);
  return {
    landedTotal,
    unitCost: roundUnitCost(landedTotal / input.qtyReceived),
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

export function buildOpeningLayersFromCsv(csvText: string): OpeningCostLayerDraft[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length < 2) throw new Error('Opening layer CSV requires a header and at least one row');

  const header = parseCsvLine(lines[0]);
  const required = ['marketplace', 'sku', 'qty', 'value', 'unit_cost', 'currency', 'opening_ref'];
  for (const column of required) {
    if (!header.includes(column))
      throw new Error(`Opening layer CSV missing required column ${column}`);
  }

  return lines.slice(1).map((line, rowIndex) => {
    const raw = parseCsvLine(line);
    const row = new Map(header.map((column, index) => [column, raw[index] ?? '']));
    const rowLabel = `row ${rowIndex + 2}`;
    const marketplace = row.get('marketplace')?.trim() ?? '';
    const sku = normalizeSku(row.get('sku') ?? '');
    const qty = Number(row.get('qty'));
    const value = Number(row.get('value'));
    const unitCost = Number(row.get('unit_cost'));
    const currency = row.get('currency')?.trim().toUpperCase() ?? '';
    const openingRef = row.get('opening_ref')?.trim() ?? '';

    if (marketplace === '') throw new Error(`${rowLabel} missing marketplace`);
    requirePositiveInteger(qty, `${rowLabel} qty`);
    requireMoney(value, `${rowLabel} value`);
    requireMoney(unitCost, `${rowLabel} unit_cost`);
    if (currency === '') throw new Error(`${rowLabel} missing currency`);
    if (openingRef === '') throw new Error(`${rowLabel} missing opening_ref`);

    const expectedValue = roundMoney(qty * unitCost);
    if (Math.abs(expectedValue - roundMoney(value)) > 0.01) {
      throw new Error(`${rowLabel} value does not equal qty x unit_cost`);
    }

    return {
      marketplace,
      poNumber: `OPENING-${openingRef}`,
      sku,
      qtyReceived: qty,
      qtyRemaining: qty,
      landedTotal: roundMoney(value),
      unitCost: roundUnitCost(unitCost),
      currency,
      status: 'READY',
      openingRef,
    };
  });
}
