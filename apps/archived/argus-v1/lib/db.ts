import { PrismaClient } from '@targon/prisma-argus'

function resolveDatasourceUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL
  if (typeof databaseUrl !== 'string') {
    return undefined
  }

  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', 'argus')
  return url.toString()
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: resolveDatasourceUrl(),
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
