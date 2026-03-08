import { db } from '@/lib/db';

import {
  selectAuditInvoiceForSettlement,
  type AuditInvoiceMatch,
  type AuditInvoiceSummary,
  type MarketplaceId,
} from './audit-invoice-matching';

type AuditInvoiceRowSummary = {
  invoiceId: string;
  marketplaceId: string | null;
  rowCount: bigint;
  minDate: string;
  maxDate: string;
  markets: string[];
};

export type AuditInvoiceResolution =
  | {
      status: 'resolved';
      invoiceId: string;
      source: 'processing' | 'rollback' | 'doc_number' | 'contained' | 'overlap';
    }
  | {
      status: 'unresolved';
      reason: 'missing_period' | 'none' | 'ambiguous';
      candidateInvoiceIds: string[];
    };

export type SettlementChildForInvoiceResolution = {
  qboJournalEntryId: string;
  docNumber: string;
  marketplace: { id: MarketplaceId };
  periodStart: string | null;
  periodEnd: string | null;
  processing: null | { invoiceId: string };
  rollback: null | { invoiceId: string };
};

function buildResolvedResolution(
  invoiceId: string,
  source: 'processing' | 'rollback' | 'doc_number' | 'contained' | 'overlap',
): AuditInvoiceResolution {
  return { status: 'resolved', invoiceId, source };
}

function buildUnresolvedResolution(match: Exclude<AuditInvoiceMatch, { kind: 'match' }>): AuditInvoiceResolution {
  if (match.kind === 'ambiguous') {
    return {
      status: 'unresolved',
      reason: 'ambiguous',
      candidateInvoiceIds: match.candidateInvoiceIds,
    };
  }

  return {
    status: 'unresolved',
    reason: match.kind,
    candidateInvoiceIds: [],
  };
}

export async function fetchAuditInvoiceSummaries(): Promise<AuditInvoiceSummary[]> {
  const rows = await db.$queryRaw<AuditInvoiceRowSummary[]>`
    SELECT "invoiceId",
           CASE
             WHEN LOWER("market") = 'us' OR LOWER("market") LIKE '%amazon.com%' THEN 'amazon.com'
             WHEN LOWER("market") = 'uk' OR LOWER("market") LIKE '%amazon.co.uk%' THEN 'amazon.co.uk'
             ELSE NULL
           END AS "marketplaceId",
           COUNT(*)::bigint AS "rowCount",
           MIN("date") AS "minDate",
           MAX("date") AS "maxDate",
           ARRAY_AGG(DISTINCT "market") AS "markets"
    FROM plutus."AuditDataRow"
    GROUP BY "invoiceId", "marketplaceId"
    ORDER BY "invoiceId", "marketplaceId"
  `;

  return rows.map((row) => {
    if (row.marketplaceId !== 'amazon.com' && row.marketplaceId !== 'amazon.co.uk') {
      throw new Error(`Unrecognized audit marketplace: ${row.marketplaceId === null ? 'null' : row.marketplaceId}`);
    }

    return {
      invoiceId: row.invoiceId,
      marketplace: row.marketplaceId as MarketplaceId,
      rowCount: Number(row.rowCount),
      minDate: row.minDate,
      maxDate: row.maxDate,
      markets: row.markets,
    };
  });
}

export function resolveAuditInvoiceForSettlementChild(input: {
  marketplace: MarketplaceId;
  periodStart: string | null;
  periodEnd: string | null;
  settlementDocNumber: string;
  processingInvoiceId?: string | null;
  rollbackInvoiceId?: string | null;
  invoices: AuditInvoiceSummary[];
}): AuditInvoiceResolution {
  if (input.processingInvoiceId) {
    return buildResolvedResolution(input.processingInvoiceId, 'processing');
  }

  if (input.rollbackInvoiceId) {
    return buildResolvedResolution(input.rollbackInvoiceId, 'rollback');
  }

  const match = selectAuditInvoiceForSettlement({
    settlementMarketplace: input.marketplace,
    settlementPeriodStart: input.periodStart,
    settlementPeriodEnd: input.periodEnd,
    settlementDocNumber: input.settlementDocNumber,
    invoices: input.invoices,
  });

  if (match.kind === 'match') {
    return buildResolvedResolution(match.invoiceId, match.matchType);
  }

  return buildUnresolvedResolution(match);
}

export async function resolveAuditInvoicesForSettlementChildren(
  children: SettlementChildForInvoiceResolution[],
): Promise<Map<string, AuditInvoiceResolution>> {
  const invoices = await fetchAuditInvoiceSummaries();

  return new Map(
    children.map((child) => [
      child.qboJournalEntryId,
      resolveAuditInvoiceForSettlementChild({
        marketplace: child.marketplace.id,
        periodStart: child.periodStart,
        periodEnd: child.periodEnd,
        settlementDocNumber: child.docNumber,
        processingInvoiceId: child.processing?.invoiceId ?? null,
        rollbackInvoiceId: child.rollback?.invoiceId ?? null,
        invoices,
      }),
    ]),
  );
}

export function formatAuditInvoiceResolutionMessage(resolution: AuditInvoiceResolution): string {
  if (resolution.status === 'resolved') {
    if (resolution.source === 'processing') return `Processed with invoice ${resolution.invoiceId}`;
    if (resolution.source === 'rollback') return `Will reuse rolled-back invoice ${resolution.invoiceId}`;
    if (resolution.source === 'doc_number') return `Matched invoice ${resolution.invoiceId} by doc number`;
    if (resolution.source === 'contained') return `Matched invoice ${resolution.invoiceId} by contained date range`;
    return `Matched invoice ${resolution.invoiceId} by overlapping date range`;
  }

  if (resolution.reason === 'missing_period') {
    return 'Cannot resolve an audit invoice because this posting is missing a settlement period.';
  }

  if (resolution.reason === 'none') {
    return 'No stored audit invoice matches this posting period.';
  }

  return `Multiple stored audit invoices match this posting period: ${resolution.candidateInvoiceIds.join(', ')}`;
}
