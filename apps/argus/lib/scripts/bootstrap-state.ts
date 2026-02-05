import { chromium } from 'playwright';
import { getMarketplaceConfig, type MarketplaceConfig } from '@/lib/capture/marketplace';
import type { Marketplace } from '@targon/prisma-argus';
import { requireEnv } from '@/lib/env';

function parseMarketplace(): Marketplace {
  const idx = process.argv.indexOf('--marketplace');
  const value = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (value === 'US' || value === 'UK') return value;
  throw new Error('Usage: tsx bootstrap-state.ts --marketplace US|UK');
}

function storageStateEnvKey(marketplace: Marketplace): string {
  if (marketplace === 'US') return 'ARGUS_STORAGE_STATE_US_PATH';
  return 'ARGUS_STORAGE_STATE_UK_PATH';
}

async function waitForEnter() {
  // eslint-disable-next-line no-console
  console.log('Press Enter to save storage state and exit.');
  process.stdin.setEncoding('utf8');
  return new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });
}

async function main() {
  const marketplace = parseMarketplace();
  const config: MarketplaceConfig = getMarketplaceConfig(marketplace);
  const outputPath = requireEnv(storageStateEnvKey(marketplace));

  // eslint-disable-next-line no-console
  console.log(`[argus] opening ${config.baseUrl} (${marketplace}). Login if needed.`);
  // eslint-disable-next-line no-console
  console.log(`[argus] will write storage state to ${outputPath}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: config.locale,
    timezoneId: config.timeZone,
  });

  const page = await context.newPage();
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });

  await waitForEnter();
  await context.storageState({ path: outputPath });
  await browser.close();

  // eslint-disable-next-line no-console
  console.log('[argus] saved storage state');
}

void main();

