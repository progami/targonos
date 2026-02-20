import { cookies, headers } from 'next/headers'
import {
  TenantCode,
  TENANTS,
  TENANT_COOKIE_NAME,
  DEFAULT_TENANT,
  isValidTenantCode,
  getTenantConfig,
  TenantConfig,
} from './constants'
import { getTenantPrismaClient } from './prisma-factory'
import { PrismaClient } from '@targon/prisma-talos'

function assertSafePgIdentifier(value: string, label: string): asserts value is string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

function getSchemaFromDatabaseUrl(databaseUrl: string, tenantCode: TenantCode): string {
  const override = process.env.PRISMA_SCHEMA
  if (override) {
    assertSafePgIdentifier(override, 'PRISMA_SCHEMA')
    return override
  }

  let schema: string | null = null
  try {
    schema = new URL(databaseUrl).searchParams.get('schema')
  } catch {
    schema = null
  }

  if (!schema) {
    throw new Error(`Missing schema for tenant ${tenantCode}. Add ?schema=... to ${TENANTS[tenantCode].envKey}.`)
  }

  assertSafePgIdentifier(schema, `${TENANTS[tenantCode].envKey} schema`)
  return schema
}

/**
 * Get the current tenant code from cookies or headers (server-side)
 */
export async function getCurrentTenantCode(): Promise<TenantCode> {
  // First check headers (set by middleware)
  const headersList = await headers()
  const headerTenant = headersList.get('x-tenant')
  if (isValidTenantCode(headerTenant)) {
    return headerTenant
  }

  // Fall back to cookie
  const cookieStore = await cookies()
  const cookieTenant = cookieStore.get(TENANT_COOKIE_NAME)?.value
  if (isValidTenantCode(cookieTenant)) {
    return cookieTenant
  }

  // Default tenant
  return DEFAULT_TENANT
}

/**
 * Get the current tenant config (server-side)
 */
export async function getCurrentTenant(): Promise<TenantConfig> {
  const code = await getCurrentTenantCode()
  return getTenantConfig(code)
}

export async function getCurrentTenantSchema(): Promise<string> {
  const tenantCode = await getCurrentTenantCode()
  const databaseUrl = process.env[TENANTS[tenantCode].envKey]
  if (!databaseUrl) {
    throw new Error(`Database URL not configured for tenant: ${tenantCode}. Set ${TENANTS[tenantCode].envKey}.`)
  }

  return getSchemaFromDatabaseUrl(databaseUrl, tenantCode)
}

/**
 * Get Prisma client for the current tenant (server-side)
 * Use this in Server Components and API routes
 */
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantCode = await getCurrentTenantCode()
  return await getTenantPrismaClient(tenantCode)
}

/**
 * Check if a tenant cookie is set
 */
export async function hasTenantSelected(): Promise<boolean> {
  const cookieStore = await cookies()
  const cookieTenant = cookieStore.get(TENANT_COOKIE_NAME)?.value
  return isValidTenantCode(cookieTenant)
}
