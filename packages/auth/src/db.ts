import { createRequire } from 'node:module'

// Use the Prisma client generated for the portal auth schema.
// Load it at runtime so Next does not try to statically resolve the generated path.
const require = createRequire(import.meta.url)
const PrismaClient: typeof import('../node_modules/.prisma/client-auth/index.js').PrismaClient =
  require('../node_modules/.prisma/client-auth/index.js').PrismaClient

type PortalAuthPrismaClient = InstanceType<typeof PrismaClient>

let prismaInstance: PortalAuthPrismaClient | null = (globalThis as typeof globalThis & {
  __portalAuthPrisma?: PortalAuthPrismaClient | null
}).__portalAuthPrisma ?? null

function resolvePortalDbUrl(): string {
  const databaseUrl = process.env.PORTAL_DB_URL
  if (!databaseUrl) {
    throw new Error('PORTAL_DB_URL is not configured')
  }

  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', 'auth')
  return url.toString()
}

export function getPortalAuthPrisma(): PortalAuthPrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      datasources: {
        db: { url: resolvePortalDbUrl() },
      },
      transactionOptions: { timeout: 30000, maxWait: 30000 },
    })
    if (process.env.NODE_ENV !== 'production') {
      ;(globalThis as typeof globalThis & {
        __portalAuthPrisma?: PortalAuthPrismaClient | null
      }).__portalAuthPrisma = prismaInstance
    }
  }

  return prismaInstance
}

declare global {
  // eslint-disable-next-line no-var -- reuse prisma in dev hot reload
  var __portalAuthPrisma: PortalAuthPrismaClient | null | undefined
}
