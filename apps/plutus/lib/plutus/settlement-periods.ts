import { db } from '@/lib/db';

export type SettlementPeriodRange = {
  periodStart: string;
  periodEnd: string;
};

export function buildSettlementPeriodKey(marketplaceId: 'amazon.com' | 'amazon.co.uk', invoiceId: string): string {
  return `${marketplaceId}:${invoiceId}`;
}

function uniqueInvoiceIds(values: string[]): string[] {
  const cleaned = values.map((value) => value.trim()).filter((value) => value !== '');
  return Array.from(new Set(cleaned)).sort();
}

async function loadMarketplacePeriods(input: {
  marketplaceId: 'amazon.com' | 'amazon.co.uk';
  marketCode: 'us' | 'uk';
  invoiceIds: string[];
}): Promise<Map<string, SettlementPeriodRange>> {
  const invoiceIds = uniqueInvoiceIds(input.invoiceIds);
  if (invoiceIds.length === 0) {
    return new Map();
  }

  const rows = await db.auditDataRow.groupBy({
    by: ['invoiceId'],
    where: {
      invoiceId: { in: invoiceIds },
      OR: [
        { market: { equals: input.marketCode, mode: 'insensitive' } },
        { market: { contains: input.marketplaceId, mode: 'insensitive' } },
      ],
    },
    _min: { date: true },
    _max: { date: true },
  });

  const result = new Map<string, SettlementPeriodRange>();
  for (const row of rows) {
    const periodStart = row._min.date;
    const periodEnd = row._max.date;
    if (periodStart === null || periodEnd === null) {
      continue;
    }

    result.set(buildSettlementPeriodKey(input.marketplaceId, row.invoiceId), { periodStart, periodEnd });
  }

  return result;
}

export async function loadSettlementPeriodsFromAuditRows(input: {
  amazonComInvoiceIds: string[];
  amazonCoUkInvoiceIds: string[];
}): Promise<Map<string, SettlementPeriodRange>> {
  const [usPeriods, ukPeriods] = await Promise.all([
    loadMarketplacePeriods({
      marketplaceId: 'amazon.com',
      marketCode: 'us',
      invoiceIds: input.amazonComInvoiceIds,
    }),
    loadMarketplacePeriods({
      marketplaceId: 'amazon.co.uk',
      marketCode: 'uk',
      invoiceIds: input.amazonCoUkInvoiceIds,
    }),
  ]);

  return new Map([...usPeriods, ...ukPeriods]);
}
