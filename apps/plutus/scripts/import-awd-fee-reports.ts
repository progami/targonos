import { promises as fs } from 'node:fs';
import path from 'node:path';

import { parseAwdCsvForMarketplace, readAwdCsvText, requireMarketplace, type AwdMarketplace } from '@/lib/awd/upload-helpers';

type CliOptions = {
  marketplace: AwdMarketplace;
  dir: string;
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
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isPlutus = parsed.key === 'DATABASE_URL' || parsed.key.startsWith('QBO_') || parsed.key.startsWith('PLUTUS_');
    if (!isPlutus) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let marketplace: AwdMarketplace = 'amazon.com';
  let dir = '/Users/jarraramjad/AWD-Fee-Reports';
  let plutusEnvPath = '.env.local';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--marketplace') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --marketplace');
      marketplace = requireMarketplace(next);
      i += 2;
      continue;
    }

    if (arg === '--dir') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --dir');
      dir = next;
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

  return { marketplace, dir, plutusEnvPath };
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  await loadPlutusEnvFile(options.plutusEnvPath);
  const { db } = await import('@/lib/db');

  const entries = await fs.readdir(options.dir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.csv') || name.toLowerCase().endsWith('.zip'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No report files found in ${options.dir}`);
  }

  const results: Array<{
    filename: string;
    uploadId: string;
    minDate: string;
    maxDate: string;
    rowCount: number;
    skuCount: number;
    totalFeeCents: number;
  }> = [];

  for (const filename of files) {
    const fullPath = path.join(options.dir, filename);
    const buffer = await fs.readFile(fullPath);
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    const file = new File([bytes], filename);

    const { csvText, sourceFilename } = await readAwdCsvText(file);
    const parsed = parseAwdCsvForMarketplace(csvText, options.marketplace);

    let totalFeeCents = 0;
    for (const row of parsed.rows) {
      totalFeeCents += row.feeCents;
    }

    const upload = await db.awdDataUpload.create({
      data: {
        reportType: 'AWD_FEE_MONTHLY',
        marketplace: options.marketplace,
        filename: sourceFilename,
        startDate: parsed.minDate,
        endDate: parsed.maxDate,
        rowCount: parsed.rows.length,
        skuCount: parsed.skuCount,
        minDate: parsed.minDate,
        maxDate: parsed.maxDate,
        rows: {
          createMany: {
            data: parsed.rows.map((row) => ({
              monthStartDate: row.monthStartDate,
              monthEndDate: row.monthEndDate,
              sku: row.sku,
              feeType: row.feeType,
              chargeType: row.chargeType,
              feeCents: row.feeCents,
              currency: row.currency,
            })),
          },
        },
      },
      select: { id: true },
    });

    results.push({
      filename,
      uploadId: upload.id,
      minDate: parsed.minDate,
      maxDate: parsed.maxDate,
      rowCount: parsed.rows.length,
      skuCount: parsed.skuCount,
      totalFeeCents,
    });
  }

  console.log(
    JSON.stringify(
      {
        marketplace: options.marketplace,
        dir: options.dir,
        uploads: results.map((r) => ({
          filename: r.filename,
          uploadId: r.uploadId,
          dateRange: `${r.minDate}..${r.maxDate}`,
          rowCount: r.rowCount,
          skuCount: r.skuCount,
          totalFees: formatCents(r.totalFeeCents),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
