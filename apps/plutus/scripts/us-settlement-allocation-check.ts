import { promises as fs } from 'node:fs';

import type { LmbAuditRow } from '@/lib/lmb/audit-csv';

type CliOptions = {
  invoiceId: string;
  marketplace: 'amazon.com' | 'amazon.co.uk';
  plutusEnvPath: string;
};

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim();
  if (line === '') return null;
  if (line.startsWith('#')) return null;

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim();
  }

  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = line.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = line.slice(equalsIndex + 1).trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadPlutusEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isPlutus = parsed.key === 'DATABASE_URL' || parsed.key.startsWith('QBO_') || parsed.key.startsWith('PLUTUS_');
    if (!isPlutus) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let invoiceId = '';
  let marketplace: 'amazon.com' | 'amazon.co.uk' = 'amazon.com';
  let plutusEnvPath = '.env.local';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--invoice-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --invoice-id');
      invoiceId = next.trim();
      i += 2;
      continue;
    }

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      if (next !== 'amazon.com' && next !== 'amazon.co.uk') {
        throw new Error('Invalid --marketplace (expected amazon.com or amazon.co.uk)');
      }
      marketplace = next;
      i += 2;
      continue;
    }

    if (arg === '--plutus-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --plutus-env');
      plutusEnvPath = next;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (invoiceId === '') {
    throw new Error('Usage: pnpm settlements:allocation:check --invoice-id <id> [--marketplace amazon.com|amazon.co.uk]');
  }

  return { invoiceId, marketplace, plutusEnvPath };
}

function centsFromNet(net: number): number {
  return Math.round(net * 100);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { db } = await import('@/lib/db');
  const { computePnlAllocation } = await import('@/lib/pnl-allocation');
  const { buildDeterministicSkuAllocations } = await import('@/lib/plutus/fee-allocation');
  const { normalizeAuditMarketToMarketplaceId } = await import('@/lib/plutus/audit-invoice-matching');
  const { normalizeSku } = await import('@/lib/plutus/settlement-validation');

  const skuRows = await db.sku.findMany({ include: { brand: true } });
  const skuToBrand = new Map<string, string>();
  for (const row of skuRows) {
    if (row.brand.marketplace !== options.marketplace) continue;
    skuToBrand.set(normalizeSku(row.sku), row.brand.name);
  }

  const storedRows = await db.auditDataRow.findMany({
    where: { invoiceId: options.invoiceId },
    select: {
      invoiceId: true,
      market: true,
      date: true,
      orderId: true,
      sku: true,
      quantity: true,
      description: true,
      net: true,
    },
  });

  const scopedRows = storedRows.filter((row) => normalizeAuditMarketToMarketplaceId(row.market) === options.marketplace);

  if (scopedRows.length === 0) {
    throw new Error(`No AuditDataRow found for invoiceId=${options.invoiceId} marketplace=${options.marketplace}`);
  }

  const auditRows: LmbAuditRow[] = scopedRows.map((r) => ({
    invoice: r.invoiceId,
    market: r.market,
    date: r.date,
    orderId: r.orderId,
    sku: r.sku,
    quantity: r.quantity,
    description: r.description,
    net: r.net / 100,
  }));

  let minDate = auditRows[0]!.date;
  let maxDate = auditRows[0]!.date;
  for (const row of auditRows) {
    if (row.date < minDate) minDate = row.date;
    if (row.date > maxDate) maxDate = row.date;
  }

  const deterministic = await buildDeterministicSkuAllocations({
    rows: auditRows,
    marketplace: options.marketplace,
    invoiceStartDate: minDate,
    invoiceEndDate: maxDate,
    skuToBrand,
  });

  const brandResolver = {
    getBrandForSku: (skuRaw: string) => {
      const sku = normalizeSku(skuRaw);
      const brand = skuToBrand.get(sku);
      if (!brand) throw new Error(`SKU not mapped to brand: ${sku}`);
      return brand;
    },
  };

  const pnl = computePnlAllocation(auditRows, brandResolver, {
    skuAllocationsByBucket: deterministic.skuAllocationsByBucket,
  });

  const bucketTotals: Record<string, number> = {};
  for (const [bucket, allocations] of Object.entries(pnl.allocationsByBucket)) {
    let total = 0;
    for (const cents of Object.values(allocations)) total += cents;
    bucketTotals[bucket] = total;
  }

  console.log(
    JSON.stringify(
      {
        options,
        invoiceRange: { minDate, maxDate, rows: auditRows.length },
        deterministicIssues: deterministic.issues,
        unallocatedSkuLessBuckets: pnl.unallocatedSkuLessBuckets,
        allocatedBucketTotalsCents: bucketTotals,
        skuAllocationCountsByBucket: Object.fromEntries(
          Object.entries(deterministic.skuAllocationsByBucket).map(([bucket, bySku]) => [bucket, Object.keys(bySku ?? {}).length]),
        ),
        auditSkuLessByBucketCents: auditRows.reduce((acc, row) => {
          if (row.sku.trim() !== '') return acc;
          const bucket = row.description.trim().split(' - ')[0];
          const cents = centsFromNet(row.net);
          acc[bucket] = (acc[bucket] === undefined ? 0 : acc[bucket]) + cents;
          return acc;
        }, {} as Record<string, number>),
      },
      null,
      2,
    ),
  );

  if (deterministic.issues.length > 0 || pnl.unallocatedSkuLessBuckets.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
