import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const POSTGRES_SERVICE = 'postgresql@14';
const PGBOUNCER_SERVICE = 'pgbouncer';
const POSTGRES_PORT = 5432;
const POSTGRES_READY_TIMEOUT_MS = 20_000;
const DATABASE_READY_TIMEOUT_MS = 20_000;
const SLEEP_MS = 500;

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    timeout: options.timeoutMs,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    if (stderr !== '') {
      fail(stderr);
    }

    const stdout = result.stdout.trim();
    if (stdout !== '') {
      fail(stdout);
    }

    fail(`${command} exited with code ${result.status}`);
  }

  return result.stdout.trim();
}

function tryRunCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    timeout: options.timeoutMs,
  });

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  return {
    status: result.status,
    stdout,
    stderr,
    error: result.error ?? null,
  };
}

function parseEnvFile(filePath) {
  const values = new Map();
  const text = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      continue;
    }
    if (line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  return values;
}

function requireEnvValue(values, key, filePath) {
  const value = values.get(key);
  if (value === undefined) {
    fail(`Missing ${key} in ${filePath}`);
  }
  if (value.trim() === '') {
    fail(`Missing ${key} in ${filePath}`);
  }
  return value.trim();
}

export function parsePostmasterPid(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 8) {
    fail('postmaster.pid is incomplete');
  }

  const pid = Number(lines[0]);
  const port = Number(lines[3]);

  if (!Number.isInteger(pid) || pid <= 0) {
    fail(`Invalid postgres pid in postmaster.pid: ${lines[0]}`);
  }

  if (!Number.isInteger(port) || port <= 0) {
    fail(`Invalid postgres port in postmaster.pid: ${lines[3]}`);
  }

  return {
    pid,
    dataDir: lines[1],
    port,
    socketDir: lines[4],
    listenAddresses: lines[5],
    status: lines[7].trim(),
  };
}

export function shouldRemoveStalePostmasterPid({ pidInfo, command }) {
  if (pidInfo.status === 'stopping') {
    return true;
  }

  if (command === null) {
    return true;
  }

  const normalized = command.trim().toLowerCase();
  if (!normalized.includes('postgres')) {
    return true;
  }

  return false;
}

function readProcessCommand(pid) {
  const result = tryRunCommand('ps', ['-p', String(pid), '-o', 'command=']);
  if (result.status !== 0) {
    return null;
  }
  if (result.stdout === '') {
    return null;
  }
  return result.stdout;
}

function recoverStalePostmasterPid(dataDir) {
  const pidPath = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidPath)) {
    return false;
  }

  const pidInfo = parsePostmasterPid(fs.readFileSync(pidPath, 'utf8'));
  const command = readProcessCommand(pidInfo.pid);

  if (!shouldRemoveStalePostmasterPid({ pidInfo, command })) {
    return false;
  }

  fs.unlinkSync(pidPath);
  return true;
}

function getHomebrewPrefix() {
  return runCommand('brew', ['--prefix']);
}

function isPortReady(port) {
  const result = tryRunCommand('pg_isready', ['-h', 'localhost', '-p', String(port)], {
    timeoutMs: 3_000,
  });
  if (result.status === 0) {
    return true;
  }
  return false;
}

function waitForPortReady(port, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (isPortReady(port)) {
      return;
    }
    sleep(SLEEP_MS);
  }

  fail(`${label} did not become ready on localhost:${port}`);
}

function buildPsqlInvocation(databaseUrl) {
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');

  if (database === '') {
    fail(`Invalid database URL: ${databaseUrl}`);
  }

  if (url.username.trim() === '') {
    fail(`Database URL is missing a username: ${databaseUrl}`);
  }

  if (url.password.trim() === '') {
    fail(`Database URL is missing a password: ${databaseUrl}`);
  }

  const args = [
    '-h', url.hostname,
    '-p', String(url.port === '' ? POSTGRES_PORT : Number(url.port)),
    '-U', decodeURIComponent(url.username),
    '-d', database,
    '-w',
    '-tA',
    '-c', 'select 1',
  ];

  const env = { ...process.env };
  env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGCONNECT_TIMEOUT = '3';

  const schema = url.searchParams.get('schema');
  if (schema !== null && schema.trim() !== '') {
    env.PGOPTIONS = `-c search_path=${schema.trim()}`;
  }

  return { args, env };
}

