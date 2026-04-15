import type { AuditException, NormalizedAuditTransaction } from './types';

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

export function classifyAuditExceptions(transactions: NormalizedAuditTransaction[]): AuditException[] {
  const findings: AuditException[] = [];

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
    if (
      tx.privateNote?.toLowerCase().includes('transfer') &&
      tx.transactionType === 'Purchase' &&
      tx.postingAccounts.some((account) => account.toLowerCase().includes('expense'))
    ) {
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
