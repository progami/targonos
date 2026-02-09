import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { ArtifactKind, Marketplace, WatchTarget } from '@targon/prisma-argus';

import { getMarketplaceConfig, buildAsinUrl, buildSearchUrl } from './marketplace';
import { isRobotCheckPage } from './robot-check';
import { extractAsinFields } from './extract-asin';
import { extractSearchResults } from './extract-search';
import { extractBestsellers } from './extract-bestsellers';
import { sha256Hex, stableStringify } from './hash';

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
    if (target.type === 'ASIN') {
      if (!target.asin) {
        throw new Error('ASIN target missing asin');
      }

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
        type: 'ASIN',
        asin: target.asin.toUpperCase(),
        ...extracted.normalized,
      };
      const contentHash = sha256Hex(stableStringify(normalizedExtracted));

      return {
        status: 'SUCCEEDED',
        finalUrl: snap.url,
        contentHash,
        rawExtracted: extracted.raw,
        normalizedExtracted,
        artifacts: [{ kind: 'ASIN_FULLPAGE', marketplace: target.marketplace, buffer: screenshot }],
      };
    }

    if (target.type === 'SEARCH') {
      if (!target.keyword) {
        throw new Error('SEARCH target missing keyword');
      }

      const url = buildSearchUrl(config, target.keyword);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#search', { timeout: 45_000 });

      const snap = await getPageSnapshot(page);
      const topShot = await page.screenshot({ fullPage: false });

      if (isRobotCheckPage(snap)) {
        return {
          status: 'BLOCKED',
          finalUrl: snap.url,
          artifacts: [{ kind: 'SEARCH_TOP', marketplace: target.marketplace, buffer: topShot }],
          notes: 'Robot check / CAPTCHA detected',
        };
      }

      const extracted = extractSearchResults(snap.html, { trackedAsins: target.trackedAsins, limit: 48 });
      if (extracted.normalized.results.length === 0) {
        throw new Error(`SEARCH extraction failed: results array is empty (url: ${snap.url})`);
      }
      const normalizedExtracted = {
        type: 'SEARCH',
        keyword: target.keyword,
        ...extracted.normalized,
      };
      const contentHash = sha256Hex(stableStringify(normalizedExtracted));

      const artifacts: CaptureArtifact[] = [{ kind: 'SEARCH_TOP', marketplace: target.marketplace, buffer: topShot }];

      for (const tracked of extracted.normalized.tracked) {
        if (!tracked.found || !tracked.position) continue;
        const locator = page.locator(`[data-component-type="s-search-result"][data-asin="${tracked.asin}"]`).first();
        const count = await locator.count();
        if (count === 0) continue;
        const buffer = await locator.screenshot();
        artifacts.push({
          kind: 'SEARCH_RESULT_CARD',
          marketplace: target.marketplace,
          buffer,
          asin: tracked.asin,
          position: tracked.position,
        });
      }

      return {
        status: 'SUCCEEDED',
        finalUrl: snap.url,
        contentHash,
        rawExtracted: extracted.raw,
        normalizedExtracted,
        artifacts,
      };
    }

    if (target.type === 'BROWSE_BESTSELLERS') {
      if (!target.sourceUrl) {
        throw new Error('BROWSE_BESTSELLERS target missing sourceUrl');
      }

      await page.goto(target.sourceUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#zg-ordered-list', { timeout: 45_000 });

      const snap = await getPageSnapshot(page);
      const topShot = await page.screenshot({ fullPage: false });

      if (isRobotCheckPage(snap)) {
        return {
          status: 'BLOCKED',
          finalUrl: snap.url,
          artifacts: [{ kind: 'BROWSE_TOP', marketplace: target.marketplace, buffer: topShot }],
          notes: 'Robot check / CAPTCHA detected',
        };
      }

      const extracted = extractBestsellers(snap.html, { trackedAsins: target.trackedAsins, limit: 100 });
      if (extracted.normalized.topAsins.length === 0) {
        throw new Error(`BESTSELLERS extraction failed: topAsins array is empty (url: ${snap.url})`);
      }
      const normalizedExtracted = {
        type: 'BROWSE_BESTSELLERS',
        sourceUrl: target.sourceUrl,
        ...extracted.normalized,
      };
      const contentHash = sha256Hex(stableStringify(normalizedExtracted));

      const artifacts: CaptureArtifact[] = [{ kind: 'BROWSE_TOP', marketplace: target.marketplace, buffer: topShot }];

      for (const tracked of extracted.normalized.tracked) {
        if (!tracked.found || !tracked.position) continue;
        const locator = page.locator(`[data-asin="${tracked.asin}"]`).first();
        const count = await locator.count();
        if (count === 0) continue;
        const buffer = await locator.screenshot();
        artifacts.push({
          kind: 'BROWSE_RESULT_CARD',
          marketplace: target.marketplace,
          buffer,
          asin: tracked.asin,
          position: tracked.position,
        });
      }

      return {
        status: 'SUCCEEDED',
        finalUrl: snap.url,
        contentHash,
        rawExtracted: extracted.raw,
        normalizedExtracted,
        artifacts,
      };
    }

    throw new Error(`Unsupported target type: ${target.type}`);
  } finally {
    await context.close();
  }
}

export async function launchDefaultBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

