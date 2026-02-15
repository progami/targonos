import { PrismaClient } from '@targon/prisma-argus'

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prismaArgus?: PrismaClientSingleton }

export const prisma = globalForPrisma.prismaArgus ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaArgus = prisma
}

export type { PrismaClient } from '@targon/prisma-argus'
export default prisma
