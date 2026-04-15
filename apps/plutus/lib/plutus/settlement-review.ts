import { getSettlementDisplayId } from './settlement-display';
import type { AuditInvoiceResolution } from './audit-invoice-resolution';

type PlutusSettlementStatus = 'Pending' | 'Processed' | 'RolledBack';

export type SettlementListRowViewModel = {
  title: string;
  subtitle: string;
  statusText: string;
};

export type SettlementListRowViewModelInput = {
  sourceSettlementId: string;
  marketplace: { label: string };
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
  splitCount: number;
  isSplit: boolean;
  children: Array<{ docNumber: string }>;
};

export type SettlementPostingSectionViewModel = {
  qboJournalEntryId: string;
  docNumber: string;
  periodStart: string | null;
  periodEnd: string | null;
  postedDate: string;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
  invoiceId: string | null;
  blockMessage: string | null;
  blockMessages: string[];
};

export type SettlementPostingSectionDetailChildInput = {
  qboJournalEntryId: string;
  docNumber: string;
  periodStart: string | null;
  periodEnd: string | null;
  postedDate: string;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
  invoiceResolution: AuditInvoiceResolution;
  invoiceResolutionMessage: string;
  processing: null | { invoiceId: string };
  rollback: null | { invoiceId: string };
};

export type SettlementPostingSectionPreviewChildInput = {
  qboJournalEntryId: string;
  docNumber: string;
  invoiceId: string;
  preview: {
    blocks: Array<{ code: string; message: string }>;
  };
};

export type SettlementPostingSectionInput = {
  settlement: {
    sourceSettlementId: string;
    marketplace: { label: string; currency: string; region: string };
  };
  children: readonly SettlementPostingSectionDetailChildInput[];
};

export type SettlementPostingPreviewInput = {
  children: readonly SettlementPostingSectionPreviewChildInput[];
};

export type SettlementHistoryViewModel = {
  id: string;
  title: string;
  subtitle: string;
  timestamp: string;
  kind: 'posted' | 'processed' | 'rolled_back';
};

export type SettlementHistoryEventInput = {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  childDocNumber: string;
  kind: 'posted' | 'processed' | 'rolled_back';
};

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '—';

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();

  const startText = startDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
  const endText = endDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startText} – ${endText}`;
}

function compareNullableIsoDay(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function buildBlockMessages(
  previewChild: SettlementPostingSectionPreviewChildInput | undefined,
  invoiceResolution: AuditInvoiceResolution,
  invoiceResolutionMessage: string,
): string[] {
  if (invoiceResolution.status === 'unresolved') {
    return [invoiceResolutionMessage];
  }

  if (!previewChild) {
    return [];
  }

  return previewChild.preview.blocks.map((block) => block.message);
}

export function buildSettlementListRowViewModel(input: SettlementListRowViewModelInput): SettlementListRowViewModel {
  const title = getSettlementDisplayId({
    sourceSettlementId: input.sourceSettlementId,
    childDocNumbers: input.children.map((child) => child.docNumber),
  });

  const subtitleParts = [input.marketplace.label];
  if (input.isSplit && input.splitCount > 1) {
    subtitleParts.push('split across month-end', `${input.splitCount} postings`);
  } else {
    subtitleParts.push(formatPeriod(input.periodStart, input.periodEnd));
  }

  return {
    title,
    subtitle: subtitleParts.join(' · '),
    statusText: input.plutusStatus,
  };
}

export function buildSettlementPostingSectionViewModels(
  input: SettlementPostingSectionInput,
  preview: SettlementPostingPreviewInput | null,
): SettlementPostingSectionViewModel[] {
  const previewById = new Map(preview?.children.map((child) => [child.qboJournalEntryId, child] as const));

  return [...input.children]
    .sort((a, b) => {
      const periodCmp = compareNullableIsoDay(a.periodStart, b.periodStart);
      if (periodCmp !== 0) return periodCmp;
      return a.docNumber.localeCompare(b.docNumber);
    })
    .map((child) => {
      const previewChild = previewById.get(child.qboJournalEntryId);
      const blockMessages = buildBlockMessages(previewChild, child.invoiceResolution, child.invoiceResolutionMessage);

      return {
        qboJournalEntryId: child.qboJournalEntryId,
        docNumber: child.docNumber,
        periodStart: child.periodStart,
        periodEnd: child.periodEnd,
        postedDate: child.postedDate,
        settlementTotal: child.settlementTotal,
        plutusStatus: child.plutusStatus,
        invoiceId:
          (child.invoiceResolution.status === 'resolved' ? child.invoiceResolution.invoiceId : null) ??
          child.processing?.invoiceId ??
          child.rollback?.invoiceId ??
          previewChild?.invoiceId ??
          null,
        blockMessage: blockMessages[0] ?? null,
        blockMessages,
      };
    });
}

export function buildSettlementHistoryViewModel(input: {
  history: readonly SettlementHistoryEventInput[];
}): SettlementHistoryViewModel[] {
  return [...input.history]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      subtitle: `${entry.description} · ${entry.childDocNumber}`,
      timestamp: entry.timestamp,
      kind: entry.kind,
    }));
}
