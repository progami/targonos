import prisma from '../lib/prisma';
import type { StrategyRegion } from '@targon/prisma-xplan';

type StrategyRow = {
  id: string;
  name: string;
  region: StrategyRegion;
};

const SELLERBOARD_ENDPOINTS: Record<StrategyRegion, readonly string[]> = {
  US: ['api/v1/xplan/sellerboard/us-actual-sales', 'api/v1/xplan/sellerboard/us-dashboard'],
  UK: ['api/v1/xplan/sellerboard/uk-actual-sales', 'api/v1/xplan/sellerboard/uk-dashboard'],
};

const REQUIRED_REPORT_URLS: Record<StrategyRegion, readonly string[]> = {
  US: ['SELLERBOARD_US_ORDERS_REPORT_URL', 'SELLERBOARD_US_DASHBOARD_REPORT_URL'],
  UK: ['SELLERBOARD_UK_ORDERS_REPORT_URL', 'SELLERBOARD_UK_DASHBOARD_REPORT_URL'],
};

let stopRequested = false;

function getRequiredEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined) {
    throw new Error(`Missing ${name}`);
  }

  const value = raw.trim();
  if (value === '') {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function getIntervalMs(): number {
  const raw = getRequiredEnv('XPLAN_SELLERBOARD_SYNC_INTERVAL_MINUTES');
  const minutes = Number.parseInt(raw, 10);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('XPLAN_SELLERBOARD_SYNC_INTERVAL_MINUTES must be a positive integer');
  }
  return minutes * 60 * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildEndpointUrl(baseUrl: string, endpoint: string, strategyId: string): URL {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(endpoint, normalizedBase);
  url.searchParams.set('strategyId', strategyId);
  return url;
}

function assertRegionEnv(region: StrategyRegion): void {
  for (const key of REQUIRED_REPORT_URLS[region]) {
    getRequiredEnv(key);
  }
}

async function postSyncEndpoint(baseUrl: string, token: string, endpoint: string, strategyId: string) {
  const url = buildEndpointUrl(baseUrl, endpoint, strategyId);
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Sellerboard endpoint failed ${response.status} ${url.pathname}: ${bodyText}`,
    );
  }

  const payload = bodyText.trim() === '' ? {} : JSON.parse(bodyText);
  console.log(
    `[xplan-sellerboard-sync] endpoint=${url.pathname} strategyId=${strategyId} durationMs=${
      Date.now() - startedAt
    } result=${JSON.stringify(payload)}`,
  );
}

async function loadStrategies(): Promise<StrategyRow[]> {
  return prisma.strategy.findMany({
    where: {
      status: 'ACTIVE',
      isPrimary: true,
    },
    select: {
      id: true,
      name: true,
      region: true,
    },
    orderBy: [{ region: 'asc' }, { updatedAt: 'desc' }],
  });
}

async function syncStrategy(baseUrl: string, token: string, strategy: StrategyRow): Promise<void> {
  assertRegionEnv(strategy.region);
  for (const endpoint of SELLERBOARD_ENDPOINTS[strategy.region]) {
    await postSyncEndpoint(baseUrl, token, endpoint, strategy.id);
  }
}

async function runOnce(baseUrl: string, token: string): Promise<void> {
  const strategies = await loadStrategies();
  console.log(`[xplan-sellerboard-sync] activePrimaryStrategies=${strategies.length}`);

  for (const strategy of strategies) {
    console.log(
      `[xplan-sellerboard-sync] syncing strategyId=${strategy.id} region=${strategy.region} name=${strategy.name}`,
    );
    await syncStrategy(baseUrl, token, strategy);
  }
}

async function main() {
  const intervalMs = getIntervalMs();
  const baseUrl = getRequiredEnv('NEXT_PUBLIC_APP_URL');
  const token = getRequiredEnv('SELLERBOARD_SYNC_TOKEN');

  process.on('SIGINT', () => {
    stopRequested = true;
  });
  process.on('SIGTERM', () => {
    stopRequested = true;
  });

  while (!stopRequested) {
    const startedAt = Date.now();
    await runOnce(baseUrl, token);
    console.log(`[xplan-sellerboard-sync] runDurationMs=${Date.now() - startedAt}`);
    await sleep(intervalMs);
  }
}

main()
  .catch(async (error) => {
    console.error('[xplan-sellerboard-sync] fatal', error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .then(async () => {
    await prisma.$disconnect();
  });
