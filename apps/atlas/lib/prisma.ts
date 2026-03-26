import { PrismaClient } from '@targon/prisma-atlas'

const MAX_BROADCAST_EMAIL_DISPATCHES = 2000

function resolveDatasourceUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL
  if (typeof databaseUrl !== 'string') {
    return undefined
  }

  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', 'atlas')
  return url.toString()
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasourceUrl: resolveDatasourceUrl(),
  })

  return client.$extends({
    query: {
      notification: {
        async create({ args, query }) {
          const data = args.data as unknown as {
            employeeId?: string | null
            emailDispatches?: unknown
          }

          const employeeId = data.employeeId ?? null

          // Targeted notifications: enqueue an email-dispatch row in the same DB write (tx-safe).
          if (employeeId && !data.emailDispatches) {
            data.emailDispatches = { create: { employeeId } }
          }

          // Broadcast notifications: pre-create per-employee dispatch rows as a nested createMany (tx-safe).
          if (!employeeId && !data.emailDispatches) {
            const employees = await client.employee.findMany({
              where: { status: 'ACTIVE' },
              select: { id: true },
              take: MAX_BROADCAST_EMAIL_DISPATCHES + 1,
            })

            if (employees.length > 0 && employees.length <= MAX_BROADCAST_EMAIL_DISPATCHES) {
              data.emailDispatches = {
                createMany: {
                  data: employees.map((e) => ({ employeeId: e.id })),
                  skipDuplicates: true,
                },
              }
            }
          }

          return query(args)
        },
      },
    },
  })
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClientSingleton }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export type { PrismaClient } from '@targon/prisma-atlas'
export default prisma
