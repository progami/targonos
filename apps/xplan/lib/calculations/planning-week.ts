import type { YearSegment } from '@/lib/calculations/calendar';
import type { WeekStartsOn } from '@/lib/calculations/week-utils';
import {
  addWeeksUtc,
  differenceInCalendarWeeksUtc,
  startOfWeekUtc,
} from '@/lib/calculations/week-utils';
import { parseDate, toIsoDate } from '@/lib/utils/dates';

export type PlanningWeekConfig = {
  anchorWeekNumber: number;
  anchorWeekDateIso: string;
  weekStartsOn?: WeekStartsOn;
  minWeekNumber?: number | null;
  maxWeekNumber?: number | null;
  yearSegments: YearSegment[];
};

function coerceAnchor(config: PlanningWeekConfig) {
  const anchorDate = parseDate(config.anchorWeekDateIso);
  const anchorWeekNumber = Number(config.anchorWeekNumber);
  if (!anchorDate || !Number.isFinite(anchorWeekNumber)) return null;
  return { anchorDate, anchorWeekNumber };
}

export function planningWeekNumberForDate(
  date: Date | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): number | null {
  if (!date || !config) return null;
  const anchor = coerceAnchor(config);
  if (!anchor) return null;

  const weekStartsOn = config.weekStartsOn ?? 1;
  const base = startOfWeekUtc(anchor.anchorDate, weekStartsOn);
  const offset = differenceInCalendarWeeksUtc(date, base, weekStartsOn);
  const weekNumber = anchor.anchorWeekNumber + offset;

  if (config.minWeekNumber != null && weekNumber < config.minWeekNumber) return null;
  if (config.maxWeekNumber != null && weekNumber > config.maxWeekNumber) return null;
  return weekNumber;
}

export function planningWeekNumberForIsoDate(
  iso: string | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): number | null {
  return planningWeekNumberForDate(parseDate(iso), config);
}

export function planningWeekDateForWeekNumber(
  weekNumber: number | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): Date | null {
  if (weekNumber == null || !config) return null;
  const anchor = coerceAnchor(config);
  if (!anchor) return null;
  const numericWeek = Number(weekNumber);
  if (!Number.isFinite(numericWeek)) return null;

  const weekStartsOn = config.weekStartsOn ?? 1;
  const base = startOfWeekUtc(anchor.anchorDate, weekStartsOn);
  return addWeeksUtc(base, numericWeek - anchor.anchorWeekNumber);
}

export function planningWeekDateIsoForWeekNumber(
  weekNumber: number | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): string | null {
  const date = planningWeekDateForWeekNumber(weekNumber, config);
  return date ? toIsoDate(date) : null;
}

export function findYearSegmentForWeekNumber(
  weekNumber: number | null | undefined,
  segments: YearSegment[],
): YearSegment | null {
  if (weekNumber == null) return null;
  const numericWeek = Number(weekNumber);
  if (!Number.isFinite(numericWeek)) return null;
  return (
    segments.find(
      (segment) =>
        segment.weekCount > 0 &&
        numericWeek >= segment.startWeekNumber &&
        numericWeek <= segment.endWeekNumber,
    ) ?? null
  );
}

export function findYearSegmentForYear(
  year: number | null | undefined,
  segments: YearSegment[],
): YearSegment | null {
  if (year == null) return null;
  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) return null;
  return segments.find((segment) => segment.year === numericYear) ?? null;
}

export function weekLabelForWeekNumber(
  weekNumber: number | null | undefined,
  segments: YearSegment[],
): string {
  const segment = findYearSegmentForWeekNumber(weekNumber, segments);
  if (!segment || weekNumber == null) return '';
  return String(Number(weekNumber) - segment.startWeekNumber + 1);
}

export function weekLabelForIsoDate(
  iso: string | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): string {
  if (!config) return '';
  const weekNumber = planningWeekNumberForIsoDate(iso, config);
  return weekLabelForWeekNumber(weekNumber, config.yearSegments);
}

export function weekNumberForYearWeekLabel(
  year: number | null | undefined,
  weekLabel: number | null | undefined,
  config: PlanningWeekConfig | null | undefined,
): number | null {
  if (!config) return null;
  if (year == null || weekLabel == null) return null;
  const numericLabel = Number(weekLabel);
  if (!Number.isFinite(numericLabel)) return null;

  const segment = findYearSegmentForYear(year, config.yearSegments);
  if (!segment || segment.weekCount <= 0) return null;

  if (numericLabel < 1 || numericLabel > segment.weekCount) return null;
  return segment.startWeekNumber + numericLabel - 1;
}
