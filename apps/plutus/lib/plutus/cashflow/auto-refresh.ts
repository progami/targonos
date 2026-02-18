import { compareDateStrings } from '@/lib/plutus/cashflow/date';

const AUTO_REFRESH_TIME_RE = /^\d{2}:\d{2}$/;

export type ParsedAutoRefreshTime = {
  hour: number;
  minute: number;
};

export type CashflowSnapshotMeta = {
  asOfDate: string;
  createdAt: Date;
};

export function parseAutoRefreshTimeLocal(value: string): ParsedAutoRefreshTime {
  if (!AUTO_REFRESH_TIME_RE.test(value)) {
    throw new Error('autoRefreshTimeLocal must match HH:MM (24-hour)');
  }

  const [hourRaw, minuteRaw] = value.split(':');
  if (hourRaw === undefined || minuteRaw === undefined) {
    throw new Error('autoRefreshTimeLocal must match HH:MM (24-hour)');
  }

  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error('autoRefreshTimeLocal must match HH:MM (24-hour)');
  }

  if (hour < 0 || hour > 23) {
    throw new Error('autoRefreshTimeLocal hour must be between 00 and 23');
  }

  if (minute < 0 || minute > 59) {
    throw new Error('autoRefreshTimeLocal minute must be between 00 and 59');
  }

  return { hour, minute };
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildScheduledLocalDateTime(input: {
  now: Date;
  autoRefreshTimeLocal: string;
}): Date {
  const parsedTime = parseAutoRefreshTimeLocal(input.autoRefreshTimeLocal);

  return new Date(
    input.now.getFullYear(),
    input.now.getMonth(),
    input.now.getDate(),
    parsedTime.hour,
    parsedTime.minute,
    0,
    0,
  );
}

export function getSnapshotAgeMinutes(input: {
  now: Date;
  snapshotCreatedAt: Date;
}): number {
  const ageMs = input.now.getTime() - input.snapshotCreatedAt.getTime();
  return Math.floor(ageMs / (60 * 1000));
}

export function shouldRefreshCashflowSnapshot(input: {
  now: Date;
  todayLocalDate: string;
  latestSnapshot: CashflowSnapshotMeta | null;
  autoRefreshMinSnapshotAgeMinutes: number;
}): boolean {
  if (input.latestSnapshot === null) {
    return true;
  }

  const ageMinutes = getSnapshotAgeMinutes({
    now: input.now,
    snapshotCreatedAt: input.latestSnapshot.createdAt,
  });

  if (ageMinutes < input.autoRefreshMinSnapshotAgeMinutes) {
    return false;
  }

  return compareDateStrings(input.latestSnapshot.asOfDate, input.todayLocalDate) !== 0;
}
