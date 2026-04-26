import { promises as fs } from 'node:fs';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  startDate: string;
  endDate: string | undefined;
  settlementIds: string[] | undefined;
  amazonEnvPath: string | null;
  plutusEnvPath: string;
  postToQbo: boolean;
  process: boolean;
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

async function loadAmazonEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const isAmazon = parsed.key.startsWith('AMAZON_') || parsed.key.startsWith('AWS_');
    if (!isAmazon) continue;
    if (process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
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
  let startDate = '2025-12-01';
  let endDate: string | undefined;
  let settlementIds: string[] | undefined;
  let amazonEnvPath: string | null = null;
  let plutusEnvPath = '.env.local';
  let postToQbo = true;
  let process = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--start-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --start-date');
      startDate = next;
      i += 2;
      continue;
    }

    if (arg === '--end-date') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --end-date');
      endDate = next;
      i += 2;
      continue;
    }

    if (arg === '--settlement-ids') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --settlement-ids');
      settlementIds = next
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== '');
      i += 2;
      continue;
    }

    if (arg === '--amazon-env') {
      const next = argv[i + 1];
      if (!next) throw new Error('Missing value for --amazon-env');
      amazonEnvPath = next;
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

    if (arg === '--no-post') {
      postToQbo = false;
      i += 1;
      continue;
    }

    if (arg === '--process') {
      process = true;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { startDate, endDate, settlementIds, amazonEnvPath, plutusEnvPath, postToQbo, process };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.amazonEnvPath === null) {
    loadSharedPlutusEnv();
  } else {
    await loadAmazonEnvFile(options.amazonEnvPath);
  }
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { syncUkSettlementsFromSpApiFinances } = await import('@/lib/amazon-finances/uk-settlement-sync');

  const result = await syncUkSettlementsFromSpApiFinances({
    startDate: options.startDate,
    endDate: options.endDate,
    settlementIds: options.settlementIds,
    postToQbo: options.postToQbo,
    process: options.process,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
