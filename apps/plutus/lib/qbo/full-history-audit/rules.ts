import type { AuditException, NormalizedAuditTransaction } from './types';

const FOREIGN_CURRENCY_CODES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'MXN'];

function pushFinding(
  out: AuditException[],
  tx: NormalizedAuditTransaction,
  ruleId: AuditException['ruleId'],
  ruleGroup: AuditException['ruleGroup'],
  severity: AuditException['severity'],
  exceptionMessage: string,
  suggestedFix: string,
  supportStatus: AuditException['supportStatus'],
): void {
  out.push({
    transactionType: tx.transactionType,
    transactionId: tx.transactionId,
    txnDate: tx.txnDate,
    amount: tx.amount,
    currency: tx.currency,
    counterparty: tx.counterparty,
    postingAccountSummary: tx.postingAccounts.join(' | '),
    ruleId,
    ruleGroup,
    severity,
    exceptionMessage,
    suggestedFix,
    supportStatus,
    reconciledPeriodRisk: tx.isInReconciledPeriod ? 'yes' : 'no',
  });
}

function looksTransferLike(tx: NormalizedAuditTransaction): boolean {
  const text = `${tx.privateNote || ''} ${tx.lineDescriptions.join(' ')}`.toLowerCase();
  return text.includes('transfer') || text.includes('wise') || text.includes('funding');
}

function containsControlAccount(tx: NormalizedAuditTransaction): boolean {
  return tx.postingAccounts.some((account) =>
    account.includes('Settlement Control') || account.includes('Clearing') || account.includes('Suspense'),
  );
}

function duplicateKey(tx: NormalizedAuditTransaction): string {
  return [tx.transactionType, tx.txnDate, tx.amount.toFixed(2), tx.counterparty || ''].join('::');
}

function isOwnerEquityAccount(account: string): boolean {
  const lower = account.toLowerCase();
  return lower.includes('owner draws') || lower.includes('equity');
}

function isBankFeeAccount(account: string): boolean {
  const lower = account.toLowerCase();
  return lower.includes('bank fees') || lower.includes('service charges');
}

function mentionsDifferentCurrency(tx: NormalizedAuditTransaction): boolean {
  if (tx.currency === null) {
    return false;
  }

  const text = `${tx.counterparty || ''} ${tx.privateNote || ''} ${tx.lineDescriptions.join(' ')}`.toUpperCase();
  for (const currencyCode of FOREIGN_CURRENCY_CODES) {
    if (text.includes(currencyCode) && currencyCode !== tx.currency.toUpperCase()) {
      return true;
    }
  }

  return false;
}

export function classifyAuditExceptions(transactions: NormalizedAuditTransaction[]): AuditException[] {
  const findings: AuditException[] = [];
  const duplicateCounts = new Map<string, number>();

  for (const tx of transactions) {
    const key = duplicateKey(tx);
    duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  }

  for (const tx of transactions) {
    if (
      (tx.transactionType === 'Bill' ||
        tx.transactionType === 'Purchase' ||
        tx.transactionType === 'Invoice') &&
      (tx.docNumber === null || tx.docNumber.trim() === '')
    ) {
      pushFinding(
        findings,
        tx,
        'DOCNUMBER_MISSING',
        'field_completeness',
        'High',
        'DocNumber is missing.',
        'Populate DocNumber.',
        'not_required',
      );
    }
    if (tx.transactionType === 'Bill' && tx.attachmentFileNames.length === 0) {
      pushFinding(
        findings,
        tx,
        'ATTACHMENT_REQUIRED_MISSING',
        'attachment_controls',
        'High',
        'Bill has no attachment.',
        'Attach the supporting invoice.',
        'missing',
      );
    }

    if (duplicateCounts.get(duplicateKey(tx))! > 1) {
      pushFinding(
        findings,
        tx,
        'LIKELY_DUPLICATE',
        'transaction_logic',
        'Critical',
        'Possible duplicate transaction.',
        'Review and remove duplicate posting.',
        'not_required',
      );
    }

    if (containsControlAccount(tx) && tx.txnDate < '2026-01-01') {
      pushFinding(
        findings,
        tx,
        'UNRESOLVED_CONTROL_ACCOUNT_ACTIVITY',
        'control_exceptions',
        'High',
        'Old unresolved control-account activity remains posted.',
        'Resolve or document the control-account balance.',
        'not_required',
      );
    }

    if (
      tx.counterparty?.toLowerCase().includes('owner') &&
      !tx.postingAccounts.some((account) => isOwnerEquityAccount(account))
    ) {
      pushFinding(
        findings,
        tx,
        'OWNER_ACTIVITY_MISCLASSIFIED',
        'chart_of_accounts_sanity',
        'Critical',
        'Owner activity is not posted to owner draw/equity.',
        'Reclass owner activity to owner draw/equity.',
        'not_required',
      );
    }

    if (
      tx.counterparty?.toLowerCase().includes('chase') &&
      tx.lineDescriptions.join(' ').toLowerCase().includes('fee') &&
      !tx.postingAccounts.some((account) => isBankFeeAccount(account))
    ) {
      pushFinding(
        findings,
        tx,
        'BANK_FEE_MISCLASSIFIED',
        'chart_of_accounts_sanity',
        'High',
        'Bank fee is not posted to a fee account.',
        'Reclass to bank fees and service charges.',
        'not_required',
      );
    }

    if (mentionsDifferentCurrency(tx)) {
      pushFinding(
        findings,
        tx,
        'CURRENCY_COUNTERPARTY_MISMATCH',
        'transaction_logic',
        'High',
        'Transaction currency does not match the counterparty context.',
        'Verify the currency and reclassify if needed.',
        'not_required',
      );
    }

    if (looksTransferLike(tx) && tx.postingAccounts.some((account) => account.toLowerCase().includes('expenses'))) {
      pushFinding(
        findings,
        tx,
        'TRANSFER_LIKE_ACTIVITY_MISPOSTED',
        'chart_of_accounts_sanity',
        'Critical',
        'Transfer-like activity is posted to a P&L account.',
        'Rebuild as transfer-style activity.',
        'not_required',
      );
    }
  }

  return findings;
}
