import type { InventoryComponent, LedgerBlock } from '@/lib/inventory/ledger';

export type ProcessingBlock =
  | LedgerBlock
  | {
      code:
        | 'MISSING_SETUP'
        | 'MISSING_SKU_MAPPING'
        | 'MISSING_ACCOUNT_MAPPING'
        | 'MISSING_BRAND_SUBACCOUNT'
        | 'ALREADY_PROCESSED'
        | 'INVOICE_CONFLICT'
        | 'ORDER_ALREADY_PROCESSED'
        | 'REFUND_UNMATCHED'
        | 'REFUND_PARTIAL'
        | 'BILLS_FETCH_ERROR'
        | 'BILLS_PARSE_ERROR'
        | 'PNL_ALLOCATION_ERROR';
      message: string;
      details?: Record<string, string | number>;
    };

const NON_BLOCKING_PROCESSING_CODES = new Set([
  'PNL_ALLOCATION_ERROR',
  'LATE_COST_ON_HAND_ZERO',
  'MISSING_COST_BASIS',
]);

export function isBlockingProcessingCode(code: string): boolean {
  return !NON_BLOCKING_PROCESSING_CODES.has(code);
}

export function isBlockingProcessingBlock(block: { code: string }): boolean {
  return isBlockingProcessingCode(block.code);
}

export type ProcessingSale = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
  principalCents: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type ProcessingReturn = {
  orderId: string;
  sku: string;
  date: string;
  quantity: number;
  principalCents: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type KnownLedgerEvent = {
  date: string;
  orderId: string;
  sku: string;
  units: number;
  costByComponentCents: Record<InventoryComponent, number>;
};

export type JournalEntryLinePreview = {
  accountId: string;
  accountName: string;
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

  invoiceId: string;
  processingHash: string;

  minDate: string;
  maxDate: string;

  blocks: ProcessingBlock[];

  sales: ProcessingSale[];
  returns: ProcessingReturn[];

  cogsByBrandComponentCents: Record<string, Record<InventoryComponent, number>>;
  pnlByBucketBrandCents: Record<string, Record<string, number>>;

  cogsJournalEntry: JournalEntryPreview;
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
