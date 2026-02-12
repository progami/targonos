import { normalizeSku } from '@/lib/plutus/settlement-validation';

export type SettlementSaleProfitabilityInput = {
  sku: string;
  quantity: number;
  principalCents: number;
  costManufacturingCents: number;
  costFreightCents: number;
  costDutyCents: number;
  costMfgAccessoriesCents: number;
};

export type SettlementReturnProfitabilityInput = {
  sku: string;
  quantity: number;
  principalCents: number;
  costManufacturingCents: number;
  costFreightCents: number;
  costDutyCents: number;
  costMfgAccessoriesCents: number;
};

export type SettlementAdsAllocationLineInput = {
  sku: string;
  allocatedCents: number;
};

export type SkuProfitabilityLine = {
  sku: string;
  soldUnits: number;
  returnedUnits: number;
  netUnits: number;
  principalCents: number;
  cogsCents: number;
  adsAllocatedCents: number;
  contributionBeforeAdsCents: number;
  contributionAfterAdsCents: number;
};

export type SkuProfitabilityTotals = {
  soldUnits: number;
  returnedUnits: number;
  netUnits: number;
  principalCents: number;
  cogsCents: number;
  adsAllocatedCents: number;
  contributionBeforeAdsCents: number;
  contributionAfterAdsCents: number;
};

export type SettlementSkuProfitability = {
  lines: SkuProfitabilityLine[];
  totals: SkuProfitabilityTotals;
};

type SkuAccumulator = {
  soldUnits: number;
  returnedUnits: number;
  principalCents: number;
  salesCogsCents: number;
  returnCogsCents: number;
  adsAllocatedCents: number;
};

function sumCogs(input: {
  costManufacturingCents: number;
  costFreightCents: number;
  costDutyCents: number;
  costMfgAccessoriesCents: number;
}): number {
  return (
    input.costManufacturingCents +
    input.costFreightCents +
    input.costDutyCents +
    input.costMfgAccessoriesCents
  );
}

function getOrCreateAccumulator(bySku: Map<string, SkuAccumulator>, sku: string): SkuAccumulator {
  const existing = bySku.get(sku);
  if (existing) {
    return existing;
  }
  const created: SkuAccumulator = {
    soldUnits: 0,
    returnedUnits: 0,
    principalCents: 0,
    salesCogsCents: 0,
    returnCogsCents: 0,
    adsAllocatedCents: 0,
  };
  bySku.set(sku, created);
  return created;
}

export function buildSettlementSkuProfitability(input: {
  sales: SettlementSaleProfitabilityInput[];
  returns: SettlementReturnProfitabilityInput[];
  allocationLines: SettlementAdsAllocationLineInput[];
}): SettlementSkuProfitability {
  const bySku = new Map<string, SkuAccumulator>();

  for (const sale of input.sales) {
    const sku = normalizeSku(sale.sku);
    const accumulator = getOrCreateAccumulator(bySku, sku);
    accumulator.soldUnits += sale.quantity;
    accumulator.principalCents += sale.principalCents;
    accumulator.salesCogsCents += sumCogs(sale);
  }

  for (const ret of input.returns) {
    const sku = normalizeSku(ret.sku);
    const accumulator = getOrCreateAccumulator(bySku, sku);
    accumulator.returnedUnits += ret.quantity;
    accumulator.principalCents += ret.principalCents;
    accumulator.returnCogsCents += sumCogs(ret);
  }

  for (const line of input.allocationLines) {
    const sku = normalizeSku(line.sku);
    const accumulator = getOrCreateAccumulator(bySku, sku);
    accumulator.adsAllocatedCents += line.allocatedCents;
  }

  const lines: SkuProfitabilityLine[] = [];
  for (const [sku, row] of bySku.entries()) {
    const cogsCents = row.salesCogsCents - row.returnCogsCents;
    const contributionBeforeAdsCents = row.principalCents - cogsCents;
    const contributionAfterAdsCents = contributionBeforeAdsCents - row.adsAllocatedCents;

    lines.push({
      sku,
      soldUnits: row.soldUnits,
      returnedUnits: row.returnedUnits,
      netUnits: row.soldUnits - row.returnedUnits,
      principalCents: row.principalCents,
      cogsCents,
      adsAllocatedCents: row.adsAllocatedCents,
      contributionBeforeAdsCents,
      contributionAfterAdsCents,
    });
  }

  lines.sort((a, b) => a.sku.localeCompare(b.sku));

  const totals: SkuProfitabilityTotals = {
    soldUnits: 0,
    returnedUnits: 0,
    netUnits: 0,
    principalCents: 0,
    cogsCents: 0,
    adsAllocatedCents: 0,
    contributionBeforeAdsCents: 0,
    contributionAfterAdsCents: 0,
  };

  for (const line of lines) {
    totals.soldUnits += line.soldUnits;
    totals.returnedUnits += line.returnedUnits;
    totals.netUnits += line.netUnits;
    totals.principalCents += line.principalCents;
    totals.cogsCents += line.cogsCents;
    totals.adsAllocatedCents += line.adsAllocatedCents;
    totals.contributionBeforeAdsCents += line.contributionBeforeAdsCents;
    totals.contributionAfterAdsCents += line.contributionAfterAdsCents;
  }

  return { lines, totals };
}
