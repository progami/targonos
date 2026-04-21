import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  path: string;
  mtimeMs: number;
  payload: WprPayload;
};

let cacheState: CacheState | null = null;

function resolveDataDir(): string {
  const value = process.env.WPR_DATA_DIR;
  if (value === undefined) {
    throw new Error('WPR_DATA_DIR is required for Argus.');
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('WPR_DATA_DIR is required for Argus.');
  }

  return trimmed;
}

function resolveLatestJsonPath(): string {
  return join(resolveDataDir(), 'wpr-data-latest.json');
}

async function loadPayload(): Promise<WprPayload> {
  const path = resolveLatestJsonPath();
  const fileStats = await stat(path);

  if (cacheState !== null && cacheState.path === path && cacheState.mtimeMs === fileStats.mtimeMs) {
    return cacheState.payload;
  }

  const raw = await readFile(path, 'utf8');
  const payload = JSON.parse(raw) as unknown;
  assertWprPayloadContract(payload);
  cacheState = {
    path,
    mtimeMs: fileStats.mtimeMs,
    payload,
  };
  return payload;
}

export async function getWprPayload(): Promise<WprPayload> {
  return loadPayload();
}

export async function getWprWeekSummary(): Promise<WprWeekSummaryResponse> {
  const payload = await loadPayload();
  return {
    defaultWeek: payload.defaultWeek,
    weeks: payload.weeks,
    weekStartDates: payload.weekStartDates,
  };
}

export async function getWprWeekBundle(week: WeekLabel): Promise<WprWeekBundle> {
  const payload = await loadPayload();
  const bundle = payload.windowsByWeek[week];
  if (bundle === undefined) {
    throw new Error(`Unknown WPR week: ${week}`);
  }

  return bundle;
}

export async function getWprSources(): Promise<WprSourceOverview> {
  const payload = await loadPayload();
  return payload.sourceOverview;
}

export async function getWprChangeLog(): Promise<Record<WeekLabel, WprChangeLogEntry[]>> {
  const payload = await loadPayload();
  return payload.changeLogByWeek;
}

export async function getWprChangeLogWeek(week: WeekLabel): Promise<WprChangeLogEntry[]> {
  const payload = await loadPayload();
  const entries = payload.changeLogByWeek[week];
  if (entries === undefined) {
    throw new Error(`Unknown WPR week: ${week}`);
  }

  return entries;
}
