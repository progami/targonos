export const CASHFLOW_HORIZON_WEEKS = 13;

export type CashflowEventSource =
  | 'open_bill'
  | 'open_invoice'
  | 'recurring'
  | 'projected_settlement'
  | 'manual_adjustment';

export type CashflowEvent = {
  date: string;
  amountCents: number;
  label: string;
  source: CashflowEventSource;
  meta?: Record<string, unknown>;
};

export type CashflowWeek = {
  weekStart: string;
  weekEnd: string;
  startingCashCents: number;
  inflowsCents: number;
  outflowsCents: number;
  endingCashCents: number;
  events: CashflowEvent[];
};

export type CashflowWarning = {
  code: string;
  message: string;
  detail?: string;
};

export type CashflowAccountInput = {
  id: string;
  name: string;
  accountType: string;
  accountSubType: string | null;
  active: boolean;
  currencyCode: string | null;
  currentBalanceCents: number;
};

export type CashflowOpenBillInput = {
  id: string;
  vendorName: string | null;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  balanceCents: number;
  totalAmtCents: number;
  currencyCode: string | null;
  exchangeRate: number | null;
};

export type CashflowOpenInvoiceInput = {
  id: string;
  customerName: string | null;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  balanceCents: number;
  totalAmtCents: number;
  currencyCode: string | null;
  exchangeRate: number | null;
};

export type CashflowRecurringInput = {
  id: string;
  name: string;
  active: boolean;
  intervalType: string | null;
  numInterval: number | null;
  nextDate: string | null;
  templateType: 'Purchase' | 'Transfer' | 'Unknown';
  amountCents: number | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  cashImpactCents: number | null;
};

export type CashflowSettlementHistoryInput = {
  journalEntryId: string;
  channel: 'US' | 'UK';
  docNumber: string;
  txnDate: string;
  periodEnd: string | null;
  cashImpactCents: number | null;
};

export type CashflowProjectedSettlementInput = {
  channel: 'US' | 'UK';
  date: string;
  amountCents: number;
  basedOnCount: number;
  intervalDays: number;
  lagDays: number;
};

export type CashflowAdjustmentInput = {
  id: string;
  date: string;
  amountCents: number;
  description: string;
  notes: string | null;
};

export type CashflowSnapshotInputs = {
  accounts: CashflowAccountInput[];
  startingCashCents: number;
  openBills: CashflowOpenBillInput[];
  openInvoices: CashflowOpenInvoiceInput[];
  recurringTransactions: CashflowRecurringInput[];
  settlementHistory: CashflowSettlementHistoryInput[];
  projectedSettlements: CashflowProjectedSettlementInput[];
  adjustments: CashflowAdjustmentInput[];
};

export type CashflowForecastSummary = {
  minCashCents: number;
  minCashWeekStart: string;
  endCashCents: number;
};

export type CashflowForecastResult = {
  asOfDate: string;
  weekStartsOn: number;
  horizonWeeks: number;
  startingCashCents: number;
  weeks: CashflowWeek[];
  summary: CashflowForecastSummary;
};

export type CashflowEffectiveConfig = {
  cashAccountIds: string[];
  weekStartsOn: number;
  settlementLookbackDays: number;
  settlementAverageCount: number;
  settlementDefaultIntervalDays: number;
  includeProjectedSettlements: boolean;
  includeOpenBills: boolean;
  includeOpenInvoices: boolean;
  includeRecurring: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshTimeLocal: string;
  autoRefreshMinSnapshotAgeMinutes: number;
};

export type CashflowSnapshotPayload = {
  id?: string;
  createdAt?: string;
  asOfDate: string;
  currencyCode: string;
  config: CashflowEffectiveConfig;
  inputs: CashflowSnapshotInputs;
  forecast: CashflowForecastResult;
  warnings: CashflowWarning[];
};

export const CASHFLOW_SOURCE_LABELS: Record<CashflowEventSource, string> = {
  open_bill: 'Open Bills',
  open_invoice: 'Open Invoices',
  recurring: 'Recurring',
  projected_settlement: 'Projected Settlements',
  manual_adjustment: 'Manual Adjustments',
};
