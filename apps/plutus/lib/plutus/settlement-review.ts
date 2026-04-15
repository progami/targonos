import { getSettlementDisplayId } from './settlement-display';
import type { AuditInvoiceResolution } from './audit-invoice-resolution';
import { isBlockingProcessingCode } from './settlement-types';

type PlutusSettlementStatus = 'Pending' | 'Processed' | 'RolledBack';
export type SettlementPostingBlockSeverity = 'blocked' | 'warning';
export type SettlementPostingBlockState = 'blocked' | 'warning' | 'ready';

export type SettlementListRowViewModel = {
  title: string;
  subtitle: string;
  statusText: PlutusSettlementStatus;
  warningText: string | null;
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
  hasInconsistency: boolean;
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
  resolutionMessage: string | null;
  blockState: SettlementPostingBlockState;
  blocks: Array<{
    code: string;
    message: string;
    severity: SettlementPostingBlockSeverity;
  }>;
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

function compareNullableIsoDay(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function mapPreviewBlockSeverity(code: string): SettlementPostingBlockSeverity {
  return isBlockingProcessingCode(code) ? 'blocked' : 'warning';
}

function summarizeBlockState(blocks: Array<{ severity: SettlementPostingBlockSeverity }>): SettlementPostingBlockState {
  const hasBlocked = blocks.some((block) => block.severity === 'blocked');
  if (hasBlocked) return 'blocked';

  const hasWarning = blocks.some((block) => block.severity === 'warning');
  if (hasWarning) return 'warning';

  return 'ready';
}

function buildSectionBlocks(input: {
  previewChild: SettlementPostingSectionPreviewChildInput | undefined;
  invoiceResolution: AuditInvoiceResolution;
  invoiceResolutionMessage: string;
}): Array<{ code: string; message: string; severity: SettlementPostingBlockSeverity }> {
  if (input.invoiceResolution.status === 'unresolved') {
    return [
      {
        code: 'INVOICE_RESOLUTION',
        message: input.invoiceResolutionMessage,
        severity: 'blocked',
      },
    ];
  }

  if (input.previewChild === undefined) {
    return [];
  }

  return input.previewChild.preview.blocks.map((block) => ({
    code: block.code,
    message: block.message,
    severity: mapPreviewBlockSeverity(block.code),
  }));
}

function buildBlockMessages(blocks: Array<{ message: string }>): string[] {
  return blocks.map((block) => block.message);
}

export function buildSettlementListRowViewModel(input: SettlementListRowViewModelInput): SettlementListRowViewModel {
  const title = getSettlementDisplayId({
    sourceSettlementId: input.sourceSettlementId,
    childDocNumbers: input.children.map((child) => child.docNumber),
  });

  const subtitleParts = [input.marketplace.label];
  if (input.isSplit && input.splitCount > 1) {
    subtitleParts.push('split across month-end', `${input.splitCount} postings`);
  }

  return {
    title,
    subtitle: subtitleParts.join(' · '),
    statusText: input.plutusStatus,
    warningText: input.hasInconsistency ? 'Child posting states need review' : null,
  };
}

export function buildSettlementPostingSectionViewModels(
  input: SettlementPostingSectionInput,
  preview: SettlementPostingPreviewInput | null,
): SettlementPostingSectionViewModel[] {
  const previewById = new Map(
    preview === null ? [] : preview.children.map((child) => [child.qboJournalEntryId, child] as const),
  );

  return [...input.children]
    .sort((a, b) => {
      const periodCmp = compareNullableIsoDay(a.periodStart, b.periodStart);
      if (periodCmp !== 0) return periodCmp;
      return a.docNumber.localeCompare(b.docNumber);
    })
    .map((child) => {
      const previewChild = previewById.get(child.qboJournalEntryId);
      const blocks = buildSectionBlocks({
        previewChild,
        invoiceResolution: child.invoiceResolution,
        invoiceResolutionMessage: child.invoiceResolutionMessage,
      });
      const blockMessages = buildBlockMessages(blocks);

      return {
        qboJournalEntryId: child.qboJournalEntryId,
        docNumber: child.docNumber,
        periodStart: child.periodStart,
        periodEnd: child.periodEnd,
        postedDate: child.postedDate,
        settlementTotal: child.settlementTotal,
        plutusStatus: child.plutusStatus,
        invoiceId: (() => {
          if (child.invoiceResolution.status === 'resolved') return child.invoiceResolution.invoiceId;
          if (child.processing !== null) return child.processing.invoiceId;
          if (child.rollback !== null) return child.rollback.invoiceId;
          if (previewChild !== undefined) return previewChild.invoiceId;
          return null;
        })(),
        resolutionMessage: child.invoiceResolution.status === 'resolved' ? child.invoiceResolutionMessage : null,
        blockState: summarizeBlockState(blocks),
        blocks,
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
