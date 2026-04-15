export type AuditSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type AuditTransactionType = 'Purchase' | 'Bill' | 'Transfer' | 'JournalEntry' | 'BillPayment' | 'Invoice';

export type AuditRuleId =
  | 'DOCNUMBER_MISSING'
  | 'PRIVATE_NOTE_MISSING'
  | 'LINE_DESCRIPTION_MISSING'
  | 'COUNTERPARTY_MISSING'
  | 'BILL_DUE_DATE_MISSING'
  | 'ATTACHMENT_REQUIRED_MISSING'
  | 'TRANSFER_LIKE_ACTIVITY_MISPOSTED'
  | 'OWNER_ACTIVITY_MISCLASSIFIED'
  | 'BANK_FEE_MISCLASSIFIED'
  | 'CURRENCY_COUNTERPARTY_MISMATCH'
  | 'LIKELY_DUPLICATE'
  | 'UNRESOLVED_CONTROL_ACCOUNT_ACTIVITY'
  | 'POST_RECONCILE_MODIFICATION';

export interface NormalizedAuditTransaction {
  transactionType: AuditTransactionType;
  transactionId: string;
  txnDate: string;
  amount: number;
  currency: string | null;
  counterparty: string | null;
  docNumber: string | null;
  privateNote: string | null;
  dueDate: string | null;
  postingAccounts: string[];
  lineDescriptions: string[];
  attachmentFileNames: string[];
  isInReconciledPeriod: boolean | null;
  lastUpdatedTime: string | null;
  sourceTag: string | null;
}

export interface AuditException {
  transactionType: AuditTransactionType;
  transactionId: string;
  txnDate: string;
  amount: number;
  currency: string | null;
  counterparty: string | null;
  postingAccountSummary: string;
  ruleId: AuditRuleId;
  ruleGroup: string;
  severity: AuditSeverity;
  exceptionMessage: string;
  suggestedFix: string;
  supportStatus: 'attached' | 'missing' | 'not_required' | 'unknown';
  reconciledPeriodRisk: 'yes' | 'no' | 'unknown';
}