function canQueryDatabase(databaseUrl) {
  const { args, env } = buildPsqlInvocation(databaseUrl);
  const result = tryRunCommand('psql', args, {
    env,
    timeoutMs: 5_000,
  });

  if (result.status === 0 && result.stdout === '1') {
    return true;
  }

  return false;
}

export function resolveWorktreeRoot() {
  const worktreeRoot = process.env.CODEX_WORKTREE_PATH;
  if (worktreeRoot === undefined) {
    fail('CODEX_WORKTREE_PATH is required for Prisma readiness checks');
  }
  if (worktreeRoot.trim() === '') {
    fail('CODEX_WORKTREE_PATH is required for Prisma readiness checks');
  }
  return worktreeRoot.trim();
}

export function buildPrismaClientPath(worktreeRoot) {
  return path.join(
    worktreeRoot,
    'packages',
    'auth',
    'node_modules',
    '.prisma',
    'client-auth',
    'index.js',
  );
}

export function buildPrismaProbeScript(clientPath, databaseUrl) {
  return `
const { PrismaClient } = require(${JSON.stringify(clientPath)});
const prisma = new PrismaClient({ datasources: { db: { url: ${JSON.stringify(databaseUrl)} } } });
(async () => {
  try {
    const rows = await prisma.$queryRawUnsafe('select 1');
    if (Array.isArray(rows) && rows.length === 1 && rows[0]['?column?'] === 1) {
      process.stdout.write('1');
      return;
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
})().catch(() => {
  process.exit(1);
});
`.trim();
}

function canQueryPrisma(databaseUrl) {
  const worktreeRoot = resolveWorktreeRoot();
  const clientPath = buildPrismaClientPath(worktreeRoot);

  const result = tryRunCommand(
    'node',
    ['-e', buildPrismaProbeScript(clientPath, databaseUrl)],
    {
      cwd: worktreeRoot,
      timeoutMs: 8_000,
    },
  );

  if (result.status === 0 && result.stdout === '1') {
    return true;
  }

  return false;
}

function isPortalDatabaseReady(databaseUrl) {
  if (!canQueryDatabase(databaseUrl)) {
    return false;
  }
  if (!canQueryPrisma(databaseUrl)) {
    return false;
  }
  return true;
}

function waitForDatabaseReady(databaseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (isPortalDatabaseReady(databaseUrl)) {
      return;
    }
    sleep(SLEEP_MS);
  }

  fail(`Portal database readiness checks did not succeed for ${databaseUrl}`);
}

function restartBrewService(serviceName) {
  runCommand('brew', ['services', 'restart', serviceName]);
}

function resolvePortalDbUrl() {
  const envPath = path.join(ROOT, 'apps', 'sso', '.env.local');
  const values = parseEnvFile(envPath);
  return requireEnvValue(values, 'PORTAL_DB_URL', envPath);
}

function main() {
  const portalDbUrl = resolvePortalDbUrl();
  if (isPortalDatabaseReady(portalDbUrl)) {
    process.stdout.write('worktree db ready\n');
    return;
  }

  const homebrewPrefix = getHomebrewPrefix();
  const postgresDataDir = path.join(homebrewPrefix, 'var', POSTGRES_SERVICE);

  recoverStalePostmasterPid(postgresDataDir);
  restartBrewService(POSTGRES_SERVICE);
  waitForPortReady(POSTGRES_PORT, POSTGRES_READY_TIMEOUT_MS, POSTGRES_SERVICE);

  restartBrewService(PGBOUNCER_SERVICE);
  waitForDatabaseReady(portalDbUrl, DATABASE_READY_TIMEOUT_MS);

  process.stdout.write('worktree db ready\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
