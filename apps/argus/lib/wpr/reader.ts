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
  return {
    defaultWeek: payload.defaultWeek,
    weeks: payload.weeks,
    weekStartDates: payload.weekStartDates,
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
