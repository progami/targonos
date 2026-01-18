import 'server-only';

import { PrismaClient as TalosPrismaClient } from '@targon/prisma-talos';
import type { StrategyRegion } from '@/lib/strategy-region';

type TalosRegion = Extract<StrategyRegion, 'US' | 'UK'>;

type GlobalWithTalosPrisma = typeof globalThis & {
  __xplanTalosPrismaByRegion?: Partial<Record<TalosRegion, TalosPrismaClient>>;
};

function talosDatabaseUrlForRegion(region: TalosRegion): string | null {
  const talosKey = region === 'UK' ? 'TALOS_DATABASE_URL_UK' : 'TALOS_DATABASE_URL_US';
  const url = process.env[talosKey]?.trim();
  return url && url.length > 0 ? url : null;
}

export function getTalosPrisma(region: TalosRegion): TalosPrismaClient | null {
  const url = talosDatabaseUrlForRegion(region);
  if (!url) return null;

  const globalForPrisma = globalThis as GlobalWithTalosPrisma;
  if (!globalForPrisma.__xplanTalosPrismaByRegion) {
    globalForPrisma.__xplanTalosPrismaByRegion = {};
  }

  const cached = globalForPrisma.__xplanTalosPrismaByRegion[region];
  if (cached) return cached;

  const client = new TalosPrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url } },
  });

  globalForPrisma.__xplanTalosPrismaByRegion[region] = client;
  return client;
}
