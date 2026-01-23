import { PrismaClient } from '@targon/prisma-plutus';

type GlobalWithPrisma = typeof globalThis & {
  __plutusPrisma?: PrismaClient;
};

const DEFAULT_SCHEMA = 'plutus';

function resolveDatasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const parsed = new URL(raw);
    if (!parsed.searchParams.has('schema')) {
      parsed.searchParams.set('schema', DEFAULT_SCHEMA);
      return parsed.toString();
    }
    return raw;
  } catch {
    return raw;
  }
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
