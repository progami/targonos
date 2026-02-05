import type { Marketplace } from '@targon/prisma-argus';

export type MarketplaceConfig = {
  marketplace: Marketplace;
  baseUrl: string;
  locale: string;
  timeZone: string;
};

const CONFIG: Record<Marketplace, MarketplaceConfig> = {
  US: {
    marketplace: 'US',
    baseUrl: 'https://www.amazon.com',
    locale: 'en-US',
    timeZone: 'America/New_York',
  },
  UK: {
    marketplace: 'UK',
    baseUrl: 'https://www.amazon.co.uk',
    locale: 'en-GB',
    timeZone: 'Europe/London',
  },
};

export function getMarketplaceConfig(marketplace: Marketplace): MarketplaceConfig {
  return CONFIG[marketplace];
}

export function buildAsinUrl(config: MarketplaceConfig, asin: string): string {
  return `${config.baseUrl}/dp/${asin}`;
}

export function buildSearchUrl(config: MarketplaceConfig, keyword: string): string {
  const q = encodeURIComponent(keyword);
  return `${config.baseUrl}/s?k=${q}`;
}

