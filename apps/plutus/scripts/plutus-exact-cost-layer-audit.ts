import { db } from '@/lib/db';
import {
  buildPlutusInventoryValuation,
  type ComponentAmounts,
  type ExactCostLayerConsumptionInput,
  type ExactCostLayerInput,
} from '@/lib/plutus/exact-cost-layer-subledger';
import type { QboInventoryAssetComponent } from '@/lib/plutus/qbo-inventory-asset-lines';
import { loadSharedPlutusEnv } from './shared-env';

type CostLayerRow = {
  id: string;
  internalRef: string;
  marketplace: string;
  sellerSku: string;
  component: string;
  quantity: number;
  amountCents: number;
  receiptDate: Date | null;
  sourceQboTxnType: string | null;
  sourceQboTxnId: string | null;
  sourceQboLineId: string | null;
  sourceDocumentName: string | null;
};

type ConsumptionRow = {
  poCostLayerId: string | null;
  settlementDocNumber: string;
  internalPo: string;
  sellerSku: string;
  quantity: number;
  amountCents: number;
  componentAmounts: unknown;
};

const COMPONENTS: QboInventoryAssetComponent[] = ['manufacturing', 'freight', 'duty', 'mfgAccessories'];

function emptyComponentAmounts(): ComponentAmounts {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}

function normalizeComponent(value: string): QboInventoryAssetComponent {
  if (value === 'manufacturing') return 'manufacturing';
  if (value === 'freight') return 'freight';
  if (value === 'duty') return 'duty';
  if (value === 'mfgAccessories') return 'mfgAccessories';
  throw new Error(`Unsupported exact cost-layer component: ${value}`);
}

function moneyFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function sourceRef(row: CostLayerRow): string | null {
  if (row.sourceDocumentName !== null) return row.sourceDocumentName;
  if (row.sourceQboTxnType === null || row.sourceQboTxnId === null) return null;
  return `${row.sourceQboTxnType}:${row.sourceQboTxnId}`;
}

function qboLineRef(row: CostLayerRow): string | null {
  if (row.sourceQboTxnId === null || row.sourceQboLineId === null) return null;
  return `${row.sourceQboTxnId}:${row.sourceQboLineId}`;
}

function pushUnique(values: string[], value: string | null): void {
  if (value === null) return;
  if (values.includes(value)) return;
  values.push(value);
}

function parseComponentAmounts(value: unknown): ComponentAmounts {
  if (typeof value !== 'object' || value === null) {
    throw new Error('CostLayerConsumption.componentAmounts must be an object');
  }
  const raw = value as Partial<Record<QboInventoryAssetComponent, unknown>>;
  const amounts = emptyComponentAmounts();
  for (const component of COMPONENTS) {
    const componentValue = raw[component];
    if (typeof componentValue !== 'number') {
      throw new Error(`CostLayerConsumption.componentAmounts.${component} must be numeric`);
    }
    amounts[component] = componentValue;
  }
  return amounts;
}

function buildLayers(rows: CostLayerRow[]): ExactCostLayerInput[] {
  const grouped = new Map<
    string,
    {
      internalPo: string;
      marketplace: string;
      sellerSku: string;
      receiptDate: string;
      quantity: number;
      componentAmounts: ComponentAmounts;
      sourceRefs: string[];
      qboBillLineRefs: string[];
    }
  >();

  for (const row of rows) {
    const key = `${row.internalRef}\u0000${row.marketplace}\u0000${row.sellerSku}`;
    if (row.receiptDate === null) {
      throw new Error(`PO cost layer ${row.id} is missing receiptDate`);
    }
    const existing = grouped.get(key) ?? {
      internalPo: row.internalRef,
      marketplace: row.marketplace,
      sellerSku: row.sellerSku,
      receiptDate: row.receiptDate.toISOString().slice(0, 10),
      quantity: row.quantity,
      componentAmounts: emptyComponentAmounts(),
      sourceRefs: [],
      qboBillLineRefs: [],
    };
    const component = normalizeComponent(row.component);
    existing.componentAmounts[component] += moneyFromCents(row.amountCents);
    if (existing.quantity !== row.quantity) {
      throw new Error(`PO cost layer quantity mismatch for ${row.internalRef} ${row.sellerSku}`);
    }
    const receiptDate = row.receiptDate.toISOString().slice(0, 10);
    if (receiptDate > existing.receiptDate) existing.receiptDate = receiptDate;
    pushUnique(existing.sourceRefs, sourceRef(row));
    pushUnique(existing.qboBillLineRefs, qboLineRef(row));
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .sort((left, right) => {
      const poCompare = left.internalPo.localeCompare(right.internalPo);
      if (poCompare !== 0) return poCompare;
      return left.sellerSku.localeCompare(right.sellerSku);
    })
    .map((layer) => ({
      layerId: `${layer.internalPo}:${layer.sellerSku}`,
      marketplace: layer.marketplace,
      internalPo: layer.internalPo,
      sellerSku: layer.sellerSku,
      receiptDate: layer.receiptDate,
      quantity: layer.quantity,
      componentAmounts: layer.componentAmounts,
      sourceRefs: layer.sourceRefs.sort(),
      qboBillLineRefs: layer.qboBillLineRefs.sort(),
    }));
}

async function main(): Promise<void> {
  loadSharedPlutusEnv();
  const [layerRows, consumptionRows] = await Promise.all([
    db.$queryRawUnsafe<CostLayerRow[]>(`
      SELECT
        layer."id",
        po."internalRef",
        layer."marketplace",
        layer."sellerSku",
        layer."component",
        layer."quantity",
        layer."amountCents",
        layer."receiptDate",
        layer."sourceQboTxnType",
        layer."sourceQboTxnId",
        layer."sourceQboLineId",
        layer."sourceDocumentName"
      FROM "PoCostLayer" layer
      INNER JOIN "PurchaseOrder" po ON po."id" = layer."purchaseOrderId"
      ORDER BY po."internalRef" ASC, layer."sellerSku" ASC, layer."component" ASC
    `),
    db.$queryRawUnsafe<ConsumptionRow[]>(`
      SELECT
        "poCostLayerId",
        "settlementDocNumber",
        "internalPo",
        "sellerSku",
        "quantity",
        "amountCents",
        "componentAmounts"
      FROM "CostLayerConsumption"
      ORDER BY "settlementDocNumber" ASC, "sellerSku" ASC
    `),
  ]);

  const layers = buildLayers(layerRows);
  const consumptions: ExactCostLayerConsumptionInput[] = consumptionRows.map((row) => {
    return {
      layerId: `${row.internalPo}:${row.sellerSku}`,
      settlementDocNumber: row.settlementDocNumber,
      sellerSku: row.sellerSku,
      quantity: row.quantity,
      componentAmounts: parseComponentAmounts(row.componentAmounts),
      totalAmount: moneyFromCents(row.amountCents),
    };
  });

  const valuation = buildPlutusInventoryValuation({ layers, consumptions });
  const overConsumedLayers = valuation.layers.filter((layer) => layer.quantityRemaining < 0);
  const ok = overConsumedLayers.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        layerRows: layerRows.length,
        exactLayers: layers.length,
        consumptionRows: consumptionRows.length,
        totalRemainingAmount: valuation.totalRemainingAmount,
        overConsumedLayers,
        valuation,
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
