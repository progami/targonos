import type { AuditException, NormalizedAuditTransaction } from './types';

function pushFinding(
  out: AuditException[],
  tx: NormalizedAuditTransaction,
  ruleId: AuditException['ruleId'],
  ruleGroup: AuditException['ruleGroup'],
  severity: AuditException['severity'],
  exceptionMessage: string,
  suggestedFix: string,
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
    supportStatus: tx.attachmentFileNames.length > 0 ? 'attached' : 'missing',
    reconciledPeriodRisk: tx.isInReconciledPeriod ? 'yes' : 'no',
  });
}

export function classifyAuditExceptions(transactions: NormalizedAuditTransaction[]): AuditException[] {
  const findings: AuditException[] = [];

  for (const tx of transactions) {
    if (tx.docNumber === null || tx.docNumber.trim() === '') {
      pushFinding(findings, tx, 'DOCNUMBER_MISSING', 'field_completeness', 'High', 'DocNumber is missing.', 'Populate DocNumber.');
    }
    if (tx.transactionType === 'Bill' && (tx.dueDate === null || tx.dueDate.trim() === '')) {
      pushFinding(findings, tx, 'BILL_DUE_DATE_MISSING', 'field_completeness', 'High', 'Bill due date is missing.', 'Populate DueDate.');
    }
    if (tx.lineDescriptions.some((description) => description.trim() === '')) {
      pushFinding(
        findings,
        tx,
        'LINE_DESCRIPTION_MISSING',
        'field_completeness',
        'High',
        'One or more line descriptions are blank.',
        'Add meaningful line descriptions.',
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
      );
    }
    if (
      tx.privateNote?.toLowerCase().includes('transfer') &&
      tx.transactionType === 'Purchase' &&
      tx.postingAccounts.some((account) => account.includes('expenses'))
    ) {
      pushFinding(
        findings,
        tx,
        'TRANSFER_LIKE_ACTIVITY_MISPOSTED',
        'chart_of_accounts_sanity',
        'Critical',
        'Transfer-like activity is posted to a P&L account.',
        'Rebuild as transfer-style activity.',
      );
    }
  }

  return findings;
}
