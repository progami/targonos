import type {
  QboBill,
  QboInvoice,
  QboRecurringTransaction,
} from '@/lib/qbo/api';
import { addDays, addMonths, addWeeks, compareDateStrings } from '@/lib/plutus/cashflow/date';
import type {
  CashflowEvent,
  CashflowOpenBillInput,
  CashflowOpenInvoiceInput,
  CashflowRecurringInput,
  CashflowWarning,
} from '@/lib/plutus/cashflow/types';

function toCents(amount: number | undefined): number {
  if (amount === undefined) {
    return 0;
  }
  return Math.round(amount * 100);
}

function resolveDueDate(input: {
  dueDate: string | undefined;
  txnDate: string;
  asOfDate: string;
  warningCode: string;
  warningLabel: string;
  warnings: CashflowWarning[];
}): string {
  const { dueDate, txnDate, asOfDate, warningCode, warningLabel, warnings } = input;
  let date = dueDate;

  if (date === undefined) {
    warnings.push({
      code: warningCode,
      message: `${warningLabel} is missing DueDate; TxnDate was used instead.`,
    });
    date = txnDate;
  }

  if (compareDateStrings(date, asOfDate) < 0) {
    return asOfDate;
  }

  return date;
}

export function mapOpenBillsToEvents(input: {
  bills: QboBill[];
  asOfDate: string;
  warnings: CashflowWarning[];
}): { rows: CashflowOpenBillInput[]; events: CashflowEvent[] } {
  const rows: CashflowOpenBillInput[] = [];
  const events: CashflowEvent[] = [];

  for (const bill of input.bills) {
    const balanceCents = toCents(bill.Balance === undefined ? bill.TotalAmt : bill.Balance);
    const totalAmtCents = toCents(bill.TotalAmt);

    const row: CashflowOpenBillInput = {
      id: bill.Id,
      vendorName: bill.VendorRef?.name === undefined ? null : bill.VendorRef.name,
      docNumber: bill.DocNumber === undefined ? null : bill.DocNumber,
      txnDate: bill.TxnDate,
      dueDate: bill.DueDate === undefined ? null : bill.DueDate,
      balanceCents,
      totalAmtCents,
      currencyCode: bill.CurrencyRef?.value === undefined ? null : bill.CurrencyRef.value,
      exchangeRate: bill.ExchangeRate === undefined ? null : bill.ExchangeRate,
    };

    rows.push(row);

    const scheduledDate = resolveDueDate({
      dueDate: bill.DueDate,
      txnDate: bill.TxnDate,
      asOfDate: input.asOfDate,
      warningCode: 'OPEN_BILL_MISSING_DUEDATE',
      warningLabel: `Bill ${bill.DocNumber === undefined ? bill.Id : bill.DocNumber}`,
      warnings: input.warnings,
    });

    events.push({
      date: scheduledDate,
      amountCents: -Math.abs(balanceCents),
      label: `Bill ${bill.DocNumber === undefined ? bill.Id : bill.DocNumber}`,
      source: 'open_bill',
      meta: {
        id: bill.Id,
        vendorName: bill.VendorRef?.name,
        docNumber: bill.DocNumber,
      },
    });
  }

  return { rows, events };
}

export function mapOpenInvoicesToEvents(input: {
  invoices: QboInvoice[];
  asOfDate: string;
  warnings: CashflowWarning[];
}): { rows: CashflowOpenInvoiceInput[]; events: CashflowEvent[] } {
  const rows: CashflowOpenInvoiceInput[] = [];
  const events: CashflowEvent[] = [];

  for (const invoice of input.invoices) {
    const balanceCents = toCents(invoice.Balance === undefined ? invoice.TotalAmt : invoice.Balance);
    const totalAmtCents = toCents(invoice.TotalAmt);

    const row: CashflowOpenInvoiceInput = {
      id: invoice.Id,
      customerName: invoice.CustomerRef?.name === undefined ? null : invoice.CustomerRef.name,
      docNumber: invoice.DocNumber === undefined ? null : invoice.DocNumber,
      txnDate: invoice.TxnDate,
      dueDate: invoice.DueDate === undefined ? null : invoice.DueDate,
      balanceCents,
      totalAmtCents,
      currencyCode: invoice.CurrencyRef?.value === undefined ? null : invoice.CurrencyRef.value,
      exchangeRate: invoice.ExchangeRate === undefined ? null : invoice.ExchangeRate,
    };

    rows.push(row);

    const scheduledDate = resolveDueDate({
      dueDate: invoice.DueDate,
      txnDate: invoice.TxnDate,
      asOfDate: input.asOfDate,
      warningCode: 'OPEN_INVOICE_MISSING_DUEDATE',
      warningLabel: `Invoice ${invoice.DocNumber === undefined ? invoice.Id : invoice.DocNumber}`,
      warnings: input.warnings,
    });

    events.push({
      date: scheduledDate,
      amountCents: Math.abs(balanceCents),
      label: `Invoice ${invoice.DocNumber === undefined ? invoice.Id : invoice.DocNumber}`,
      source: 'open_invoice',
      meta: {
        id: invoice.Id,
        customerName: invoice.CustomerRef?.name,
        docNumber: invoice.DocNumber,
      },
    });
  }

  return { rows, events };
}

