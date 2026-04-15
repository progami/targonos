import type { QboBill, QboJournalEntry, QboPurchase } from '@/lib/qbo/api';
import type { NormalizedAuditTransaction } from './types';

type QboTransfer = {
  Id: string;
  TxnDate: string;
  Amount: number;
  CurrencyRef?: {
    value?: string;
  };
  DocNumber?: string;
  PrivateNote?: string;
  FromAccountRef?: {
    name?: string;
  };
  ToAccountRef?: {
    name?: string;
  };
  MetaData?: {
    LastUpdatedTime?: string;
  };
};

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

function collectBillPostingAccounts(bill: QboBill): string[] {
  const accounts: string[] = [];

  for (const line of bill.Line ?? []) {
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

function collectTransferPostingAccounts(transfer: QboTransfer): string[] {
  const accountNames = [
    transfer.FromAccountRef?.name ?? null,
    transfer.ToAccountRef?.name ?? null,
  ];

  return accountNames.filter((accountName): accountName is string => accountName !== null);
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
    isInReconciledPeriod: null,
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
    isInReconciledPeriod: null,
    lastUpdatedTime: journalEntry.MetaData?.LastUpdatedTime ?? null,
    sourceTag: null,
  };
}

export function normalizeBillForAudit(
  bill: QboBill,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'Bill',
    transactionId: bill.Id,
    txnDate: bill.TxnDate,
    amount: bill.TotalAmt,
    currency: bill.CurrencyRef?.value ?? null,
    counterparty: bill.VendorRef?.name ?? null,
    docNumber: bill.DocNumber ?? null,
    privateNote: bill.PrivateNote ?? null,
    dueDate: bill.DueDate ?? null,
    postingAccounts: collectBillPostingAccounts(bill),
    lineDescriptions: collectLineDescriptions(bill.Line ?? []),
    attachmentFileNames,
    isInReconciledPeriod: null,
    lastUpdatedTime: bill.MetaData?.LastUpdatedTime ?? null,
    sourceTag: null,
  };
}

export function normalizeTransferForAudit(
  transfer: QboTransfer,
  attachmentFileNames: string[],
): NormalizedAuditTransaction {
  return {
    transactionType: 'Transfer',
    transactionId: transfer.Id,
    txnDate: transfer.TxnDate,
    amount: transfer.Amount,
    currency: transfer.CurrencyRef?.value ?? null,
    counterparty: null,
    docNumber: transfer.DocNumber ?? null,
    privateNote: transfer.PrivateNote ?? null,
    dueDate: null,
    postingAccounts: collectTransferPostingAccounts(transfer),
    lineDescriptions: [],
    attachmentFileNames,
    isInReconciledPeriod: null,
    lastUpdatedTime: transfer.MetaData?.LastUpdatedTime ?? null,
    sourceTag: null,
  };
}
