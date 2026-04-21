'use client';

import { useQuery } from '@tanstack/react-query';
import { getPublicBasePath } from '@/lib/base-path';
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

export function useWprWeeksQuery() {
  return useQuery({
    queryKey: ['wpr', 'weeks'],
    queryFn: () => getJson<WprWeekSummaryResponse>('/api/wpr/weeks'),
  });
}

export function useWprWeekBundleQuery(week: WeekLabel | null, enabled = true) {
  return useQuery({
    queryKey: ['wpr', 'weeks', week],
    enabled: enabled && week !== null,
    queryFn: () => getJson<WprWeekBundle>(`/api/wpr/weeks/${week}`),
  });
}

export function useWprSourcesQuery(enabled = true) {
  return useQuery({
    queryKey: ['wpr', 'sources'],
    enabled,
    queryFn: () => getJson<WprSourceOverview>('/api/wpr/sources'),
  });
}

export function useWprChangeLogQuery() {
  return useQuery({
    queryKey: ['wpr', 'changelog'],
    queryFn: () => getJson<Record<WeekLabel, WprChangeLogEntry[]>>('/api/wpr/changelog'),
  });
}

export function useWprChangeLogWeekQuery(week: WeekLabel | null, enabled = true) {
  return useQuery({
    queryKey: ['wpr', 'changelog', week],
    enabled: enabled && week !== null,
    queryFn: () => getJson<WprChangeLogEntry[]>(`/api/wpr/changelog/${week}`),
  });
}
