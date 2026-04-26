export function excelSetupColumns(year: number) {
  return [
    'SKU',
    `Opening Stock ${year}`,
    `${year + 1} Opening Override`,
    'Notes',
    'REGION',
    'Total Threshold (W)',
    'FBA Threshold (W)',
  ] as const;
}

export const EXCEL_FORECAST_METRICS = [
  'INBOUND',
  '3PL',
  'FBA',
  'FBA COVER (W)',
  'TOTAL COVER (W)',
  'ACTUAL',
  'PLANNER',
  'FINAL',
] as const;

export const EXCEL_PO_TABLE_COLUMNS = [
  'PO CODE',
  'PRODUCT',
  'QTY',
  'UNITS/CTN',
  'CARTON',
  'CTN L (CM)',
  'CTN W (CM)',
  'CTN H (CM)',
  'CBM',
  'MFG START',
  'SHIP',
  'CONTAINER #',
  'STATUS',
  'PO CLASS',
  'MFG (WK)',
  'DEPART (WK)',
  'ARRIVAL (WK)',
  'WH (WK)',
  'INBOUND WK OVERRIDE',
  'INBOUND WK',
  'PO TOTAL QTY',
  'NOTES',
  'PO FIRST ROW',
  'REGION',
] as const;

export const EXCEL_PO_FINANCE_COLUMNS = [
  'PO CODE',
  'PRODUCT',
  'CARTON',
  'SELL $',
  'MFG $',
  'FREIGHT $',
  'TARIFF $',
  'TACOS %',
  'FBA $',
  'REFERRAL %',
  'STORAGE $',
  'GP $',
  'NP $',
  'REGION',
] as const;

export type WorkbookRegion = 'US' | 'UK';

export type PoTableWorkbookInput = {
  orderCode: string;
  product: string;
  quantity: number | null;
  unitsPerCarton: number | null;
  cartonLengthCm: number | null;
  cartonWidthCm: number | null;
  cartonHeightCm: number | null;
  mfgStart: Date | null;
  arrivalWeeks: number | null;
  warehouseWeeks: number | null;
  inboundWeekOverride?: Date | null;
  region: WorkbookRegion;
};

export type PoTableWorkbookDerived = {
  carton: number | null;
  cbm: number | null;
  inboundWeek: Date | null;
  poTotalQty: number;
  poFirstRow: number | null;
};

export type PoFinanceLookupRow = {
  orderCode: string;
  product: string;
  region: WorkbookRegion;
  carton: number | null;
};

export type PoFinanceWorkbookInput = {
  orderCode: string;
  product: string;
  region: WorkbookRegion;
  poTableRows: PoFinanceLookupRow[];
  sellPrice: number | null;
  manufacturingCost: number | null;
  freightCost: number | null;
  tariffCost: number | null;
  tacosPercent: number | null;
  fbaFee: number | null;
  referralPercent: number | null;
  storageCost: number | null;
};

export type PoFinanceWorkbookDerived = {
  carton: number | null;
  grossProfit: number | null;
  netProfit: number | null;
};

export type ForecastWorkbookRowInput = {
  openingStock: number | null;
  inbound: number | null;
  actual: number | null;
  planner: number | null;
  final?: number | null;
  previous: ForecastWorkbookRow | null;
};

export type ForecastWorkbookRow = {
  inbound: number;
  threePl: number;
  fba: number;
  fbaCoverWeeks: number;
  totalCoverWeeks: number;
  actual: number | null;
  planner: number | null;
  final: number;
};

function finiteNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  return Number.isFinite(value) ? value : null;
}

function numberValue(value: number | null | undefined): number {
  const numeric = finiteNumber(value);
  return numeric == null ? 0 : numeric;
}

function roundTo(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function mondayForDate(date: Date): Date {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + mondayOffset);
  return utc;
}

function addWeeks(date: Date, weeks: number): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + Math.round(weeks * 7));
  return copy;
}

export function computeCarton(quantity: number | null, unitsPerCarton: number | null): number | null {
  const qty = finiteNumber(quantity);
  const units = finiteNumber(unitsPerCarton);
  if (qty == null) return null;
  if (units == null) return null;
  if (units <= 0) return null;
  return Math.ceil(qty / units);
}

export function computeCbm(options: {
  quantity: number | null;
  unitsPerCarton: number | null;
  cartonLengthCm: number | null;
  cartonWidthCm: number | null;
  cartonHeightCm: number | null;
}): number | null {
  const carton = computeCarton(options.quantity, options.unitsPerCarton);
  const length = finiteNumber(options.cartonLengthCm);
  const width = finiteNumber(options.cartonWidthCm);
  const height = finiteNumber(options.cartonHeightCm);
  if (carton == null) return null;
  if (length == null) return null;
  if (width == null) return null;
  if (height == null) return null;
  return roundTo((carton * length * width * height) / 1_000_000, 3);
}

