import { PrismaClient } from '@targon/prisma-xplan';

type GlobalWithPrisma = typeof globalThis & {
  __xplanPrisma?: PrismaClient;
};

const DEFAULT_SCHEMA = 'xplan';
const APPLICATION_NAME = 'xplan';

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

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma =
  globalForPrisma.__xplanPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: resolveDatasourceUrl(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__xplanPrisma = prisma;
}

export default prisma;
