#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const SHARED_SCHEMAS = new Set([
  'dev_talos_us',
  'dev_talos_uk',
  'main_talos_us',
  'main_talos_uk',
]);

const appDir = path.resolve(__dirname, '..');
const envCandidates = [
  path.join(appDir, '.env.local'),
  path.join(appDir, '.env.dev'),
  path.join(appDir, '.env.production'),
  path.join(appDir, '.env'),
];

function parseDotenv(filePath) {
  const out = {};
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const line = trimmed.startsWith('export ') ? trimmed.slice(7).trimStart() : trimmed;
    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = line.slice(separator + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvIfNeeded() {
  if (process.env.DATABASE_URL || process.env.DATABASE_URL_US || process.env.DATABASE_URL_UK) {
    return;
  }

  for (const candidate of envCandidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const parsed = parseDotenv(candidate);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    if (process.env.DATABASE_URL || process.env.DATABASE_URL_US || process.env.DATABASE_URL_UK) {
      return;
    }
  }
}

function resolveConnectionStrings() {
  const urls = [];
  if (process.env.DATABASE_URL_US) {
    urls.push(process.env.DATABASE_URL_US);
  }
  if (process.env.DATABASE_URL_UK) {
    urls.push(process.env.DATABASE_URL_UK);
  }
  if (process.env.DATABASE_URL) {
    urls.push(process.env.DATABASE_URL);
  }
  return urls;
}

function getSchemaFromUrl(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return parsed.searchParams.get('schema');
  } catch (_error) {
    console.error('Invalid database URL. Refusing to run Prisma db push.');
    process.exit(1);
  }
}

loadEnvIfNeeded();

const urls = resolveConnectionStrings();
if (urls.length === 0) {
  console.error('No Talos DATABASE_URL(_US/_UK) found. Refusing to run Prisma db push.');
  process.exit(1);
}

const sharedTargets = [];
for (const url of urls) {
  const schema = getSchemaFromUrl(url);
  if (schema && SHARED_SCHEMAS.has(schema)) {
    sharedTargets.push(schema);
  }
}

if (sharedTargets.length > 0 && process.env.ALLOW_SHARED_DB_DDL !== 'true') {
  const uniqueSchemas = [...new Set(sharedTargets)].join(', ');
  console.error(
    `Refusing Prisma db push for shared Talos schemas: ${uniqueSchemas}. Use migration scripts + deploy pipeline.`
  );
  console.error('Break-glass only: set ALLOW_SHARED_DB_DDL=true for a one-off run.');
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'prisma', 'db', 'push'], {
  cwd: appDir,
  stdio: 'inherit',
  env: process.env,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
