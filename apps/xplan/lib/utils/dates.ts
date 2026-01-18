const DEFAULT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function parseDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(value: string | number | Date | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function formatDateDisplay(
  value: string | number | Date | null | undefined,
  formatter: Intl.DateTimeFormat = DEFAULT_DATE_FORMATTER,
  fallback = '',
): string {
  const date = parseDate(value);
  if (!date) return fallback;
  return formatter.format(date).replace(',', '');
}

export function getUtcDateForTimeZone(dateUtc: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dateUtc);

  const yearValue = parts.find((part) => part.type === 'year')?.value;
  const monthValue = parts.find((part) => part.type === 'month')?.value;
  const dayValue = parts.find((part) => part.type === 'day')?.value;

  if (!yearValue || !monthValue || !dayValue) {
    throw new Error(`Failed to read date parts for timeZone="${timeZone}"`);
  }

  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);

  if (![year, month, day].every(Number.isFinite)) {
    throw new Error(`Invalid date parts for timeZone="${timeZone}"`);
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Failed to build UTC date for timeZone="${timeZone}"`);
  }

  return date;
}
