import { PrismaClient as TalosPrismaClient } from '@targon/prisma-talos';
import type { Marketplace } from '@targon/prisma-argus';
import { requireEnv } from '@/lib/env';

function envKeyForMarketplace(marketplace: Marketplace): string {
  if (marketplace === 'US') return 'DATABASE_URL_TALOS_US';
  return 'DATABASE_URL_TALOS_UK';
}

export function getTalosClient(marketplace: Marketplace): TalosPrismaClient {
  const datasourceUrl = requireEnv(envKeyForMarketplace(marketplace));
  return new TalosPrismaClient({ datasourceUrl });
}

