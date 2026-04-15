import type { QboJournalEntry, QboPurchase } from '@/lib/qbo/api';
import type { NormalizedAuditTransaction } from './types';

function collectPurchasePostingAccounts(purchase: QboPurchase): string[] {
  const accounts: string[] = [];

  for (const line of purchase.Line ?? []) {
    const accountName =
      line.AccountBasedExpenseLineDetail?.AccountRef.name ??
      line.ItemBasedExpenseLineDetail?.AccountRef?.name ??
      null;

    if (accountName !== null) {
      accounts.push(accountName);
    }
  }

  return accounts;
}

function collectJournalEntryPostingAccounts(journalEntry: QboJournalEntry): string[] {
  return journalEntry.Line.map((line) => line.JournalEntryLineDetail.AccountRef.name ?? '');
}

function collectLineDescriptions(lines: Array<{ Description?: string }>): string[] {
  const descriptions: string[] = [];

  for (const line of lines) {
    if (line.Description !== undefined) {
      descriptions.push(line.Description);
    }
  }

  return descriptions;
}

export function normalizePurchaseForAudit(
  purchase: QboPurchase,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'Purchase',
    transactionId: purchase.Id,
    txnDate: purchase.TxnDate,
    amount: purchase.TotalAmt,
    currency: purchase.CurrencyRef?.value ?? null,
    counterparty: purchase.EntityRef?.name ?? null,
    docNumber: purchase.DocNumber ?? null,
    privateNote: purchase.PrivateNote ?? null,
    dueDate: null,
    postingAccounts: collectPurchasePostingAccounts(purchase),
    lineDescriptions: collectLineDescriptions(purchase.Line ?? []),
    attachmentFileNames,
    isInReconciledPeriod: false,
    lastUpdatedTime: purchase.MetaData?.LastUpdatedTime ?? null,
    sourceTag: null,
  };
}

export function normalizeJournalEntryForAudit(
  journalEntry: QboJournalEntry,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'JournalEntry',
    transactionId: journalEntry.Id,
    txnDate: journalEntry.TxnDate,
    amount: journalEntry.Line.reduce((sum, line) => sum + (line.Amount ?? 0), 0) / 2,
    currency: journalEntry.CurrencyRef?.value ?? null,
    counterparty: null,
    docNumber: journalEntry.DocNumber ?? null,
    privateNote: journalEntry.PrivateNote ?? null,
    dueDate: null,
    postingAccounts: collectJournalEntryPostingAccounts(journalEntry),
    lineDescriptions: collectLineDescriptions(journalEntry.Line),
    attachmentFileNames,
    isInReconciledPeriod: false,
    lastUpdatedTime: journalEntry.MetaData?.LastUpdatedTime ?? null,
    sourceTag: null,
  };
}

export function normalizeBillForAudit(
  bill: any,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'Bill',
    transactionId: bill.Id,
    txnDate: bill.TxnDate,
    amount: bill.TotalAmt,
    currency: bill.CurrencyRef?.value || null,
    counterparty: bill.VendorRef?.name || null,
    docNumber: bill.DocNumber || null,
    privateNote: bill.PrivateNote || null,
    dueDate: bill.DueDate || null,
    postingAccounts: (bill.Line || [])
      .map((line: any) => line.AccountBasedExpenseLineDetail?.AccountRef?.name || '')
      .filter(Boolean),
    lineDescriptions: (bill.Line || []).map((line: any) => line.Description || ''),
    attachmentFileNames,
    isInReconciledPeriod: false,
    lastUpdatedTime: bill.MetaData?.LastUpdatedTime || null,
    sourceTag: null,
  };
}

export function normalizeTransferForAudit(
  transfer: any,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'Transfer',
    transactionId: transfer.Id,
    txnDate: transfer.TxnDate,
    amount: transfer.Amount,
    currency: transfer.CurrencyRef?.value || null,
    counterparty: null,
    docNumber: transfer.DocNumber || null,
    privateNote: transfer.PrivateNote || null,
    dueDate: null,
    postingAccounts: [transfer.FromAccountRef?.name || '', transfer.ToAccountRef?.name || ''].filter(Boolean),
    lineDescriptions: [],
    attachmentFileNames,
    isInReconciledPeriod: false,
    lastUpdatedTime: transfer.MetaData?.LastUpdatedTime || null,
    sourceTag: null,
  };
}
