export type MarketplaceId = 'amazon.com' | 'amazon.co.uk';

export type AuditInvoiceSummary = {
  invoiceId: string;
  marketplace: MarketplaceId;
  markets: string[];
  minDate: string; // YYYY-MM-DD
  maxDate: string; // YYYY-MM-DD
  rowCount: number;
};

export type AuditInvoiceMatch =
  | { kind: 'missing_period' }
  | { kind: 'none' }
  | { kind: 'ambiguous'; matchType: 'contained' | 'overlap'; candidateInvoiceIds: string[] }
  | { kind: 'match'; matchType: 'contained' | 'overlap'; invoiceId: string };

export function normalizeAuditMarketToMarketplaceId(value: string): MarketplaceId | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'us') return 'amazon.com';
  if (normalized === 'uk') return 'amazon.co.uk';

  if (normalized.includes('amazon.co.uk')) return 'amazon.co.uk';
  if (normalized.includes('amazon.com')) return 'amazon.com';

  return null;
}

export function invoiceMarketsMatchMarketplace(markets: string[], marketplace: MarketplaceId): boolean {
  const normalized = new Set<MarketplaceId>();
  for (const market of markets) {
    const mapped = normalizeAuditMarketToMarketplaceId(market);
    if (mapped) normalized.add(mapped);
  }

  return normalized.has(marketplace);
}

export function dateRangesOverlapIsoDay(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function selectAuditInvoiceForSettlement(input: {
  settlementMarketplace: MarketplaceId;
  settlementPeriodStart: string | null;
  settlementPeriodEnd: string | null;
  invoices: AuditInvoiceSummary[];
}): AuditInvoiceMatch {
  const periodStart = input.settlementPeriodStart;
  const periodEnd = input.settlementPeriodEnd;

  if (periodStart === null || periodEnd === null) {
    return { kind: 'missing_period' };
  }

  const marketplaceInvoices = input.invoices.filter((inv) => inv.marketplace === input.settlementMarketplace);

  const contained = marketplaceInvoices.filter((inv) => inv.minDate >= periodStart && inv.maxDate <= periodEnd);
  if (contained.length === 1) {
    return { kind: 'match', matchType: 'contained', invoiceId: contained[0]!.invoiceId };
  }
  if (contained.length > 1) {
    return {
      kind: 'ambiguous',
      matchType: 'contained',
      candidateInvoiceIds: contained.map((c) => c.invoiceId).sort(),
    };
  }

  const overlap = marketplaceInvoices.filter((inv) =>
    dateRangesOverlapIsoDay(periodStart, periodEnd, inv.minDate, inv.maxDate),
  );
  if (overlap.length === 1) {
    return { kind: 'match', matchType: 'overlap', invoiceId: overlap[0]!.invoiceId };
  }
  if (overlap.length > 1) {
    return {
      kind: 'ambiguous',
      matchType: 'overlap',
      candidateInvoiceIds: overlap.map((c) => c.invoiceId).sort(),
    };
  }

  return { kind: 'none' };
}
