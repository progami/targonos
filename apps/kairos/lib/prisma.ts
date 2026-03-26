import { PrismaClient } from '@targon/prisma-kairos';

type GlobalWithPrisma = typeof globalThis & {
  __kairosPrisma?: PrismaClient;
};

function resolveDatasourceUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const parsed = new URL(raw);
    if (!parsed.searchParams.has('schema')) {
      parsed.searchParams.set('schema', 'kairos');
    }
    parsed.searchParams.set('application_name', 'kairos');
    return parsed.toString();
  } catch {
    return raw;
  }
}

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma =
  globalForPrisma.__kairosPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: resolveDatasourceUrl(),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__kairosPrisma = prisma;
}

export default prisma;
