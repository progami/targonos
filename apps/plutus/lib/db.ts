import { PrismaClient } from '@targon/prisma-plutus';

type GlobalWithPrisma = typeof globalThis & {
  __plutusPrisma?: PrismaClient;
};

const DEFAULT_SCHEMA = 'plutus';
const APPLICATION_NAME = 'plutus';
const POSTGRES_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function resolveDatasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const parsed = new URL(raw);
    if (!parsed.searchParams.has('schema')) {
      parsed.searchParams.set('schema', DEFAULT_SCHEMA);
    }
    parsed.searchParams.set('application_name', APPLICATION_NAME);
    return parsed.toString();
  } catch {
    return raw;
  }
}

export function getDatasourceSchema() {
  const raw = process.env.DATABASE_URL;
  if (raw === undefined) {
    throw new Error('DATABASE_URL is required for Plutus database queries');
  }
  if (raw === '') {
    throw new Error('DATABASE_URL is required for Plutus database queries');
  }

  const parsed = new URL(raw);
  const schema = parsed.searchParams.get('schema');
  if (schema === null || schema === '') {
    throw new Error('DATABASE_URL must include a schema for Plutus database queries');
  }
  if (!POSTGRES_IDENTIFIER_RE.test(schema)) {
    throw new Error(`Invalid database schema identifier: ${schema}`);
  }

  return schema;
}

export function dbTableIdentifier(tableName: string) {
  if (!POSTGRES_IDENTIFIER_RE.test(tableName)) {
    throw new Error(`Invalid database table identifier: ${tableName}`);
  }

  return `"${getDatasourceSchema()}"."${tableName}"`;
}

const globalForPrisma = globalThis as GlobalWithPrisma;

let dbInstance = globalForPrisma.__plutusPrisma;
if (dbInstance === undefined) {
  dbInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: resolveDatasourceUrl(),
  });
}

export const db = dbInstance;

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__plutusPrisma = db;
}

export default db;
