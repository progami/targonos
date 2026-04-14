/**
 * Dynamic Prisma client factory for multi-tenant database connections.
 * Each tenant has its own isolated database with a separate Prisma client instance.
 */

import { PrismaClient } from '@targon/prisma-talos'
import { Client } from 'pg'
import { logger } from '@/lib/logger'
import { TenantCode, TENANTS, isValidTenantCode } from './constants'
import { resolveTenantSchema } from './schema'

// Global cache for Prisma clients per tenant
const globalForPrisma = global as unknown as {
  tenantClients: Map<TenantCode, PrismaClient> | undefined
  tenantClientPromises: Map<TenantCode, Promise<PrismaClient>> | undefined
}

// Initialize client cache
if (!globalForPrisma.tenantClients) {
  globalForPrisma.tenantClients = new Map()
}

if (!globalForPrisma.tenantClientPromises) {
  globalForPrisma.tenantClientPromises = new Map()
}

const clientCache = globalForPrisma.tenantClients
const clientPromiseCache = globalForPrisma.tenantClientPromises

/**
 * Get the database URL for a specific tenant
 */
function getTenantDatabaseUrl(tenantCode: TenantCode): string {
  const tenant = TENANTS[tenantCode]
  const url = process.env[tenant.envKey]

  if (!url) {
    // In development, fall back to default DATABASE_URL if tenant-specific not set
    if (process.env.NODE_ENV !== 'production' && process.env.DATABASE_URL) {
      console.warn(`[tenant] ${tenant.envKey} not set, falling back to DATABASE_URL`)
      return process.env.DATABASE_URL
    }
    throw new Error(`Database URL not configured for tenant: ${tenantCode}. Set ${tenant.envKey} environment variable.`)
  }

  return url
}

/**
 * Create a new Prisma client for a tenant
 */
function searchPathOption(schema: string): string {
  return `-csearch_path=${schema},public`
}

export function buildSchemaScopedDatabaseUrl(databaseUrl: string, schema: string): string {
  const url = new URL(databaseUrl)
  url.searchParams.set('schema', schema)
  url.searchParams.set('options', searchPathOption(schema))
  return url.toString()
}

function withApplicationName(databaseUrl: string, applicationName: string): string {
  const url = new URL(databaseUrl)
  url.searchParams.set('application_name', applicationName)
  return url.toString()
}

function withoutSchema(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl)
    url.searchParams.delete('schema')
    return url.toString()
  } catch {
    return databaseUrl
  }
}

