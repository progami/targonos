import type { Marketplace } from '@/lib/store/marketplace';

export function normalizeSettlementMarketplaceQuery(value: string | null | undefined): Marketplace | null {
  if (value === null || value === undefined) return null;

  const trimmedUpper = value.trim().toUpperCase();
  if (trimmedUpper === '') return null;
  if (trimmedUpper === 'ALL') return 'all';
  if (trimmedUpper === 'US') return 'US';
  if (trimmedUpper === 'UK') return 'UK';

  return null;
}
