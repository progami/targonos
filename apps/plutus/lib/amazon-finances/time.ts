type IsoDayParts = { year: number; month: number; day: number };

function requireIsoTimestamp(value: string, context: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp for ${context}: ${value}`);
  }
  return date;
}

export function isoTimestampToZonedIsoDay(value: string, timeZone: string, context: string): string {
  const date = requireIsoTimestamp(value, context);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error(`Failed to format date for ${context}: ${value}`);
  }

  return `${year}-${month}-${day}`;
}

export function parseIsoDayParts(value: string, context: string): IsoDayParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid ISO day for ${context}: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Invalid ISO day numbers for ${context}: ${value}`);
  }

  return { year, month, day };
}

export function isoDayToYearMonth(value: string, context: string): string {
  const parts = parseIsoDayParts(value, context);
  const month = parts.month < 10 ? `0${parts.month}` : String(parts.month);
  return `${parts.year}-${month}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1970 || year > 2200) {
    throw new Error(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

