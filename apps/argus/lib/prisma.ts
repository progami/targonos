import { PrismaClient } from '@targon/prisma-argus';

type GlobalWithPrisma = typeof globalThis & {
  __argusPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

export const prisma =
  globalForPrisma.__argusPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__argusPrisma = prisma;
}

export default prisma;

