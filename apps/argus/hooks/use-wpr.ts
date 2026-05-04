'use client';

import { useQuery } from '@tanstack/react-query';
import { getPublicBasePath } from '@/lib/base-path';
import { appendMarketParam, type ArgusMarket } from '@/lib/argus-market';
import type {
  WprChangeLogEntry,
  WeekLabel,
  WprSourceOverview,
  WprWeekBundle,
  WprWeekSummaryResponse,
} from '@/lib/wpr/types';

const basePath = getPublicBasePath();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${basePath}${path}`);
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const message = 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Request failed for ${path}`;
    throw new Error(message);
  }

  return payload;
}

export function useWprWeeksQuery(market: ArgusMarket) {
  return useQuery({
    queryKey: ['wpr', market, 'weeks'],
    queryFn: () => getJson<WprWeekSummaryResponse>(appendMarketParam('/api/wpr/weeks', market)),
  });
}

export function useWprWeekBundleQuery(market: ArgusMarket, week: WeekLabel | null, enabled = true) {
  return useQuery({
    queryKey: ['wpr', market, 'weeks', week],
    enabled: enabled && week !== null,
    queryFn: () => getJson<WprWeekBundle>(appendMarketParam(`/api/wpr/weeks/${week}`, market)),
  });
}

export function useWprSourcesQuery(market: ArgusMarket, enabled = true) {
  return useQuery({
    queryKey: ['wpr', market, 'sources'],
    enabled,
    queryFn: () => getJson<WprSourceOverview>(appendMarketParam('/api/wpr/sources', market)),
  });
}

export function useWprChangeLogQuery(market: ArgusMarket) {
  return useQuery({
    queryKey: ['wpr', market, 'changelog'],
    queryFn: () => getJson<Record<WeekLabel, WprChangeLogEntry[]>>(appendMarketParam('/api/wpr/changelog', market)),
  });
}

export function useWprChangeLogWeekQuery(market: ArgusMarket, week: WeekLabel | null, enabled = true) {
  return useQuery({
    queryKey: ['wpr', market, 'changelog', week],
    enabled: enabled && week !== null,
    queryFn: () => getJson<WprChangeLogEntry[]>(appendMarketParam(`/api/wpr/changelog/${week}`, market)),
  });
}
