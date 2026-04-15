import type { AuditException } from './types';

function escapeCsvField(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

export function buildAuditCsv(rows: readonly AuditException[]): string {
  const header = [
    'transaction_type',
    'transaction_id',
    'txn_date',
    'amount',
    'currency',
    'counterparty',
    'posting_account_summary',
    'rule_id',
    'rule_group',
    'severity',
    'exception_message',
    'suggested_fix',
    'support_status',
    'reconciled_period_risk',
  ];

  const body = rows.map((row) =>
    [
      row.transactionType,
      row.transactionId,
      row.txnDate,
      row.amount,
      row.currency ?? '',
      row.counterparty ?? '',
      row.postingAccountSummary,
      row.ruleId,
      row.ruleGroup,
      row.severity,
      row.exceptionMessage,
      row.suggestedFix,
      row.supportStatus,
      row.reconciledPeriodRisk,
    ]
      .map((value) => escapeCsvField(String(value)))
      .join(','),
  );

  return [header.join(','), ...body].join('\n');
}

export function buildAuditMarkdownSummary(
  rows: readonly AuditException[],
  scannedCounts: Record<string, number>,
): string {
  const severityTotals = rows.reduce<Record<string, number>>((acc, row) => {
    const current = acc[row.severity];
    acc[row.severity] = current === undefined ? 1 : current + 1;
    return acc;
  }, {});

  return [
    '# QBO Full-History Exception Audit',
    '',
    '## Transactions Scanned',
    ...Object.entries(scannedCounts).map(([type, count]) => `- ${type}: ${count}`),
    '',
    '## Exceptions By Severity',
    ...Object.entries(severityTotals).map(([severity, count]) => `- ${severity}: ${count}`),
    '',
    '## Top Findings',
    ...rows
      .slice(0, 20)
      .map((row) => `- ${row.severity} ${row.transactionType} ${row.transactionId}: ${row.exceptionMessage}`),
  ].join('\n');
}
