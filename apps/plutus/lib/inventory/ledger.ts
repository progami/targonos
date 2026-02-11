import { allocateByWeight, removeProportionalComponents } from '@/lib/inventory/money';
import { allocatePoCostAcrossSkus, type InventoryComponent, type ParsedBills } from '@/lib/inventory/qbo-bills';

export type { InventoryComponent };

export type InventoryState = {
  units: number;
  valueByComponentCents: Record<InventoryComponent, number>;
};

export type LedgerSnapshot = {
  bySku: Map<string, InventoryState>;
};

export type SaleCost = {
  orderId: string;
  sku: string;
  units: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type LedgerBlock = {
  code: 'MISSING_COST_BASIS' | 'NEGATIVE_INVENTORY' | 'LATE_COST_ON_HAND_ZERO';
  message: string;
  details?: Record<string, string | number>;
};

function emptyState(): InventoryState {
  return {
    units: 0,
    valueByComponentCents: {
      manufacturing: 0,
      freight: 0,
      duty: 0,
      mfgAccessories: 0,
    },
  };
}

function getState(snapshot: LedgerSnapshot, sku: string): InventoryState {
  const existing = snapshot.bySku.get(sku);
  if (existing) return existing;
  const next = emptyState();
  snapshot.bySku.set(sku, next);
  return next;
}

function requirePositiveInt(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer (got ${value})`);
  }
}

export function createEmptyLedgerSnapshot(): LedgerSnapshot {
  return { bySku: new Map() };
}

type KnownSaleEvent = {
  date: string;
  orderId: string;
  sku: string;
  units: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

type PlannedSaleEvent = {
  date: string;
  orderId: string;
  sku: string;
  units: number;
};

type TimelineEvent =
  | { date: string; order: number; kind: 'bill'; event: ParsedBills['events'][number] }
  | { date: string; order: number; kind: 'sale_known'; event: KnownSaleEvent }
  | { date: string; order: number; kind: 'return_known'; event: KnownSaleEvent }
  | { date: string; order: number; kind: 'sale_compute'; event: PlannedSaleEvent };

function applyBillEvent(snapshot: LedgerSnapshot, parsedBills: ParsedBills, event: ParsedBills['events'][number], blocks: LedgerBlock[]) {
  if (event.kind === 'brand_cost') {
    // Brand-level cost events are tracked separately — they don't map to individual SKUs
    // Settlement processing handles brand-level P&L allocation directly
    return;
  }

  if (event.kind === 'manufacturing') {
    const state = getState(snapshot, event.sku);
    requirePositiveInt(event.units, 'manufacturing units');

    state.units += event.units;
    state.valueByComponentCents.manufacturing += event.costCents;
    return;
  }

  if (event.sku) {
    const state = getState(snapshot, event.sku);
    if (state.units === 0) {
      blocks.push({
        code: 'LATE_COST_ON_HAND_ZERO',
        message: 'Cannot apply cost because on-hand is 0',
        details: { poNumber: event.poNumber, sku: event.sku, component: event.component, date: event.date },
      });
      return;
    }

    state.valueByComponentCents[event.component] += event.costCents;
    return;
  }

  const allocations = allocatePoCostAcrossSkus(event.costCents, event.poNumber, parsedBills.poUnitsBySku);
  for (const [sku, allocatedCents] of Object.entries(allocations)) {
    if (allocatedCents === 0) continue;
    const state = getState(snapshot, sku);
    if (state.units === 0) {
      blocks.push({
        code: 'LATE_COST_ON_HAND_ZERO',
        message: 'Cannot apply PO cost because on-hand is 0',
        details: { poNumber: event.poNumber, sku, component: event.component, date: event.date },
      });
      continue;
    }
    state.valueByComponentCents[event.component] += allocatedCents;
  }
}

export function applyBillEvents(
  snapshot: LedgerSnapshot,
  parsedBills: ParsedBills,
): { blocks: LedgerBlock[] } {
  const blocks: LedgerBlock[] = [];

  for (const event of parsedBills.events) {
    applyBillEvent(snapshot, parsedBills, event, blocks);
  }

  return { blocks };
}

export function replayInventoryLedger(input: {
  parsedBills: ParsedBills;
  knownSales: KnownSaleEvent[];
  knownReturns: KnownSaleEvent[];
  computeSales: PlannedSaleEvent[];
}): { snapshot: LedgerSnapshot; computedCosts: SaleCost[]; blocks: LedgerBlock[] } {
  const snapshot = createEmptyLedgerSnapshot();
  const blocks: LedgerBlock[] = [];
  const computedCosts: SaleCost[] = [];

  const timeline: TimelineEvent[] = [];

  for (const event of input.parsedBills.events) {
    timeline.push({
      date: event.date,
      order: event.kind === 'manufacturing' ? 10 : 20,
      kind: 'bill',
      event,
    });
  }

  const knownSales = [...input.knownSales].sort((a, b) => a.date.localeCompare(b.date));
  for (const event of knownSales) {
    timeline.push({
      date: event.date,
      order: 30,
      kind: 'sale_known',
      event,
    });
  }

  const knownReturns = [...input.knownReturns].sort((a, b) => a.date.localeCompare(b.date));
  for (const event of knownReturns) {
    timeline.push({
      date: event.date,
      order: 50,
      kind: 'return_known',
      event,
    });
  }

  const computeSales = [...input.computeSales].sort((a, b) => a.date.localeCompare(b.date));
  for (const event of computeSales) {
    timeline.push({
      date: event.date,
      order: 40,
      kind: 'sale_compute',
      event,
    });
  }

  timeline.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.order - b.order;
  });

  for (const entry of timeline) {
    if (entry.kind === 'bill') {
      applyBillEvent(snapshot, input.parsedBills, entry.event, blocks);
      continue;
    }

    if (entry.kind === 'sale_known') {
      const result = applyKnownSale(snapshot, entry.event);
      blocks.push(...result.blocks);
      continue;
    }

    if (entry.kind === 'return_known') {
      const result = applyKnownReturn(snapshot, entry.event);
      blocks.push(...result.blocks);
      continue;
    }

    const result = computeSaleCostFromAverage(snapshot, entry.event);
    blocks.push(...result.blocks);
    if (result.saleCost) {
      computedCosts.push(result.saleCost);
    }
  }

  return { snapshot, computedCosts, blocks };
}

export function applyKnownSale(
  snapshot: LedgerSnapshot,
  input: {
    orderId: string;
    sku: string;
    units: number;
    costByComponentCents: Record<InventoryComponent, number>;
  },
): { blocks: LedgerBlock[] } {
  const blocks: LedgerBlock[] = [];
  requirePositiveInt(input.units, 'sale units');

  const state = getState(snapshot, input.sku);
  if (state.units < input.units) {
    blocks.push({
      code: 'NEGATIVE_INVENTORY',
      message: 'Sale would result in negative inventory',
      details: { sku: input.sku, onHandUnits: state.units, saleUnits: input.units },
    });
    return { blocks };
  }

  state.units -= input.units;
  for (const component of Object.keys(state.valueByComponentCents) as InventoryComponent[]) {
    state.valueByComponentCents[component] -= input.costByComponentCents[component];
  }

  return { blocks };
}

export function applyKnownReturn(
  snapshot: LedgerSnapshot,
  input: {
    orderId: string;
    sku: string;
    units: number;
    costByComponentCents: Record<InventoryComponent, number>;
  },
): { blocks: LedgerBlock[] } {
  const blocks: LedgerBlock[] = [];
  requirePositiveInt(input.units, 'return units');

  const state = getState(snapshot, input.sku);
  state.units += input.units;
  for (const component of Object.keys(state.valueByComponentCents) as InventoryComponent[]) {
    state.valueByComponentCents[component] += input.costByComponentCents[component];
  }

  return { blocks };
}

export function computeSaleCostFromAverage(
  snapshot: LedgerSnapshot,
  input: { orderId: string; sku: string; units: number },
): { saleCost?: SaleCost; blocks: LedgerBlock[] } {
  const blocks: LedgerBlock[] = [];
  requirePositiveInt(input.units, 'sale units');

  const state = getState(snapshot, input.sku);
  if (state.units === 0) {
    blocks.push({
      code: 'MISSING_COST_BASIS',
      message: 'No on-hand inventory / cost basis for SKU',
      details: { sku: input.sku },
    });
    return { blocks };
  }

  if (state.units < input.units) {
    blocks.push({
      code: 'NEGATIVE_INVENTORY',
      message: 'Sale would result in negative inventory',
      details: { sku: input.sku, onHandUnits: state.units, saleUnits: input.units },
    });
    return { blocks };
  }

  const removed = removeProportionalComponents(state.valueByComponentCents, input.units, state.units);
  state.units -= input.units;
  for (const component of Object.keys(state.valueByComponentCents) as InventoryComponent[]) {
    state.valueByComponentCents[component] -= removed[component];
  }

  return {
    saleCost: {
      orderId: input.orderId,
      sku: input.sku,
      units: input.units,
      costByComponentCents: removed as Record<InventoryComponent, number>,
    },
    blocks,
  };
}

export function allocateCogsByBrand(
  costs: SaleCost[],
  skuToBrand: Map<string, string>,
): Record<string, Record<InventoryComponent, number>> {
  const result: Record<string, Record<InventoryComponent, number>> = {};

  for (const cost of costs) {
    const brand = skuToBrand.get(cost.sku);
    if (!brand) {
      throw new Error(`SKU not mapped to brand: ${cost.sku}`);
    }

    const existing = result[brand];
    if (!existing) {
      result[brand] = {
        manufacturing: 0,
        freight: 0,
        duty: 0,
        mfgAccessories: 0,
      };
    }

    for (const component of Object.keys(cost.costByComponentCents) as InventoryComponent[]) {
      result[brand]![component] += cost.costByComponentCents[component];
    }
  }

  return result;
}

export function allocateCostAcrossSkusByUnits(
  totalCents: number,
  unitsBySku: Map<string, number>,
): Record<string, number> {
  const weights = Array.from(unitsBySku.entries()).map(([sku, units]) => ({ key: sku, weight: units }));
  return allocateByWeight(totalCents, weights);
}
