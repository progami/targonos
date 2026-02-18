import { addDays, compareDateStrings, daysBetween } from '@/lib/plutus/cashflow/date';
import type {
  CashflowEvent,
  CashflowProjectedSettlementInput,
  CashflowSettlementHistoryInput,
  CashflowWarning,
} from '@/lib/plutus/cashflow/types';

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    const value = sorted[middle];
    return value === undefined ? null : value;
  }

  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left === undefined || right === undefined) {
    return null;
  }

  return (left + right) / 2;
}

export function buildProjectedSettlementEvents(input: {
  history: CashflowSettlementHistoryInput[];
  asOfDate: string;
  forecastEndDate: string;
  settlementAverageCount: number;
  settlementDefaultIntervalDays: number;
  warnings: CashflowWarning[];
}): { rows: CashflowProjectedSettlementInput[]; events: CashflowEvent[] } {
  const rows: CashflowProjectedSettlementInput[] = [];
  const events: CashflowEvent[] = [];
  const channels: Array<'US' | 'UK'> = ['US', 'UK'];

  for (const channel of channels) {
    const channelHistory = input.history
      .filter((row) => row.channel === channel && row.periodEnd !== null)
      .sort((a, b) => {
        const aEnd = a.periodEnd;
        const bEnd = b.periodEnd;

        if (aEnd === null || bEnd === null) {
          return 0;
        }

        return compareDateStrings(aEnd, bEnd);
      });

    if (channelHistory.length === 0) {
      continue;
    }

    const intervalCandidates: number[] = [];
    for (let i = 1; i < channelHistory.length; i += 1) {
      const previous = channelHistory[i - 1];
      const current = channelHistory[i];
      if (!previous || !current || previous.periodEnd === null || current.periodEnd === null) {
        continue;
      }

      const delta = daysBetween(previous.periodEnd, current.periodEnd);
      if (delta > 0) {
        intervalCandidates.push(delta);
      }
    }

    const intervalMedian = median(intervalCandidates);
    let intervalDays = intervalMedian === null ? input.settlementDefaultIntervalDays : Math.round(intervalMedian);
    if (intervalDays < 1) {
      intervalDays = input.settlementDefaultIntervalDays;
    }

    if (intervalMedian === null) {
      input.warnings.push({
        code: 'SETTLEMENT_INTERVAL_FALLBACK',
        message: `Could not infer settlement interval for ${channel}; default interval was used.`,
        detail: `intervalDays=${input.settlementDefaultIntervalDays}`,
      });
    }

    const lagCandidates: number[] = [];
    for (const row of channelHistory) {
      if (row.periodEnd === null) {
        continue;
      }
      const lag = daysBetween(row.periodEnd, row.txnDate);
      lagCandidates.push(lag);
    }

    const lagMedian = median(lagCandidates);
    const lagDays = lagMedian === null ? 0 : Math.round(lagMedian);

    const nonNullImpacts = channelHistory
      .map((row) => row.cashImpactCents)
      .filter((value): value is number => value !== null);

    if (nonNullImpacts.length === 0) {
      input.warnings.push({
        code: 'SETTLEMENT_MISSING_CASH_IMPACT',
        message: `No cash-impact lines were found in settlement history for ${channel}.`,
      });
      continue;
    }

    const basedOnCount = Math.min(nonNullImpacts.length, input.settlementAverageCount);
    const recentImpacts = nonNullImpacts.slice(-basedOnCount);
    let impactSum = 0;
    for (const value of recentImpacts) {
      impactSum += value;
    }
    const avgCents = Math.round(impactSum / basedOnCount);

    const lastSettlement = channelHistory[channelHistory.length - 1];
    if (!lastSettlement || lastSettlement.periodEnd === null) {
      continue;
    }

    let nextPeriodEnd = addDays(lastSettlement.periodEnd, intervalDays);
    while (true) {
      const projectedDate = addDays(nextPeriodEnd, lagDays);
      if (compareDateStrings(projectedDate, input.forecastEndDate) > 0) {
        break;
      }

      if (compareDateStrings(projectedDate, input.asOfDate) >= 0) {
        rows.push({
          channel,
          date: projectedDate,
          amountCents: avgCents,
          basedOnCount,
          intervalDays,
          lagDays,
        });

        events.push({
          date: projectedDate,
          amountCents: avgCents,
          label: `Projected Amazon ${channel} settlement`,
          source: 'projected_settlement',
          meta: {
            channel,
            basedOnCount,
            intervalDays,
            lagDays,
          },
        });
      }

      nextPeriodEnd = addDays(nextPeriodEnd, intervalDays);
    }
  }

  return { rows, events };
}