async function schemaHasTable(
  connectionString: string,
  schema: string,
  table: string
): Promise<boolean> {
  const client = new Client({
    connectionString: withApplicationName(connectionString, 'talos-schema-checker'),
  })
  try {
    await client.connect()
    const result = await client.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1',
      [schema, table]
    )
    return result.rowCount > 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function findBestSchemaForTenant(
  connectionString: string,
  tenantCode: TenantCode,
  currentSchema: string
): Promise<string | null> {
  const client = new Client({
    connectionString: withApplicationName(connectionString, 'talos-schema-checker'),
  })
  try {
    await client.connect()
    const result = await client.query<{ table_schema: string }>(
      'SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_name = $1',
      ['skus']
    )

    const schemas = result.rows.map((row) => row.table_schema).filter(Boolean)
    if (schemas.length === 0) return null

    const tenantSuffix = `_${tenantCode.toLowerCase()}`
    const tenantSchemas = schemas.filter((schema) => schema.toLowerCase().endsWith(tenantSuffix))
    const candidates = tenantSchemas.length > 0 ? tenantSchemas : schemas

    const isProduction = process.env.NODE_ENV === 'production'
    const score = (schema: string): number => {
      const normalized = schema.toLowerCase()
      let value = 0

      if (normalized.endsWith(tenantSuffix)) value += 10

      if (isProduction) {
        if (normalized.includes('main') || normalized.includes('prod')) value += 3
        if (normalized.includes('dev') || normalized.includes('test') || normalized.includes('local'))
          value -= 3
      } else {
        if (normalized.includes('dev') || normalized.includes('test') || normalized.includes('local'))
          value += 3
        if (normalized.includes('main') || normalized.includes('prod')) value -= 3
      }

      if (schema === currentSchema) value += 1
      return value
    }

    return candidates
      .slice()
      .sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] ?? null
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function resolveDatasourceUrl(databaseUrl: string, tenantCode: TenantCode): Promise<string> {
  const taggedDatabaseUrl = withApplicationName(databaseUrl, `talos-${tenantCode.toLowerCase()}`)
  const resolvedSchema = resolveTenantSchema(databaseUrl, process.env.PRISMA_SCHEMA)
  if (!resolvedSchema) {
    return taggedDatabaseUrl
  }
  const currentSchema = resolvedSchema.schema

  const baseConnectionString = withoutSchema(taggedDatabaseUrl)

  try {
    const hasRequiredTables = await schemaHasTable(baseConnectionString, currentSchema, 'skus')
    if (hasRequiredTables) return buildSchemaScopedDatabaseUrl(taggedDatabaseUrl, currentSchema)

    const bestSchema = await findBestSchemaForTenant(baseConnectionString, tenantCode, currentSchema)
    if (bestSchema && bestSchema !== currentSchema) {
      console.warn(
        `[tenant] Schema "${currentSchema}" missing expected tables for ${tenantCode}; using "${bestSchema}" instead`
      )
      return buildSchemaScopedDatabaseUrl(taggedDatabaseUrl, bestSchema)
    }
  } catch {
    // Fall back to provided schema URL if we cannot introspect (e.g., network/permissions)
  }

  return buildSchemaScopedDatabaseUrl(taggedDatabaseUrl, currentSchema)
}

async function createTenantClient(tenantCode: TenantCode): Promise<PrismaClient> {
  const databaseUrl = getTenantDatabaseUrl(tenantCode)
  const datasourceUrl = await resolveDatasourceUrl(databaseUrl, tenantCode)

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: { url: datasourceUrl },
    },
    transactionOptions: {
      maxWait: 30000,
      timeout: 30000,
    },
  })

  return client
}

/**
 * Get or create a Prisma client for a specific tenant.
 * Uses singleton pattern to prevent multiple instances per tenant.
 */
export async function getTenantPrismaClient(tenantCode: TenantCode): Promise<PrismaClient> {
  if (!isValidTenantCode(tenantCode)) {
    throw new Error(`Invalid tenant code: ${tenantCode}`)
  }

  const existing = clientCache.get(tenantCode)
  if (existing) {
    return existing
  }

  const existingPromise = clientPromiseCache.get(tenantCode)
  if (existingPromise) {
    return existingPromise
  }

  const promise = createTenantClient(tenantCode)
    .then((client) => {
      clientCache.set(tenantCode, client)
      clientPromiseCache.delete(tenantCode)
      return client
    })
    .catch((error) => {
      clientPromiseCache.delete(tenantCode)
      throw error
    })

  clientPromiseCache.set(tenantCode, promise)
  return promise
}

/**
 * Disconnect all tenant clients (for graceful shutdown)
 */
export async function disconnectAllTenants(): Promise<void> {
  const disconnectPromises: Promise<void>[] = []

  for (const [tenantCode, client] of clientCache.entries()) {
    logger.info('Disconnecting tenant database', { tenantCode })
    disconnectPromises.push(client.$disconnect())
  }

  await Promise.all(disconnectPromises)
  clientCache.clear()
  clientPromiseCache.clear()
}

/**
 * Check if a tenant's database is accessible
 */
export async function checkTenantConnection(tenantCode: TenantCode): Promise<boolean> {
  try {
    const client = await getTenantPrismaClient(tenantCode)
    await client.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error(`[tenant] Connection check failed for ${tenantCode}:`, error)
    return false
  }
}