function advanceDateByInterval(input: {
  date: string;
  intervalType: string;
  numInterval: number;
  dayOfMonth?: number;
}): string {
  const { date, intervalType, numInterval, dayOfMonth } = input;

  if (intervalType === 'Daily') {
    return addDays(date, numInterval);
  }

  if (intervalType === 'Weekly') {
    return addWeeks(date, numInterval);
  }

  if (intervalType === 'Monthly') {
    return addMonths(date, numInterval, dayOfMonth);
  }

  if (intervalType === 'Yearly') {
    return addMonths(date, numInterval * 12, dayOfMonth);
  }

  throw new Error(`Unsupported interval type: ${intervalType}`);
}

function mapRecurringCashImpact(input: {
  recurring: QboRecurringTransaction;
  cashAccountIdSet: Set<string>;
  warnings: CashflowWarning[];
}): {
  templateType: CashflowRecurringInput['templateType'];
  amountCents: number | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  cashImpactCents: number | null;
} {
  const recurring = input.recurring;

  if (recurring.Purchase !== undefined) {
    const accountId = recurring.Purchase.AccountRef?.value;
    const amount = recurring.Purchase.TotalAmt;
    const amountCents = amount === undefined ? null : Math.round(amount * 100);

    if (accountId === undefined) {
      input.warnings.push({
        code: 'RECURRING_PURCHASE_MISSING_ACCOUNT',
        message: `Recurring transaction ${recurring.Id} purchase template is missing AccountRef.`,
      });
      return {
        templateType: 'Purchase',
        amountCents,
        fromAccountId: null,
        toAccountId: null,
        cashImpactCents: null,
      };
    }

    let cashImpactCents: number | null = null;
    if (input.cashAccountIdSet.has(accountId)) {
      if (amountCents !== null) {
        cashImpactCents = -Math.abs(amountCents);
      }
    }

    return {
      templateType: 'Purchase',
      amountCents,
      fromAccountId: accountId,
      toAccountId: null,
      cashImpactCents,
    };
  }

  if (recurring.Transfer !== undefined) {
    const amount = recurring.Transfer.Amount;
    const amountCents = amount === undefined ? null : Math.round(amount * 100);
    const fromAccountId = recurring.Transfer.FromAccountRef?.value;
    const toAccountId = recurring.Transfer.ToAccountRef?.value;

    if (fromAccountId === undefined || toAccountId === undefined) {
      input.warnings.push({
        code: 'RECURRING_TRANSFER_MISSING_ACCOUNTS',
        message: `Recurring transaction ${recurring.Id} transfer template is missing FromAccountRef or ToAccountRef.`,
      });
      return {
        templateType: 'Transfer',
        amountCents,
        fromAccountId: fromAccountId === undefined ? null : fromAccountId,
        toAccountId: toAccountId === undefined ? null : toAccountId,
        cashImpactCents: null,
      };
    }

    const includesFrom = input.cashAccountIdSet.has(fromAccountId);
    const includesTo = input.cashAccountIdSet.has(toAccountId);

    let cashImpactCents: number | null = null;
    if (amountCents !== null) {
      if (includesFrom && includesTo) {
        cashImpactCents = 0;
      } else if (includesFrom && !includesTo) {
        cashImpactCents = -Math.abs(amountCents);
      } else if (!includesFrom && includesTo) {
        cashImpactCents = Math.abs(amountCents);
      }
    }

    return {
      templateType: 'Transfer',
      amountCents,
      fromAccountId,
      toAccountId,
      cashImpactCents,
    };
  }

  input.warnings.push({
    code: 'RECURRING_TEMPLATE_UNSUPPORTED',
    message: `Recurring transaction ${recurring.Id} has an unsupported template type.`,
  });

  return {
    templateType: 'Unknown',
    amountCents: null,
    fromAccountId: null,
    toAccountId: null,
    cashImpactCents: null,
  };
}

