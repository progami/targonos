const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  if (yearRaw === undefined || monthRaw === undefined || dayRaw === undefined) {
    return false;
  }

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
  );
}

export function parseDate(value: string): Date {
  if (!isDateString(value)) {
    throw new Error(`Invalid date string: ${value}`);
  }

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  if (yearRaw === undefined || monthRaw === undefined || dayRaw === undefined) {
    throw new Error(`Invalid date string: ${value}`);
  }

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function compareDateStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

export function addWeeks(value: string, amount: number): string {
  return addDays(value, amount * 7);
}

export function addMonths(value: string, amount: number, dayOfMonth?: number): string {
  const date = parseDate(value);
  const anchorDay = dayOfMonth === undefined ? date.getUTCDate() : dayOfMonth;

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);

  const daysInTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = anchorDay > daysInTargetMonth ? daysInTargetMonth : anchorDay;
  date.setUTCDate(clampedDay);

  return formatDate(date);
}

export function daysBetween(start: string, end: string): number {
  const startDate = parseDate(start).getTime();
  const endDate = parseDate(end).getTime();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((endDate - startDate) / msPerDay);
}

export function startOfWeek(value: string, weekStartsOn: number = 1): string {
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    throw new Error(`Invalid weekStartsOn: ${weekStartsOn}`);
  }

  const date = parseDate(value);
  const day = date.getUTCDay();
  const delta = (day - weekStartsOn + 7) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return formatDate(date);
}

export function endOfWeek(value: string, weekStartsOn: number = 1): string {
  const start = startOfWeek(value, weekStartsOn);
  return addDays(start, 6);
}

export function todayUtcDate(): string {
  return formatDate(new Date());
}

export function minDate(a: string, b: string): string {
  if (compareDateStrings(a, b) <= 0) return a;
  return b;
}

export function maxDate(a: string, b: string): string {
  if (compareDateStrings(a, b) >= 0) return a;
  return b;
}
