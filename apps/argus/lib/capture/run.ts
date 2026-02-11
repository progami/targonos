import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { ArtifactKind, Marketplace, WatchTarget } from '@targon/prisma-argus';

import { getMarketplaceConfig, buildAsinUrl } from './marketplace';
import { isRobotCheckPage } from './robot-check';
import { extractAsinFields } from './extract-asin';
import { buildListingSignalExtracted, signalContentHash } from './signal';

export type CaptureArtifact = {
  kind: ArtifactKind;
  marketplace: Marketplace;
  buffer: Buffer;
  asin?: string;
  position?: number;
};

export type CaptureResult =
  | {
      status: 'SUCCEEDED';
      finalUrl: string;
      contentHash: string;
      rawExtracted: Record<string, unknown>;
      normalizedExtracted: Record<string, unknown>;
      artifacts: CaptureArtifact[];
      notes?: string;
    }
  | {
      status: 'BLOCKED';
      finalUrl: string;
      artifacts: CaptureArtifact[];
      notes?: string;
    };

function storageStateEnvKey(marketplace: Marketplace): string {
  if (marketplace === 'US') return 'ARGUS_STORAGE_STATE_US_PATH';
  return 'ARGUS_STORAGE_STATE_UK_PATH';
}

async function getPageSnapshot(page: import('playwright').Page): Promise<{ url: string; title: string; html: string }> {
  const url = page.url();
  const title = await page.title();
  const html = await page.content();
  return { url, title, html };
}

export async function captureTarget(browser: Browser, target: WatchTarget): Promise<CaptureResult> {
  const config = getMarketplaceConfig(target.marketplace);
  const storageStatePath = process.env[storageStateEnvKey(target.marketplace)];

  const context = await browser.newContext({
    viewport: { width: 1365, height: 900 },
    locale: config.locale,
    timezoneId: config.timeZone,
    storageState: storageStatePath && storageStatePath.trim() ? storageStatePath.trim() : undefined,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  try {
    const url = buildAsinUrl(config, target.asin);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#productTitle', { timeout: 45_000 });

    const snap = await getPageSnapshot(page);
    const screenshot = await page.screenshot({ fullPage: true });

    if (isRobotCheckPage(snap)) {
      return {
        status: 'BLOCKED',
        finalUrl: snap.url,
        artifacts: [{ kind: 'ASIN_FULLPAGE', marketplace: target.marketplace, buffer: screenshot }],
        notes: 'Robot check / CAPTCHA detected',
      };
    }

    const extracted = extractAsinFields(snap.html);
    if (!extracted.normalized.title) {
      throw new Error(`ASIN extraction failed: title is empty (url: ${snap.url})`);
    }

    const normalizedExtracted = {
      asin: target.asin.toUpperCase(),
      ...extracted.normalized,
    };
    const contentHash = signalContentHash(buildListingSignalExtracted(normalizedExtracted));

    return {
      status: 'SUCCEEDED',
      finalUrl: snap.url,
      contentHash,
      rawExtracted: extracted.raw,
      normalizedExtracted,
      artifacts: [{ kind: 'ASIN_FULLPAGE', marketplace: target.marketplace, buffer: screenshot }],
    };
  } finally {
    await context.close();
  }
}

export async function launchDefaultBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}