export function computeInboundWeek(row: PoTableWorkbookInput): Date | null {
  if (row.inboundWeekOverride) return mondayForDate(row.inboundWeekOverride);
  if (!row.mfgStart) return null;
  const warehouseWeeks = finiteNumber(row.warehouseWeeks);
  const arrivalWeeks = finiteNumber(row.arrivalWeeks);
  const offset = warehouseWeeks ?? arrivalWeeks;
  if (offset == null) return null;
  return mondayForDate(addWeeks(row.mfgStart, offset));
}

export function computePoTotalQty(
  row: Pick<PoTableWorkbookInput, 'orderCode' | 'region'>,
  rows: PoTableWorkbookInput[],
): number {
  return rows.reduce((sum, candidate) => {
    if (candidate.orderCode !== row.orderCode) return sum;
    if (candidate.region !== row.region) return sum;
    return sum + numberValue(candidate.quantity);
  }, 0);
}

export function computePoFirstRow(
  row: PoTableWorkbookInput,
  rows: PoTableWorkbookInput[],
  index: number,
): number | null {
  const inboundWeek = computeInboundWeek(row);
  if (!row.orderCode) return null;
  if (!inboundWeek) return null;

  let count = 0;
  for (let rowIndex = 0; rowIndex <= index; rowIndex += 1) {
    const candidate = rows[rowIndex];
    if (!candidate) continue;
    const candidateInbound = computeInboundWeek(candidate);
    if (!candidateInbound) continue;
    if (candidate.orderCode !== row.orderCode) continue;
    if (candidate.region !== row.region) continue;
    if (candidateInbound.getTime() !== inboundWeek.getTime()) continue;
    count += 1;
  }
  return count;
}

export function computePoTableWorkbookRow(
  row: PoTableWorkbookInput,
  rows: PoTableWorkbookInput[],
  index: number,
): PoTableWorkbookDerived {
  return {
    carton: computeCarton(row.quantity, row.unitsPerCarton),
    cbm: computeCbm({
      quantity: row.quantity,
      unitsPerCarton: row.unitsPerCarton,
      cartonLengthCm: row.cartonLengthCm,
      cartonWidthCm: row.cartonWidthCm,
      cartonHeightCm: row.cartonHeightCm,
    }),
    inboundWeek: computeInboundWeek(row),
    poTotalQty: computePoTotalQty(row, rows),
    poFirstRow: computePoFirstRow(row, rows, index),
  };
}

export function computePoFinanceWorkbookRow(
  input: PoFinanceWorkbookInput,
): PoFinanceWorkbookDerived {
  const carton = input.poTableRows.reduce<number | null>((sum, row) => {
    if (row.orderCode !== input.orderCode) return sum;
    if (row.product !== input.product) return sum;
    if (row.region !== input.region) return sum;
    const cartonValue = finiteNumber(row.carton);
    if (cartonValue == null) return sum;
    return (sum ?? 0) + cartonValue;
  }, null);

  const hasEconomics = [
    input.sellPrice,
    input.manufacturingCost,
    input.freightCost,
    input.tariffCost,
    input.tacosPercent,
    input.fbaFee,
    input.referralPercent,
    input.storageCost,
  ].some((value) => value != null);

  if (!hasEconomics) {
    return { carton, grossProfit: null, netProfit: null };
  }

  const sell = numberValue(input.sellPrice);
  const grossProfit =
    sell -
    numberValue(input.manufacturingCost) -
    numberValue(input.freightCost) -
    numberValue(input.tariffCost) -
    numberValue(input.fbaFee) -
    sell * numberValue(input.referralPercent);
  const netProfit =
    grossProfit - numberValue(input.storageCost) - sell * numberValue(input.tacosPercent);

  return { carton, grossProfit, netProfit };
}

function coverWeeks(numerator: number, final: number): number {
  if (final === 0) {
    return numerator > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return numerator / final;
}

export function computeForecastWorkbookRow(input: ForecastWorkbookRowInput): ForecastWorkbookRow {
  const inbound = numberValue(input.inbound);
  const actual = finiteNumber(input.actual);
  const planner = finiteNumber(input.planner);
  const explicitFinal = finiteNumber(input.final);
  const final = explicitFinal ?? actual ?? planner ?? 0;

  let threePl: number;
  let fba: number;

  if (input.previous) {
    threePl = numberValue(input.previous.threePl) + inbound;
    fba = Math.max(
      0,
      numberValue(input.previous.threePl) +
        numberValue(input.previous.fba) +
        numberValue(input.previous.inbound) -
        numberValue(input.previous.final) -
        threePl,
    );
  } else {
    threePl = 0;
    fba = Math.max(0, numberValue(input.openingStock) - threePl);
  }

  return {
    inbound,
    threePl,
    fba,
    fbaCoverWeeks: coverWeeks(fba, final),
    totalCoverWeeks: coverWeeks(inbound + threePl + fba, final),
    actual,
    planner,
    final,
  };
}
