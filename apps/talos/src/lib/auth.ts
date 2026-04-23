import { headers } from 'next/headers'
import type { Session } from 'next-auth'
import { readPortalConsumerSession } from '@targon/auth'
import { getCurrentTenantCode } from '@/lib/tenant/server'
import { getPrismaForTenant } from '@/lib/tenant/access'
import type { TenantCode } from '@/lib/tenant/constants'
import {
  buildTalosSessionFromConsumerSession,
  type TalosSessionUserRecord,
} from '@/lib/auth/consumer-session'

const userCache = new Map<string, {
  data: TalosSessionUserRecord
  expiresAt: number
}>()

const CACHE_TTL_MS = 1 * 60 * 1000

function requireSharedSecret(): string {
  const value = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!value || value.trim() === '') {
    throw new Error('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for Talos auth.')
  }
  return value
}

function getCachedUser(email: string, tenant: TenantCode) {
  const key = `${email}:${tenant}`
  const cached = userCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  if (cached) {
    userCache.delete(key)
  }
  return null
}

function setCachedUser(email: string, tenant: TenantCode, data: TalosSessionUserRecord) {
  const key = `${email}:${tenant}`
  userCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

async function loadTalosUser(email: string, tenantCode: TenantCode): Promise<TalosSessionUserRecord | null> {
  const cached = getCachedUser(email, tenantCode)
  if (cached) {
    return cached
  }

  const prisma = await getPrismaForTenant(tenantCode)
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true, role: true, region: true, warehouseId: true },
  })

  if (!user) {
    return null
  }

  const record = {
    id: user.id,
    role: user.role,
    region: user.region,
    warehouseId: user.warehouseId ?? undefined,
  } satisfies TalosSessionUserRecord

  setCachedUser(email, tenantCode, record)
  return record
}

async function tryGetCurrentTenantCode(session: Session): Promise<TenantCode | null> {
  try {
    return await getCurrentTenantCode(session)
  } catch {
    return null
  }
}

export async function auth(): Promise<Session | null> {
  const headerList = await headers()
  const consumerSession = await readPortalConsumerSession({
    request: { headers: headerList },
    appId: 'talos',
    secret: requireSharedSecret(),
  })

  if (!consumerSession) {
    return null
  }

  return buildTalosSessionFromConsumerSession({
    consumerSession,
    resolveCurrentTenant: tryGetCurrentTenantCode,
    loadUser: loadTalosUser,
  })
}
