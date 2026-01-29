import { PrismaClient } from '@targon/prisma-talos';

type Country = 'US' | 'UK';

const ENV_KEYS: Record<Country, string> = {
  US: 'DATABASE_URL_TALOS_US',
  UK: 'DATABASE_URL_TALOS_UK',
};

type GlobalWithTalos = typeof globalThis & {
  __talosPrisma?: Map<Country, PrismaClient>;
};

const g = globalThis as GlobalWithTalos;
if (!g.__talosPrisma) {
  g.__talosPrisma = new Map();
}

export function getTalosPrisma(country: Country): PrismaClient {
  const existing = g.__talosPrisma!.get(country);
  if (existing) return existing;

  const url = process.env[ENV_KEYS[country]]!;
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url } },
  });

  g.__talosPrisma!.set(country, client);
  return client;
}
