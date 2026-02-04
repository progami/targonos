import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { sellerboardReportTimeZoneForRegion, type StrategyRegion } from '../strategy-region';

const SCHEDULES: Array<{ hour: number; minute: number; label: string }> = [
  { hour: 1, minute: 5, label: 'after-midnight' },
  { hour: 13, minute: 5, label: 'midday' },
];

function sleep(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function loadEnvFromFiles() {
  const nodeEnv = process.env.NODE_ENV;
  const mode = typeof nodeEnv === 'string' ? nodeEnv : 'production';

  const protectedKeys = new Set(Object.keys(process.env));
  const files = ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`];

  for (const filename of files) {
    const fullPath = resolve(process.cwd(), filename);
    if (!existsSync(fullPath)) continue;

    const contents = readFileSync(fullPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;

      const key = trimmed.slice(0, equals).trim();
      if (!key) continue;
      if (protectedKeys.has(key)) continue;

      let value = trimmed.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string') {
    throw new Error(`Missing ${name}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing ${name}`);
  }
  return trimmed;
}

function formatLocalDateIso(parts: { year: string; month: string; day: string }): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getTimeParts(
  date: Date,
  timeZone: string,
): {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hourValue = parts.find((part) => part.type === 'hour')?.value;
  const minuteValue = parts.find((part) => part.type === 'minute')?.value;

  if (!year || !month || !day || !hourValue || !minuteValue) {
    throw new Error(`Failed to read time parts for timeZone="${timeZone}"`);
  }

  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Invalid time parts for timeZone="${timeZone}"`);
  }

  return { year, month, day, hour, minute };
}

async function postJson(url: string, token: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Sellerboard sync failed: ${response.status} ${body}`);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

async function runRegionSync(options: { region: StrategyRegion; baseUrl: string; token: string }) {
  const path =
    options.region === 'UK'
      ? '/api/v1/xplan/sellerboard/uk-sync'
      : '/api/v1/xplan/sellerboard/us-sync';
  const url = `${options.baseUrl}${path}`;
  const startedAt = Date.now();
  const result = await postJson(url, options.token);
  const durationMs = Date.now() - startedAt;
  console.log(`[sellerboard-cron] ${options.region} sync complete in ${durationMs}ms`);
  return result;
}

async function main() {
  loadEnvFromFiles();

  const token = getRequiredEnv('SELLERBOARD_SYNC_TOKEN');
  const port = getRequiredEnv('PORT');
  const basePath = getRequiredEnv('BASE_PATH');
  const baseUrl = `http://127.0.0.1:${port}${basePath}`;

  const lastRunBySlot = new Map<string, string>();

  console.log('[sellerboard-cron] starting', {
    baseUrl,
    schedules: SCHEDULES.map(
      (schedule) =>
        `${schedule.label}@${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`,
    ),
  });

  while (true) {
    const now = new Date();

    for (const region of ['US', 'UK'] as const) {
      const reportTimeZone = sellerboardReportTimeZoneForRegion(region);
      const timeParts = getTimeParts(now, reportTimeZone);
      const dateIso = formatLocalDateIso(timeParts);

      for (const schedule of SCHEDULES) {
        if (timeParts.hour !== schedule.hour || timeParts.minute !== schedule.minute) continue;

        const slotKey = `${region}:${schedule.label}`;
        const lastDate = lastRunBySlot.get(slotKey);
        if (lastDate === dateIso) continue;

        console.log(
          `[sellerboard-cron] triggering ${region} ${schedule.label} (reportTz=${reportTimeZone}, localDate=${dateIso})`,
        );

        try {
          await runRegionSync({ region, baseUrl, token });
          lastRunBySlot.set(slotKey, dateIso);
        } catch (error) {
          console.error(`[sellerboard-cron] ${region} sync failed`, error);
        }
      }
    }

    await sleep(30_000);
  }
}

void main();
