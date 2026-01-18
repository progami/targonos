import { isValid } from 'date-fns';
import type { WeekStartsOn } from '@/lib/calculations/week-utils';
import {
  addWeeksUtc,
  differenceInCalendarWeeksUtc,
  startOfWeekUtc,
} from '@/lib/calculations/week-utils';
import { SalesWeekInput } from './types';

export interface WeekCalendar {
  calendarStart: Date | null;
  weekDates: Map<number, Date | null>;
  anchorWeekNumber: number | null;
  minWeekNumber: number | null;
  maxWeekNumber: number | null;
  weekStartsOn: WeekStartsOn;
}

export interface YearSegment {
  year: number;
  startWeekNumber: number;
  endWeekNumber: number;
  weekCount: number;
}

function coerceDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const date = new Date(value);
  return isValid(date) ? date : null;
}

export function buildWeekCalendar(
  salesWeeks: SalesWeekInput[],
  weekStartsOn: WeekStartsOn = 1,
): WeekCalendar {
  const sorted = [...salesWeeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const weekDates = new Map<number, Date | null>();

  let minWeekNumber: number | null = null;
  let maxWeekNumber: number | null = null;
  let anchorWeekNumber: number | null = null;

  for (const week of sorted) {
    const date = coerceDate(week.weekDate ?? null);
    weekDates.set(week.weekNumber, date ? startOfWeekUtc(date, weekStartsOn) : null);
    if (minWeekNumber == null || week.weekNumber < minWeekNumber) {
      minWeekNumber = week.weekNumber;
    }
    if (maxWeekNumber == null || week.weekNumber > maxWeekNumber) {
      maxWeekNumber = week.weekNumber;
    }
    const coerced = weekDates.get(week.weekNumber);
    if (anchorWeekNumber == null && coerced && isValid(coerced)) {
      anchorWeekNumber = week.weekNumber;
    }
  }

  const calendarStart = (anchorWeekNumber != null ? weekDates.get(anchorWeekNumber) : null) ?? null;

  if (minWeekNumber != null && maxWeekNumber != null) {
    if (calendarStart && anchorWeekNumber != null) {
      const base = startOfWeekUtc(calendarStart, weekStartsOn);
      for (let weekNumber = minWeekNumber; weekNumber <= maxWeekNumber; weekNumber += 1) {
        const existing = weekDates.get(weekNumber);
        if (!existing || !isValid(existing)) {
          weekDates.set(weekNumber, addWeeksUtc(base, weekNumber - anchorWeekNumber));
        }
      }
    } else {
      for (let weekNumber = minWeekNumber; weekNumber <= maxWeekNumber; weekNumber += 1) {
        if (!weekDates.has(weekNumber)) {
          weekDates.set(weekNumber, null);
        }
      }
    }
  }

  const ordered = new Map<number, Date | null>(
    Array.from(weekDates.entries()).sort((a, b) => a[0] - b[0]),
  );

  return {
    calendarStart,
    weekDates: ordered,
    anchorWeekNumber,
    minWeekNumber,
    maxWeekNumber,
    weekStartsOn,
  };
}

export function getCalendarDateForWeek(weekNumber: number, calendar: WeekCalendar): Date | null {
  const direct = calendar.weekDates.get(weekNumber);
  if (direct && isValid(direct)) {
    return direct;
  }

  if (!calendar.calendarStart || calendar.anchorWeekNumber == null) return null;

  const base = startOfWeekUtc(calendar.calendarStart, calendar.weekStartsOn);
  return addWeeksUtc(base, weekNumber - calendar.anchorWeekNumber);
}

export function weekNumberForDate(date: Date | null, calendar: WeekCalendar): number | null {
  if (!date || !calendar.calendarStart || calendar.anchorWeekNumber == null) return null;
  const base = startOfWeekUtc(calendar.calendarStart, calendar.weekStartsOn);
  const offset = differenceInCalendarWeeksUtc(date, base, calendar.weekStartsOn);
  const weekNumber = calendar.anchorWeekNumber + offset;
  if (
    (calendar.minWeekNumber != null && weekNumber < calendar.minWeekNumber) ||
    (calendar.maxWeekNumber != null && weekNumber > calendar.maxWeekNumber)
  ) {
    return null;
  }
  return weekNumber;
}

export function buildYearSegments(calendar: WeekCalendar): YearSegment[] {
  const segments = new Map<number, { min: number; max: number }>();

  for (const [weekNumber] of calendar.weekDates) {
    const date = getCalendarDateForWeek(weekNumber, calendar);
    if (!date) continue;
    const year = date.getUTCFullYear();
    const entry = segments.get(year);
    if (entry) {
      entry.min = Math.min(entry.min, weekNumber);
      entry.max = Math.max(entry.max, weekNumber);
    } else {
      segments.set(year, { min: weekNumber, max: weekNumber });
    }
  }

  return Array.from(segments.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, { min, max }]) => ({
      year,
      startWeekNumber: min,
      endWeekNumber: max,
      weekCount: max >= min ? max - min + 1 : 0,
    }));
}
