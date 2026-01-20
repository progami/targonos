import type { PurchaseOrderStatus } from './types';
import type { ProfitAndLossWeekDerived } from './finance';
import type { AllocationLedgerLine } from './allocation-ledger';

export type PoPnlStatus = Extract<
  PurchaseOrderStatus,
  'DRAFT' | 'ISSUED' | 'MANUFACTURING' | 'OCEAN' | 'WAREHOUSE' | 'SHIPPED'
>;

export interface PoPnlOrderMeta {
  orderCode: string;
  status: PoPnlStatus;
  productionStart: Date | null;
  availableDate: Date | null;
  totalLeadDays: number | null;
}

export interface PoPnlRow {
  id: string;
  orderCode: string;
  batchCode: string | null;
  productId: string;
  productName: string;
  status: PoPnlStatus;
  units: number;
  revenue: number;
  manufacturingCost: number;
  freightCost: number;
  tariffCost: number;
  cogs: number;
  cogsAdjustment: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  amazonFees: number;
  amazonFeesAdjustment: number;
  ppcSpend: number;
  fixedCosts: number;
  grossProfit: number;
  grossMarginPercent: number;
  netProfit: number;
  netMarginPercent: number;
  roi: number;
  productionStart: Date | null;
  availableDate: Date | null;
  totalLeadDays: number | null;
}

export interface PoPnlSummary {
  units: number;
  revenue: number;
  cogs: number;
  amazonFees: number;
  ppcSpend: number;
  fixedCosts: number;
  grossProfit: number;
  netProfit: number;
}

type MutableTotals = {
  units: number;
  revenue: number;
  manufacturingCost: number;
  freightCost: number;
  tariffCost: number;
  cogs: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  amazonFees: number;
  ppcSpend: number;
  fixedCosts: number;
};

const UNATTRIBUTED_KEY = '__UNATTRIBUTED__';

function normalizeStatus(status: PurchaseOrderStatus | null | undefined): PoPnlStatus {
  switch (status) {
    case 'DRAFT':
    case 'ISSUED':
    case 'MANUFACTURING':
    case 'OCEAN':
    case 'WAREHOUSE':
    case 'SHIPPED':
      return status;
    default:
      return 'ISSUED';
  }
}

function buildKey(orderCode: string, batchCode: string | null, productId: string): string {
  return `${orderCode}::${batchCode ?? ''}::${productId}`;
}

