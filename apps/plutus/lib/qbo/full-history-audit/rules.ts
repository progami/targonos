import type { AuditException, NormalizedAuditTransaction } from './types';

const FOREIGN_CURRENCY_CODES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'MXN'];
const FEE_CUES = ['fee', 'fees', 'service charge', 'service charges', 'monthly fee', 'card fee', 'processing fee', 'maintenance fee'];
const BANK_CARD_CUES = [
  'bank',
  'card',
  'credit card',
  'debit card',
  'visa',
  'mastercard',
  'amex',
  'american express',
  'chase',
  'capital one',
  'wells fargo',
  'bank of america',
  'citibank',
  'paypal',
  'stripe',
  'square',
];
const ACCEPTED_FEE_ACCOUNT_CUES = [
  'bank fees',
  'service charges',
  'merchant processing fees',
  'merchant fees',
  'payment processing fees',
  'processor fees',
  'merchant service charges',
  'card processing fees',
  'credit card processing fees',
];
const DUPLICATE_FINDING_SEVERITY: AuditException['severity'] = 'High';

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
    reconciledPeriodRisk:
      tx.isInReconciledPeriod === true
        ? 'yes'
        : tx.isInReconciledPeriod === false
          ? 'no'
          : 'unknown',
  });
}

function containsControlAccount(tx: NormalizedAuditTransaction): boolean {
  return tx.postingAccounts.some((account) => {
    const lower = account.toLowerCase();
    return (
      lower.includes('settlement control') ||
      lower.includes('clearing') ||
      lower.includes('suspense')
    );
  });
}

function normalizeDuplicatePart(value: string | null): string {
  if (value === null) {
    return '';
  }

  return value.trim().toLowerCase();
}

function normalizeDuplicateList(values: string[]): string {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean).join('|');
}

function duplicateKey(tx: NormalizedAuditTransaction): string | null {
  const baseParts = [
    tx.transactionType,
    tx.txnDate,
    tx.amount.toFixed(2),
    normalizeDuplicatePart(tx.counterparty),
  ];
  const normalizedDocNumber = normalizeDuplicatePart(tx.docNumber);
  if (normalizedDocNumber !== '') {
    return [...baseParts, `doc:${normalizedDocNumber}`].join('::');
  }

  const evidenceParts = [
    normalizeDuplicatePart(tx.dueDate),
    normalizeDuplicateList(tx.postingAccounts),
    normalizeDuplicateList(tx.lineDescriptions),
    normalizeDuplicatePart(tx.privateNote),
  ];

  if (evidenceParts.every((value) => value === '')) {
    return null;
  }

  return [...baseParts, ...evidenceParts].join('::');
}

function isOwnerEquityAccount(account: string): boolean {
  const lower = account.toLowerCase();
  return lower.includes('owner draws') || lower.includes('equity');
}

function isBankFeeAccount(account: string): boolean {
  const lower = account.toLowerCase();
  return ACCEPTED_FEE_ACCOUNT_CUES.some((cue) => lower.includes(cue));
}

function isLikelyBankCardFee(tx: NormalizedAuditTransaction): boolean {
  const text = `${tx.counterparty || ''} ${tx.privateNote || ''} ${tx.lineDescriptions.join(' ')}`.toLowerCase();
  const hasFeeCue = FEE_CUES.some((cue) => text.includes(cue));
  const hasBankCardCue = BANK_CARD_CUES.some((cue) => text.includes(cue));
  return hasFeeCue && hasBankCardCue;
}

function parseAuditDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function inferAuditAsOfDate(transactions: NormalizedAuditTransaction[]): string | null {
  let latest = -Infinity;
  let latestDate: string | null = null;

  for (const tx of transactions) {
    const time = parseAuditDate(tx.txnDate);
    if (Number.isFinite(time) && time > latest) {
      latest = time;
      latestDate = tx.txnDate;
    }
  }

  return latestDate;
}

function isOlderThanDays(txnDate: string, asOfDate: string, staleDays: number): boolean {
  const ageMs = parseAuditDate(asOfDate) - parseAuditDate(txnDate);
  return Number.isFinite(ageMs) && ageMs > staleDays * 24 * 60 * 60 * 1000;
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

export interface AuditClassificationOptions {
  asOfDate?: string;
  staleControlAccountDays?: number;
}

export function classifyAuditExceptions(
  transactions: NormalizedAuditTransaction[],
  options: AuditClassificationOptions = {},
): AuditException[] {
  const findings: AuditException[] = [];
  const duplicateCounts = new Map<string, number>();
  const asOfDate = options.asOfDate ?? inferAuditAsOfDate(transactions);
  const staleControlAccountDays = options.staleControlAccountDays ?? 365;

  for (const tx of transactions) {
    const key = duplicateKey(tx);
    if (key === null) {
      continue;
    }

    duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
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

    const candidateDuplicateKey = duplicateKey(tx);
    if (candidateDuplicateKey !== null && (duplicateCounts.get(candidateDuplicateKey) ?? 0) > 1) {
      pushFinding(
        findings,
        tx,
        'LIKELY_DUPLICATE',
        'transaction_logic',
        DUPLICATE_FINDING_SEVERITY,
        'Possible duplicate transaction with matching audit fingerprint.',
        'Review for duplicate posting or document why repeated activity is legitimate.',
        'not_required',
      );
    }

    if (asOfDate !== null && containsControlAccount(tx) && isOlderThanDays(tx.txnDate, asOfDate, staleControlAccountDays)) {
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

    if (isLikelyBankCardFee(tx) && !tx.postingAccounts.some((account) => isBankFeeAccount(account))) {
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

  }

  return findings;
}
