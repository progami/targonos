import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_ARGUS_MARKET, getArgusMarketConfig, type ArgusMarket } from '@/lib/argus-market';
import { assertWprPayloadContract } from './payload-contract';
import type {
  WeekLabel,
  WprChangeLogEntry,
  WprPayload,
  WprSourceOverview,
  WprWeekBundle,
  WprWeekSummaryResponse,
} from './types';

type CacheState = {
  market: ArgusMarket;
  path: string;
  mtimeMs: number;
  payload: WprPayload;
};

const cacheByMarket = new Map<ArgusMarket, CacheState>();
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function resolveLatestJsonPath(market: ArgusMarket): string {
  return join(getArgusMarketConfig(market).wprDataDir, 'wpr-data-latest.json');
}

async function loadPayload(market: ArgusMarket): Promise<WprPayload> {
  const path = resolveLatestJsonPath(market);
  const fileStats = await stat(path);
  const cacheState = cacheByMarket.get(market);

  if (cacheState !== undefined && cacheState.path === path && cacheState.mtimeMs === fileStats.mtimeMs) {
    return cacheState.payload;
  }

  const raw = await readFile(path, 'utf8');
  const payload = JSON.parse(raw) as unknown;
  assertWprPayloadContract(payload);
  cacheByMarket.set(market, {
    market,
    path,
    mtimeMs: fileStats.mtimeMs,
    payload,
  });
  return payload;
}

export async function getWprPayload(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<WprPayload> {
  return loadPayload(market);
}

export async function getWprWeekSummary(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<WprWeekSummaryResponse> {
  const payload = await loadPayload(market);
  return createWprWeekSummary(payload);
}

function dateOnlyTime(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseWeekStartDate(value: string, week: WeekLabel): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid WPR week start date for ${week}: ${value}`);
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function requireWeekStartDate(
  weekStartDates: Record<WeekLabel, string>,
  week: WeekLabel,
): string {
  const value = weekStartDates[week];
  if (value === undefined) {
    throw new Error(`Missing WPR week start date for ${week}`);
  }
  return value;
}

function resolveCompletedWeeks(
  weeks: WeekLabel[],
  weekStartDates: Record<WeekLabel, string>,
  today: Date,
): WeekLabel[] {
  const todayTime = dateOnlyTime(today);
  const completedWeeks: WeekLabel[] = [];
  for (const week of weeks) {
    const startTime = parseWeekStartDate(requireWeekStartDate(weekStartDates, week), week);
    const endTime = startTime + WEEK_MS;
    if (endTime <= todayTime) {
      completedWeeks.push(week);
    }
  }

  return completedWeeks;
}

export function createWprWeekSummary(
  payload: Pick<WprPayload, 'defaultWeek' | 'weeks' | 'weekStartDates'>,
  today = new Date(),
): WprWeekSummaryResponse {
  const weeks = resolveCompletedWeeks(payload.weeks, payload.weekStartDates, today);
  if (weeks.length === 0) {
    throw new Error('No completed WPR weeks are available.');
  }

  let defaultWeek = payload.defaultWeek;
  if (!weeks.includes(defaultWeek)) {
    defaultWeek = weeks[weeks.length - 1];
  }

  const weekStartDates: Record<WeekLabel, string> = {};
  for (const week of weeks) {
    weekStartDates[week] = requireWeekStartDate(payload.weekStartDates, week);
  }

  return {
    defaultWeek,
    weeks,
    weekStartDates,
  };
}

export async function getWprWeekBundle(week: WeekLabel, market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<WprWeekBundle> {
  const payload = await loadPayload(market);
  const bundle = payload.windowsByWeek[week];
  if (bundle === undefined) {
    throw new Error(`Unknown WPR week: ${week}`);
  }

  return bundle;
}

export async function getWprSources(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<WprSourceOverview> {
  const payload = await loadPayload(market);
  return payload.sourceOverview;
}

export async function getWprChangeLog(market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<Record<WeekLabel, WprChangeLogEntry[]>> {
  const payload = await loadPayload(market);
  return payload.changeLogByWeek;
}

export async function getWprChangeLogWeek(week: WeekLabel, market: ArgusMarket = DEFAULT_ARGUS_MARKET): Promise<WprChangeLogEntry[]> {
  const payload = await loadPayload(market);
  const entries = payload.changeLogByWeek[week];
  if (entries === undefined) {
    throw new Error(`Unknown WPR week: ${week}`);
  }

  return entries;
}
