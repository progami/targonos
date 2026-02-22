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
  | { kind: 'match'; matchType: 'doc_number' | 'contained' | 'overlap'; invoiceId: string };

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

function isSettlementInvoiceId(value: string): boolean {
  return /\b(?:US|UK)-\d{2}(?:[A-Z]{3})?-\d{2}[A-Z]{3}-\d{2,4}-\d+\b/i.test(value.trim());
}

function normalizeSettlementDocNumberForInvoiceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return trimmed;

  const match = trimmed.match(/\b(?:US|UK)-\d{2}(?:[A-Z]{3})?-\d{2}[A-Z]{3}-\d{2,4}-\d+\b/i);
  return match ? match[0]!.toUpperCase() : trimmed;
}

function pickPreferredInvoice(candidates: AuditInvoiceSummary[]): AuditInvoiceSummary | null {
  const settlementInvoices = candidates.filter((inv) => isSettlementInvoiceId(inv.invoiceId));
  if (settlementInvoices.length === 1) return settlementInvoices[0]!;
  return null;
}

export function selectAuditInvoiceForSettlement(input: {
  settlementMarketplace: MarketplaceId;
  settlementPeriodStart: string | null;
  settlementPeriodEnd: string | null;
  settlementDocNumber?: string;
  invoices: AuditInvoiceSummary[];
}): AuditInvoiceMatch {
  const marketplaceInvoices = input.invoices.filter((inv) => inv.marketplace === input.settlementMarketplace);

  const docNumberRaw = input.settlementDocNumber;
  if (typeof docNumberRaw === 'string') {
    const normalizedDocNumber = normalizeSettlementDocNumberForInvoiceId(docNumberRaw);
    if (normalizedDocNumber !== '') {
      const exact = marketplaceInvoices.find((inv) => inv.invoiceId === normalizedDocNumber);
      if (exact) {
        return { kind: 'match', matchType: 'doc_number', invoiceId: exact.invoiceId };
      }
    }
  }

  const periodStart = input.settlementPeriodStart;
  const periodEnd = input.settlementPeriodEnd;

  if (periodStart === null || periodEnd === null) {
    return { kind: 'missing_period' };
  }

  const contained = marketplaceInvoices.filter((inv) => inv.minDate >= periodStart && inv.maxDate <= periodEnd);
  if (contained.length === 1) {
    return { kind: 'match', matchType: 'contained', invoiceId: contained[0]!.invoiceId };
  }
  if (contained.length > 1) {
    const preferred = pickPreferredInvoice(contained);
    if (preferred) {
      return { kind: 'match', matchType: 'contained', invoiceId: preferred.invoiceId };
    }
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
    const preferred = pickPreferredInvoice(overlap);
    if (preferred) {
      return { kind: 'match', matchType: 'overlap', invoiceId: preferred.invoiceId };
    }
    return {
      kind: 'ambiguous',
      matchType: 'overlap',
      candidateInvoiceIds: overlap.map((c) => c.invoiceId).sort(),
    };
  }

  return { kind: 'none' };
}
