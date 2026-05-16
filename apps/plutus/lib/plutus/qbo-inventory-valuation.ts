export type QboInventoryValuationRow = {
  itemId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  assetValue: number;
  averageCost: number;
};

export type QboInventoryValuationSummary = {
  rows: QboInventoryValuationRow[];
  totalAssetValue: number;
};

export type QboInventoryValuationTieout = {
  ok: boolean;
  inventoryAssetBalance: number;
  inventoryValuationAssetValue: number;
  delta: number;
  tolerance: number;
};

type QboReportColData = {
  value?: string;
  id?: string;
};

type QboReportRow = {
  ColData?: QboReportColData[];
  group?: string;
};

type QboReport = {
  Rows?: {
    Row?: QboReportRow[];
  };
};

function parseMoney(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  const numeric = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) throw new Error(`QBO inventory valuation amount is not finite: ${value}`);
  return numeric;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseQboInventoryValuationSummary(report: QboReport): QboInventoryValuationSummary {
  const rows: QboInventoryValuationRow[] = [];
  let totalAssetValue: number | null = null;

  for (const row of report.Rows?.Row ?? []) {
    const colData = row.ColData ?? [];
    const itemName = colData[0]?.value?.trim();
    if (itemName === undefined || itemName === '') continue;

    if (row.group === 'GrandTotal' || itemName.toUpperCase() === 'TOTAL') {
      totalAssetValue = parseMoney(colData[3]?.value);
      continue;
    }

    rows.push({
      itemId: colData[0]?.id ?? null,
      name: itemName,
      sku: colData[1]?.value?.trim() || null,
      quantity: parseMoney(colData[2]?.value),
      assetValue: parseMoney(colData[3]?.value),
      averageCost: parseMoney(colData[4]?.value),
    });
  }

  return {
    rows,
    totalAssetValue:
      totalAssetValue === null ? roundMoney(rows.reduce((sum, row) => sum + row.assetValue, 0)) : totalAssetValue,
  };
}

export function assessQboInventoryValuationTieout(input: {
  inventoryAssetBalance: number;
  inventoryValuationAssetValue: number;
  tolerance?: number;
}): QboInventoryValuationTieout {
  const tolerance = input.tolerance ?? 0.01;
  const inventoryAssetBalance = roundMoney(input.inventoryAssetBalance);
  const inventoryValuationAssetValue = roundMoney(input.inventoryValuationAssetValue);
  const delta = roundMoney(inventoryAssetBalance - inventoryValuationAssetValue);

  return {
    ok: Math.abs(delta) <= tolerance,
    inventoryAssetBalance,
    inventoryValuationAssetValue,
    delta,
    tolerance,
  };
}
