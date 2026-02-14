import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  buildScheduledLocalDateTime,
  formatLocalDate,
  parseAutoRefreshTimeLocal,
  shouldRefreshCashflowSnapshot,
} from '@/lib/plutus/cashflow/auto-refresh';
import {
  generateAndPersistCashflowSnapshot,
  getLatestCashflowSnapshotMeta,
  getOrCreateCashflowConfig,
} from '@/lib/plutus/cashflow/snapshot';

const TICK_MS = 60_000;

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

  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  if (hasSingleQuotes) {
    value = value.slice(1, -1);
  }

  if (hasDoubleQuotes) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadEnvFile(filePath: string): Promise<void> {
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

    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function log(level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    worker: 'plutus-cashflow-refresh',
    level,
    message,
    details,
  };

  const serialized = JSON.stringify(payload);
  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

async function runTick(): Promise<void> {
  const config = await getOrCreateCashflowConfig();

  if (config.autoRefreshEnabled !== true) {
    return;
  }

  parseAutoRefreshTimeLocal(config.autoRefreshTimeLocal);

  const now = new Date();
  const todayLocalDate = formatLocalDate(now);
  const scheduledToday = buildScheduledLocalDateTime({
    now,
    autoRefreshTimeLocal: config.autoRefreshTimeLocal,
  });

  if (now.getTime() < scheduledToday.getTime()) {
    return;
  }

  const latestSnapshot = await getLatestCashflowSnapshotMeta();
  const shouldRefresh = shouldRefreshCashflowSnapshot({
    now,
    todayLocalDate,
    latestSnapshot,
    autoRefreshMinSnapshotAgeMinutes: config.autoRefreshMinSnapshotAgeMinutes,
  });

  if (!shouldRefresh) {
    return;
  }

  const snapshot = await generateAndPersistCashflowSnapshot();
  log('info', 'Generated daily cashflow snapshot', {
    snapshotId: snapshot.id,
    asOfDate: snapshot.asOfDate,
    warningsCount: snapshot.warnings.length,
  });
}

async function main(): Promise<void> {
  await loadPlutusEnv();

  const enabled = process.env.PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED === '1';
  if (!enabled) {
    log('info', 'Worker disabled by env; idling', {
      envVar: 'PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED',
    });
  } else {
    log('info', 'Worker started', {
      tickSeconds: TICK_MS / 1000,
    });
  }

  while (true) {
    if (enabled) {
      try {
        await runTick();
      } catch (error) {
        log('error', 'Cashflow refresh tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await sleep(TICK_MS);
  }
}

main().catch((error) => {
  log('error', 'Worker crashed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