export function mapRecurringTransactionsToEvents(input: {
  recurringTransactions: QboRecurringTransaction[];
  horizonStart: string;
  horizonEnd: string;
  cashAccountIds: string[];
  warnings: CashflowWarning[];
}): { rows: CashflowRecurringInput[]; events: CashflowEvent[] } {
  const rows: CashflowRecurringInput[] = [];
  const events: CashflowEvent[] = [];
  const cashAccountIdSet = new Set(input.cashAccountIds);

  for (const recurring of input.recurringTransactions) {
    const recurringName = recurring.RecurringInfo?.Name;
    const isActive = recurring.RecurringInfo?.Active === true;
    const scheduleInfo = recurring.RecurringInfo?.ScheduleInfo;
    const intervalType = scheduleInfo?.IntervalType;
    const nextDate = scheduleInfo?.NextDate;
    const numIntervalRaw = scheduleInfo?.NumInterval;
    const numInterval = numIntervalRaw === undefined ? 1 : numIntervalRaw;

    const mapped = mapRecurringCashImpact({
      recurring,
      cashAccountIdSet,
      warnings: input.warnings,
    });

    rows.push({
      id: recurring.Id,
      name: recurringName === undefined ? `Recurring ${recurring.Id}` : recurringName,
      active: isActive,
      intervalType: intervalType === undefined ? null : intervalType,
      numInterval: numIntervalRaw === undefined ? null : numIntervalRaw,
      nextDate: nextDate === undefined ? null : nextDate,
      templateType: mapped.templateType,
      amountCents: mapped.amountCents,
      fromAccountId: mapped.fromAccountId,
      toAccountId: mapped.toAccountId,
      cashImpactCents: mapped.cashImpactCents,
    });

    if (!isActive) {
      continue;
    }

    if (nextDate === undefined) {
      input.warnings.push({
        code: 'RECURRING_MISSING_NEXT_DATE',
        message: `Recurring transaction ${recurring.Id} is active but missing ScheduleInfo.NextDate.`,
      });
      continue;
    }

    if (intervalType === undefined) {
      input.warnings.push({
        code: 'RECURRING_MISSING_INTERVAL_TYPE',
        message: `Recurring transaction ${recurring.Id} is active but missing ScheduleInfo.IntervalType.`,
      });
      continue;
    }

    if (numInterval < 1) {
      input.warnings.push({
        code: 'RECURRING_INVALID_INTERVAL',
        message: `Recurring transaction ${recurring.Id} has invalid NumInterval=${numInterval}.`,
      });
      continue;
    }

    if (
      intervalType !== 'Daily'
      && intervalType !== 'Weekly'
      && intervalType !== 'Monthly'
      && intervalType !== 'Yearly'
    ) {
      input.warnings.push({
        code: 'RECURRING_UNKNOWN_INTERVAL_TYPE',
        message: `Recurring transaction ${recurring.Id} has unsupported interval type ${intervalType}.`,
      });
      continue;
    }

    if (mapped.cashImpactCents === null) {
      continue;
    }

    let occurrence = nextDate;
    while (compareDateStrings(occurrence, input.horizonEnd) <= 0) {
      if (compareDateStrings(occurrence, input.horizonStart) >= 0 && mapped.cashImpactCents !== 0) {
        events.push({
          date: occurrence,
          amountCents: mapped.cashImpactCents,
          label: recurringName === undefined ? `Recurring ${recurring.Id}` : recurringName,
          source: 'recurring',
          meta: {
            recurringId: recurring.Id,
            templateType: mapped.templateType,
          },
        });
      }

      const nextOccurrence = advanceDateByInterval({
        date: occurrence,
        intervalType,
        numInterval,
        dayOfMonth: scheduleInfo?.DayOfMonth,
      });

      if (nextOccurrence === occurrence) {
        input.warnings.push({
          code: 'RECURRING_STUCK_SCHEDULE',
          message: `Recurring transaction ${recurring.Id} did not advance while expanding occurrences.`,
        });
        break;
      }

      occurrence = nextOccurrence;
    }
  }

  return { rows, events };
}
