import { addDays, compareDateStrings, daysBetween, endOfWeek, startOfWeek } from '@/lib/plutus/cashflow/date';
import type {
  CashflowEvent,
  CashflowForecastResult,
  CashflowWeek,
} from '@/lib/plutus/cashflow/types';

export function buildCashflowForecast(input: {
  asOfDate: string;
  weekStartsOn: number;
  horizonWeeks: number;
  startingCashCents: number;
  events: CashflowEvent[];
}): CashflowForecastResult {
  const horizonStart = startOfWeek(input.asOfDate, input.weekStartsOn);
  const horizonEnd = addDays(horizonStart, input.horizonWeeks * 7 - 1);

  const weekEvents: CashflowEvent[][] = [];
  for (let i = 0; i < input.horizonWeeks; i += 1) {
    weekEvents.push([]);
  }

  for (const event of input.events) {
    if (compareDateStrings(event.date, horizonStart) < 0 || compareDateStrings(event.date, horizonEnd) > 0) {
      continue;
    }

    const offsetDays = daysBetween(horizonStart, event.date);
    const weekIndex = Math.floor(offsetDays / 7);

    if (weekIndex < 0 || weekIndex >= input.horizonWeeks) {
      continue;
    }

    if (weekIndex === 0 && compareDateStrings(event.date, input.asOfDate) < 0) {
      continue;
    }

    const targetWeek = weekEvents[weekIndex];
    if (!targetWeek) {
      continue;
    }

    targetWeek.push(event);
  }

  const weeks: CashflowWeek[] = [];
  let rollingCash = input.startingCashCents;

  for (let i = 0; i < input.horizonWeeks; i += 1) {
    const weekStart = addDays(horizonStart, i * 7);
    const weekEnd = endOfWeek(weekStart, input.weekStartsOn);
    const events = weekEvents[i] === undefined ? [] : weekEvents[i].sort((a, b) => compareDateStrings(a.date, b.date));

    let inflowsCents = 0;
    let outflowsCents = 0;
    for (const event of events) {
      if (event.amountCents >= 0) {
        inflowsCents += event.amountCents;
      } else {
        outflowsCents += event.amountCents;
      }
    }

    const endingCashCents = rollingCash + inflowsCents + outflowsCents;

    weeks.push({
      weekStart,
      weekEnd,
      startingCashCents: rollingCash,
      inflowsCents,
      outflowsCents,
      endingCashCents,
      events,
    });

    rollingCash = endingCashCents;
  }

  let minCashCents = weeks[0] === undefined ? input.startingCashCents : weeks[0].endingCashCents;
  let minCashWeekStart = weeks[0] === undefined ? horizonStart : weeks[0].weekStart;

  for (const week of weeks) {
    if (week.endingCashCents < minCashCents) {
      minCashCents = week.endingCashCents;
      minCashWeekStart = week.weekStart;
    }
  }

  const lastWeek = weeks[weeks.length - 1];
  const endCashCents = lastWeek === undefined ? input.startingCashCents : lastWeek.endingCashCents;

  return {
    asOfDate: input.asOfDate,
    weekStartsOn: input.weekStartsOn,
    horizonWeeks: input.horizonWeeks,
    startingCashCents: input.startingCashCents,
    weeks,
    summary: {
      minCashCents,
      minCashWeekStart,
      endCashCents,
    },
  };
}
