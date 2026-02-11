import { promises as fs } from 'node:fs';
import path from 'node:path';

import { AutopostError, runAutopostCheck } from '@/lib/plutus/autopost-check';
import { QboAuthError } from '@/lib/qbo/api';

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

async function main(): Promise<void> {
  await loadPlutusEnv();

  try {
    const result = await runAutopostCheck();
    console.log(JSON.stringify(result, null, 2));
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof AutopostError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    if (error instanceof QboAuthError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

