export type WeekStartsOn = 0 | 1;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function startOfWeekUtc(date: Date, weekStartsOn: WeekStartsOn): Date {
  const normalized = toUtcDate(date);
  const day = normalized.getUTCDay();
  const diff = (day - weekStartsOn + 7) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - diff);
  return normalized;
}

export function addWeeksUtc(date: Date, weeks: number): Date {
  const normalized = toUtcDate(date);
  const offsetWeeks = Number(weeks);
  if (!Number.isFinite(offsetWeeks) || offsetWeeks === 0) return normalized;
  return new Date(normalized.getTime() + offsetWeeks * WEEK_MS);
}

export function differenceInCalendarWeeksUtc(
  target: Date,
  base: Date,
  weekStartsOn: WeekStartsOn,
): number {
  const targetStart = startOfWeekUtc(target, weekStartsOn);
  const baseStart = startOfWeekUtc(base, weekStartsOn);
  return Math.round((targetStart.getTime() - baseStart.getTime()) / WEEK_MS);
}
