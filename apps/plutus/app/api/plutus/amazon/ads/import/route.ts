import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createLogger } from '@targon/logger';
import { callAmazonApi, getAmazonSpApiConfig, type TenantCode } from '@targon/amazon-sp-api';
import { allocateByWeight } from '@/lib/inventory/money';
import db from '@/lib/db';
import { createPurchase, fetchPurchases, QboAuthError, type QboConnection, type QboPurchase } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { buildPurchaseAllocationDescription, normalizePurchaseSku } from '@/lib/plutus/purchases/description';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-amazon-ads-import' });

type AdsImportRequest = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  tenantCodes: TenantCode[];
  paymentAccountId: string;
};

type SpApiCurrency = {
  currencyCode?: string;
  currencyAmount?: number;
};

type SpApiTransaction = {
  transactionId?: string;
  transactionType?: string;
  description?: string;
  postedDate?: string;
  totalAmount?: SpApiCurrency;
  marketplaceDetails?: {
    marketplaceId?: string;
  };
};

type SpApiListTransactionsResponse = {
  transactions?: SpApiTransaction[];
  nextToken?: string;
};

function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return trimmed;
}

function startOfDayUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function tenantToMarketplace(tenantCode: TenantCode): 'amazon.com' | 'amazon.co.uk' {
  if (tenantCode === 'US') {
    return 'amazon.com';
  }
  return 'amazon.co.uk';
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function buildDocNumber(input: { tenantCode: TenantCode; amazonTransactionId: string }): string {
  const hash = createHash('sha1').update(input.amazonTransactionId).digest('hex').slice(0, 8).toUpperCase();
  return `AMZADS-${input.tenantCode}-${hash}`;
}

function isAmazonAdvertisingTransaction(tx: SpApiTransaction): boolean {
  const type = tx.transactionType ? tx.transactionType.toLowerCase() : '';
  const description = tx.description ? tx.description.toLowerCase() : '';
  return (
    type.includes('advert') ||
    description.includes('advert') ||
    description.includes('sponsored') ||
    description.includes('ppc')
  );
}

function parsePostedDate(input: string): { txnDate: string; monthKey: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Missing postedDate');
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid postedDate: ${trimmed}`);
  }
  const txnDate = date.toISOString().slice(0, 10);
  return { txnDate, monthKey: date.toISOString().slice(0, 7) };
}

async function fetchAllAmazonTransactions(input: {
  tenantCode: TenantCode;
  postedAfter: string;
  postedBefore: string;
}): Promise<SpApiTransaction[]> {
  const config = getAmazonSpApiConfig(input.tenantCode);
  const all: SpApiTransaction[] = [];
  let nextToken: string | undefined;

  while (true) {
    const query: Record<string, unknown> = {
      postedAfter: input.postedAfter,
      postedBefore: input.postedBefore,
      marketplaceId: config.marketplaceId,
    };

    if (nextToken !== undefined) {
      query.nextToken = nextToken;
    }

    const response = await callAmazonApi<SpApiListTransactionsResponse>(input.tenantCode, {
      operation: 'listTransactions',
      endpoint: 'finances',
      options: { version: '2024-06-19' },
      query,
    });

    const batch = Array.isArray(response.transactions) ? response.transactions : [];
    all.push(...batch);

    if (!response.nextToken) {
      break;
    }

    nextToken = response.nextToken;
  }

  return all;
}

async function fetchPurchasesByDocNumberPrefix(input: {
  connection: QboConnection;
  startDate: string;
  endDate: string;
  docNumberContains: string;
}): Promise<{ purchases: QboPurchase[]; updatedConnection?: QboConnection }> {
  const purchases: QboPurchase[] = [];
  let activeConnection = input.connection;
  let startPosition = 1;
  const batchSize = 1000;

  while (true) {
    const result = await fetchPurchases(activeConnection, {
      startDate: input.startDate,
      endDate: input.endDate,
      docNumberContains: input.docNumberContains,
      maxResults: batchSize,
      startPosition,
    });

    if (result.updatedConnection) {
      activeConnection = result.updatedConnection;
    }

    purchases.push(...result.purchases);

    if (result.purchases.length < batchSize) {
      return { purchases, updatedConnection: result.updatedConnection };
    }

    startPosition += batchSize;
  }
}

async function loadMonthlySkuMix(input: {
  tenantCode: TenantCode;
  monthKey: string; // YYYY-MM
}): Promise<Map<string, number>> {
  const marketplace = tenantToMarketplace(input.tenantCode);

  const monthStart = new Date(`${input.monthKey}-01T00:00:00.000Z`);
  if (Number.isNaN(monthStart.getTime())) {
    throw new Error(`Invalid monthKey: ${input.monthKey}`);
  }
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));

  const knownSkus = await db.sku.findMany({
    where: { brand: { marketplace } },
    select: { sku: true },
  });
  const knownSkuSet = new Set<string>(knownSkus.map((row) => normalizePurchaseSku(row.sku)));

  const grouped = await db.orderSale.groupBy({
    by: ['sku'],
    where: {
      marketplace,
      saleDate: { gte: monthStart, lt: monthEnd },
    },
    _sum: { quantity: true },
  });

  const mix = new Map<string, number>();
  for (const row of grouped) {
    const normalizedSku = normalizePurchaseSku(row.sku);
    if (!knownSkuSet.has(normalizedSku)) {
      continue;
    }

    const units = row._sum.quantity;
    if (units === null || units < 1) {
      continue;
    }

    const existing = mix.get(normalizedSku);
    mix.set(normalizedSku, existing === undefined ? units : existing + units);
  }

  if (mix.size === 0) {
    throw new Error(`No SKU mix available for ${input.tenantCode} ${input.monthKey}. Run settlement processing first.`);
  }

  return mix;
}

export async function POST(req: NextRequest) {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const body = (await req.json()) as Partial<AdsImportRequest>;

    const startDate = requireIsoDate(body.startDate, 'startDate');
    const endDate = requireIsoDate(body.endDate, 'endDate');

    if (!Array.isArray(body.tenantCodes) || body.tenantCodes.length === 0) {
      return NextResponse.json({ error: 'tenantCodes array is required' }, { status: 400 });
    }
    for (const tenantCode of body.tenantCodes) {
      if (tenantCode !== 'US' && tenantCode !== 'UK') {
        return NextResponse.json({ error: `Invalid tenantCode: ${String(tenantCode)}` }, { status: 400 });
      }
    }

    if (typeof body.paymentAccountId !== 'string' || body.paymentAccountId.trim() === '') {
      return NextResponse.json({ error: 'paymentAccountId is required' }, { status: 400 });
    }
    const paymentAccountId = body.paymentAccountId.trim();

    const config = await db.setupConfig.findFirst();
    const advertisingAccountId = config?.amazonAdvertisingCosts;
    if (!advertisingAccountId) {
      return NextResponse.json({ error: 'SetupConfig.amazonAdvertisingCosts is required' }, { status: 400 });
    }

    const postedAfter = startOfDayUtc(startDate).toISOString();
    const postedBefore = addDaysUtc(startOfDayUtc(endDate), 1).toISOString();

    let activeConnection: QboConnection = connection;
    const created: Array<{ tenantCode: TenantCode; amazonTransactionId: string; qboPurchaseId: string; docNumber: string }> = [];
    const skipped: Array<{ tenantCode: TenantCode; amazonTransactionId: string; docNumber: string; reason: string }> = [];

    for (const tenantCode of body.tenantCodes) {
      logger.info('Importing Amazon Ads transactions', { tenantCode, startDate, endDate });

      const [transactions, existingPurchasesResult] = await Promise.all([
        fetchAllAmazonTransactions({ tenantCode, postedAfter, postedBefore }),
        fetchPurchasesByDocNumberPrefix({
          connection: activeConnection,
          startDate,
          endDate,
          docNumberContains: `AMZADS-${tenantCode}-`,
        }),
      ]);

      if (existingPurchasesResult.updatedConnection) {
        activeConnection = existingPurchasesResult.updatedConnection;
      }

      const existingDocNumbers = new Set<string>();
      for (const purchase of existingPurchasesResult.purchases) {
        if (purchase.DocNumber && purchase.DocNumber.trim() !== '') {
          existingDocNumbers.add(purchase.DocNumber.trim());
        }
      }

      const candidates = transactions.filter((tx) => isAmazonAdvertisingTransaction(tx));
      logger.info('Filtered Amazon transactions to ads candidates', {
        tenantCode,
        fetchedCount: transactions.length,
        candidateCount: candidates.length,
      });

      const monthMixCache = new Map<string, Map<string, number>>();

      for (const tx of candidates) {
        const amazonTransactionId = tx.transactionId ? tx.transactionId.trim() : '';
        if (amazonTransactionId === '') {
          skipped.push({ tenantCode, amazonTransactionId: '', docNumber: '', reason: 'Missing transactionId' });
          continue;
        }

        const docNumber = buildDocNumber({ tenantCode, amazonTransactionId });
        if (existingDocNumbers.has(docNumber)) {
          skipped.push({ tenantCode, amazonTransactionId, docNumber, reason: 'Already imported' });
          continue;
        }

        const postedDate = tx.postedDate ? tx.postedDate : '';
        const { txnDate, monthKey } = parsePostedDate(postedDate);

        const currencyAmount = tx.totalAmount?.currencyAmount;
        if (typeof currencyAmount !== 'number' || !Number.isFinite(currencyAmount) || currencyAmount === 0) {
          skipped.push({ tenantCode, amazonTransactionId, docNumber, reason: 'Missing totalAmount' });
          continue;
        }

        const totalCents = Math.round(Math.abs(currencyAmount) * 100);
        if (!Number.isInteger(totalCents) || totalCents < 1) {
          skipped.push({ tenantCode, amazonTransactionId, docNumber, reason: 'Invalid amount' });
          continue;
        }

        let monthMix = monthMixCache.get(monthKey);
        if (!monthMix) {
          monthMix = await loadMonthlySkuMix({ tenantCode, monthKey });
          monthMixCache.set(monthKey, monthMix);
        }

        const allocation = allocateByWeight(
          totalCents,
          Array.from(monthMix.entries()).map(([sku, weight]) => ({ key: sku, weight })),
        );

        const lines = Array.from(monthMix.entries())
          .map(([sku, weight]) => {
            const amountCents = allocation[sku];
            if (amountCents === undefined) {
              throw new Error(`Missing allocation for ${sku} (${tenantCode} ${amazonTransactionId})`);
            }
            return {
              amount: amountCents / 100,
              accountId: advertisingAccountId,
              description: buildPurchaseAllocationDescription(sku, tenantCode, weight),
            };
          })
          .filter((line) => line.amount > 0);

        const privateNoteParts: string[] = ['Amazon Ads', tenantCode];
        if (tx.description && tx.description.trim() !== '') {
          privateNoteParts.push(tx.description.trim().slice(0, 120));
        }
        privateNoteParts.push(`tx:${amazonTransactionId}`);

        const createResult = await createPurchase(activeConnection, {
          txnDate,
          paymentType: 'CreditCard',
          paymentAccountId,
          docNumber,
          privateNote: privateNoteParts.join(' | '),
          lines,
        });

        if (createResult.updatedConnection) {
          activeConnection = createResult.updatedConnection;
        }

        created.push({
          tenantCode,
          amazonTransactionId,
          qboPurchaseId: createResult.purchase.Id,
          docNumber,
        });
      }
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to import Amazon Ads transactions', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: 'Failed to import Amazon Ads transactions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