function safeDiv(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

function allocateDeltaAcrossGroups(
  groups: Map<string, MutableTotals>,
  groupKeys: string[],
  delta: number,
  weight: (key: string) => number,
  apply: (group: MutableTotals, value: number) => void,
) {
  if (!Number.isFinite(delta) || delta === 0 || groupKeys.length === 0) return;

  const weights = groupKeys
    .map((key) => ({ key, weight: weight(key) }))
    .map((entry) => ({
      key: entry.key,
      weight: Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 0,
    }));
  const weightTotal = weights.reduce((sum, entry) => sum + entry.weight, 0);
  if (weightTotal <= 0) {
    const fallback = groups.get(UNATTRIBUTED_KEY);
    if (fallback) apply(fallback, delta);
    return;
  }

  let remainder = delta;
  for (let index = 0; index < weights.length; index += 1) {
    const { key, weight: groupWeight } = weights[index]!;
    const group = groups.get(key);
    if (!group) continue;
    const isLast = index === weights.length - 1;
    const share = isLast ? remainder : (delta * groupWeight) / weightTotal;
    apply(group, share);
    remainder -= share;
  }
}

export function buildPoPnlRows(options: {
  ledger: AllocationLedgerLine[];
  weeklyTargets: ProfitAndLossWeekDerived[];
  productNameById: Map<string, string>;
  orderMetaByCode: Map<string, PoPnlOrderMeta>;
  weekNumbers?: Set<number>;
}): { rows: PoPnlRow[]; unattributed: PoPnlSummary; totals: PoPnlSummary } {
  const { ledger, weeklyTargets, productNameById, orderMetaByCode, weekNumbers } = options;

  const targetsByWeek = new Map<number, ProfitAndLossWeekDerived>();
  for (const entry of weeklyTargets) {
    if (weekNumbers && !weekNumbers.has(entry.weekNumber)) continue;
    targetsByWeek.set(entry.weekNumber, entry);
  }

  const ledgerByWeek = new Map<number, AllocationLedgerLine[]>();
  for (const line of ledger) {
    if (weekNumbers && !weekNumbers.has(line.weekNumber)) continue;
    const bucket = ledgerByWeek.get(line.weekNumber);
    if (bucket) bucket.push(line);
    else ledgerByWeek.set(line.weekNumber, [line]);
  }

  const inScopeWeeks = new Set<number>([...targetsByWeek.keys(), ...ledgerByWeek.keys()]);

  const totalsByGroup = new Map<string, MutableTotals>();

  for (const weekNumber of Array.from(inScopeWeeks).sort((a, b) => a - b)) {
    const weekLines = ledgerByWeek.get(weekNumber) ?? [];
    const target = targetsByWeek.get(weekNumber) ?? null;

    const groups = new Map<string, MutableTotals>();

    // Always include an unattributed bucket so deltas/fixed costs have a safe home.
    groups.set(UNATTRIBUTED_KEY, {
      units: 0,
      revenue: 0,
      manufacturingCost: 0,
      freightCost: 0,
      tariffCost: 0,
      cogs: 0,
      referralFees: 0,
      fbaFees: 0,
      storageFees: 0,
      amazonFees: 0,
      ppcSpend: 0,
      fixedCosts: 0,
    });

    for (const line of weekLines) {
      const orderCode = line.orderCode ?? UNATTRIBUTED_KEY;
      const batchCode = orderCode === UNATTRIBUTED_KEY ? null : (line.batchCode ?? null);
      const productId = line.productId;
      const key =
        orderCode === UNATTRIBUTED_KEY
          ? UNATTRIBUTED_KEY
          : buildKey(orderCode, batchCode, productId);
      const group = groups.get(key) ?? {
        units: 0,
        revenue: 0,
        manufacturingCost: 0,
        freightCost: 0,
        tariffCost: 0,
        cogs: 0,
        referralFees: 0,
        fbaFees: 0,
        storageFees: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
      };

      group.units += line.units;
      group.revenue += line.revenue;
      group.manufacturingCost += line.manufacturingCost;
      group.freightCost += line.freightCost;
      group.tariffCost += line.tariffCost;
      group.cogs += line.cogs;
      group.referralFees += line.referralFees;
      group.fbaFees += line.fbaFees;
      group.storageFees += line.storageFees;
      group.amazonFees += line.amazonFees;
      group.ppcSpend += line.ppcSpend;

      groups.set(key, group);
    }

    const groupKeys = Array.from(groups.keys());

    const baseTotals = groupKeys.reduce(
      (acc, key) => {
        const group = groups.get(key);
        if (!group) return acc;
        acc.units += group.units;
        acc.revenue += group.revenue;
        acc.manufacturingCost += group.manufacturingCost;
        acc.freightCost += group.freightCost;
        acc.tariffCost += group.tariffCost;
        acc.cogs += group.cogs;
        acc.referralFees += group.referralFees;
        acc.fbaFees += group.fbaFees;
        acc.storageFees += group.storageFees;
        acc.amazonFees += group.amazonFees;
        acc.ppcSpend += group.ppcSpend;
        return acc;
      },
      {
        units: 0,
        revenue: 0,
        manufacturingCost: 0,
        freightCost: 0,
        tariffCost: 0,
        cogs: 0,
        referralFees: 0,
        fbaFees: 0,
        storageFees: 0,
        amazonFees: 0,
        ppcSpend: 0,
      },
    );

    const targetTotals = target
      ? {
          units: target.units,
          revenue: target.revenue,
          manufacturingCost: baseTotals.manufacturingCost,
          freightCost: baseTotals.freightCost,
          tariffCost: baseTotals.tariffCost,
          cogs: target.cogs,
          referralFees: baseTotals.referralFees,
          fbaFees: baseTotals.fbaFees,
          storageFees: baseTotals.storageFees,
          amazonFees: target.amazonFees,
          ppcSpend: target.ppcSpend,
          fixedCosts: target.fixedCosts,
        }
      : {
          units: baseTotals.units,
          revenue: baseTotals.revenue,
          manufacturingCost: baseTotals.manufacturingCost,
          freightCost: baseTotals.freightCost,
          tariffCost: baseTotals.tariffCost,
          cogs: baseTotals.cogs,
          referralFees: baseTotals.referralFees,
          fbaFees: baseTotals.fbaFees,
          storageFees: baseTotals.storageFees,
          amazonFees: baseTotals.amazonFees,
          ppcSpend: baseTotals.ppcSpend,
          fixedCosts: 0,
        };

    const revenueWeight = (key: string) =>
      safeDiv(groups.get(key)?.revenue ?? 0, baseTotals.revenue);
    const unitsWeight = (key: string) => safeDiv(groups.get(key)?.units ?? 0, baseTotals.units);

    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.units - baseTotals.units,
      unitsWeight,
      (group, value) => {
        group.units += value;
      },
    );
    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.revenue - baseTotals.revenue,
      baseTotals.revenue > 0 ? revenueWeight : unitsWeight,
      (group, value) => {
        group.revenue += value;
      },
    );
    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.cogs - baseTotals.cogs,
      baseTotals.revenue > 0 ? revenueWeight : unitsWeight,
      (group, value) => {
        group.cogs += value;
      },
    );
    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.amazonFees - baseTotals.amazonFees,
      baseTotals.revenue > 0 ? revenueWeight : unitsWeight,
      (group, value) => {
        group.amazonFees += value;
      },
    );
    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.ppcSpend - baseTotals.ppcSpend,
      baseTotals.revenue > 0 ? revenueWeight : unitsWeight,
      (group, value) => {
        group.ppcSpend += value;
      },
    );

    const adjustedRevenueTotal = groupKeys.reduce(
      (sum, key) => sum + (groups.get(key)?.revenue ?? 0),
      0,
    );
    const adjustedUnitsTotal = groupKeys.reduce(
      (sum, key) => sum + (groups.get(key)?.units ?? 0),
      0,
    );
    const fixedWeight = (key: string) =>
      adjustedRevenueTotal > 0
        ? safeDiv(groups.get(key)?.revenue ?? 0, adjustedRevenueTotal)
        : adjustedUnitsTotal > 0
          ? safeDiv(groups.get(key)?.units ?? 0, adjustedUnitsTotal)
          : key === UNATTRIBUTED_KEY
            ? 1
            : 0;

    allocateDeltaAcrossGroups(
      groups,
      groupKeys,
      targetTotals.fixedCosts,
      fixedWeight,
      (group, value) => {
        group.fixedCosts += value;
      },
    );

    for (const key of groupKeys) {
      const group = groups.get(key);
      if (!group) continue;

      const aggregate = totalsByGroup.get(key) ?? {
        units: 0,
        revenue: 0,
        manufacturingCost: 0,
        freightCost: 0,
        tariffCost: 0,
        cogs: 0,
        referralFees: 0,
        fbaFees: 0,
        storageFees: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
      };

      aggregate.units += group.units;
      aggregate.revenue += group.revenue;
      aggregate.manufacturingCost += group.manufacturingCost;
      aggregate.freightCost += group.freightCost;
      aggregate.tariffCost += group.tariffCost;
      aggregate.cogs += group.cogs;
      aggregate.referralFees += group.referralFees;
      aggregate.fbaFees += group.fbaFees;
      aggregate.storageFees += group.storageFees;
      aggregate.amazonFees += group.amazonFees;
      aggregate.ppcSpend += group.ppcSpend;
      aggregate.fixedCosts += group.fixedCosts;

      totalsByGroup.set(key, aggregate);
    }
  }

  const unattributedTotals = totalsByGroup.get(UNATTRIBUTED_KEY) ?? {
    units: 0,
    revenue: 0,
    manufacturingCost: 0,
    freightCost: 0,
    tariffCost: 0,
    cogs: 0,
    referralFees: 0,
    fbaFees: 0,
    storageFees: 0,
    amazonFees: 0,
    ppcSpend: 0,
    fixedCosts: 0,
  };

  const rows: PoPnlRow[] = [];
  let totals: PoPnlSummary = {
    units: 0,
    revenue: 0,
    cogs: 0,
    amazonFees: 0,
    ppcSpend: 0,
    fixedCosts: 0,
    grossProfit: 0,
    netProfit: 0,
  };

  for (const [key, aggregate] of totalsByGroup.entries()) {
    if (key === UNATTRIBUTED_KEY) continue;

    const [orderCode, rawBatchCode, productId] = key.split('::');
    if (!orderCode || !productId) continue;
    const batchCode = rawBatchCode ? rawBatchCode : null;

    const meta = orderMetaByCode.get(orderCode) ?? null;
    const revenue = aggregate.revenue;
    const cogsAdjustment =
      aggregate.cogs - aggregate.manufacturingCost - aggregate.freightCost - aggregate.tariffCost;
    const amazonFeesAdjustment =
      aggregate.amazonFees - aggregate.referralFees - aggregate.fbaFees - aggregate.storageFees;
    // GP = Revenue - COGS - Amazon Fees (before PPC)
    const grossProfit = revenue - aggregate.cogs - aggregate.amazonFees;
    // NP = GP - PPC - Fixed Costs (OPEX = Fixed Costs only, PPC is part of GP calculation)
    const netProfit = grossProfit - aggregate.ppcSpend - aggregate.fixedCosts;
    const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMarginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    const roi = aggregate.cogs > 0 ? (netProfit / aggregate.cogs) * 100 : 0;

    totals = {
      units: totals.units + aggregate.units,
      revenue: totals.revenue + aggregate.revenue,
      cogs: totals.cogs + aggregate.cogs,
      amazonFees: totals.amazonFees + aggregate.amazonFees,
      ppcSpend: totals.ppcSpend + aggregate.ppcSpend,
      fixedCosts: totals.fixedCosts + aggregate.fixedCosts,
      grossProfit: totals.grossProfit + grossProfit,
      netProfit: totals.netProfit + netProfit,
    };

    rows.push({
      id: key,
      orderCode,
      batchCode,
      productId,
      productName: productNameById.get(productId) ?? productId,
      status: meta ? normalizeStatus(meta.status) : 'ISSUED',
      units: aggregate.units,
      revenue: aggregate.revenue,
      manufacturingCost: aggregate.manufacturingCost,
      freightCost: aggregate.freightCost,
      tariffCost: aggregate.tariffCost,
      cogs: aggregate.cogs,
      cogsAdjustment,
      referralFees: aggregate.referralFees,
      fbaFees: aggregate.fbaFees,
      storageFees: aggregate.storageFees,
      amazonFees: aggregate.amazonFees,
      amazonFeesAdjustment,
      ppcSpend: aggregate.ppcSpend,
      fixedCosts: aggregate.fixedCosts,
      grossProfit,
      grossMarginPercent,
      netProfit,
      netMarginPercent,
      roi,
      productionStart: meta?.productionStart ?? null,
      availableDate: meta?.availableDate ?? null,
      totalLeadDays: meta?.totalLeadDays ?? null,
    });
  }

  const unattributedSummary: PoPnlSummary = (() => {
    const revenue = unattributedTotals.revenue;
    // GP = Revenue - COGS - Amazon Fees (before PPC)
    const grossProfit = revenue - unattributedTotals.cogs - unattributedTotals.amazonFees;
    // NP = GP - PPC - Fixed Costs (OPEX = Fixed Costs only)
    const netProfit = grossProfit - unattributedTotals.ppcSpend - unattributedTotals.fixedCosts;
    return {
      units: unattributedTotals.units,
      revenue: unattributedTotals.revenue,
      cogs: unattributedTotals.cogs,
      amazonFees: unattributedTotals.amazonFees,
      ppcSpend: unattributedTotals.ppcSpend,
      fixedCosts: unattributedTotals.fixedCosts,
      grossProfit,
      netProfit,
    };
  })();

  return { rows, unattributed: unattributedSummary, totals };
}
