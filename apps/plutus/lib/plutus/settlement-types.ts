export type ProcessingBlock = {
  code:
    | 'MISSING_SETUP'
    | 'AUDIT_NET_SCALE_SUSPECT'
    | 'ALREADY_PROCESSED'
    | 'INVOICE_CONFLICT'
    | 'COGS_INSUFFICIENT_READY_LAYER';
  message: string;
  details?: Record<string, string | number>;
};

export function isBlockingProcessingCode(code: string): boolean {
  return code.trim() !== '';
}

export function isBlockingProcessingBlock(block: { code: string }): boolean {
  return isBlockingProcessingCode(block.code);
}

export type JournalEntryLinePreview = {
  accountId: string;
  accountName: string;
  accountFullyQualifiedName?: string;
  accountNumber?: string;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  description: string;
};

export type JournalEntryPreview = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: JournalEntryLinePreview[];
};

export type SettlementProcessingPreview = {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;
  // The ExchangeRate from the settlement JE in QBO (when the settlement currency is not the QBO home currency).
  // Reclass postings reuse this so parent-account reclasses net to zero in home currency.
  settlementExchangeRate?: number;

  invoiceId: string;
  processingHash: string;

  minDate: string;
  maxDate: string;

  blocks: ProcessingBlock[];

  pnlByBucketBrandCents: Record<string, Record<string, number>>;

  pnlJournalEntry: JournalEntryPreview;
};

export type SettlementProcessingResult =
  | { ok: false; preview: SettlementProcessingPreview }
  | {
      ok: true;
      preview: SettlementProcessingPreview;
      posted: {
        cogsJournalEntryId: string;
        pnlJournalEntryId: string;
      };
    };
