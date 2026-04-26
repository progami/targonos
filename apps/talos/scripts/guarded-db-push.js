#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { loadEnvForApp } = require('../../../scripts/lib/shared-env.cjs');

const SHARED_SCHEMAS = new Set([
  'dev_talos_us',
  'dev_talos_uk',
  'main_talos_us',
  'main_talos_uk',
]);

const appDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appDir, '..', '..');

function loadEnvIfNeeded() {
  if (process.env.DATABASE_URL || process.env.DATABASE_URL_US || process.env.DATABASE_URL_UK) {
    return;
  }

  let mode = 'local';
  if (process.env.TALOS_ENV_MODE) {
    mode = process.env.TALOS_ENV_MODE;
  }

  loadEnvForApp({
    repoRoot,
    appName: 'talos',
    mode,
    targetEnv: process.env,
  });
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
