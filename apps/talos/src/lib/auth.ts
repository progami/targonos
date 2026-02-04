import NextAuth from 'next-auth'
import type { NextAuthConfig, Session } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { applyDevAuthDefaults, withSharedAuth } from '@targon/auth'
import { getTenantPrisma, getCurrentTenantCode } from '@/lib/tenant/server'
import type { TenantCode } from '@/lib/tenant/constants'

// In-memory cache for Talos user data to avoid DB queries on every request
// Key: `${email}:${tenantCode}`, Value: { data, expiresAt }
const userCache = new Map<string, {
  data: { id: string; role: string; region: TenantCode; warehouseId?: string }
  expiresAt: number
}>()

const CACHE_TTL_MS = 1 * 60 * 1000 // 1 minute - reduced to ensure role changes propagate quickly

function getCachedUser(email: string, tenant: TenantCode) {
  const key = `${email}:${tenant}`
  const cached = userCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  if (cached) {
    userCache.delete(key) // Expired
  }
  return null
}

function setCachedUser(email: string, tenant: TenantCode, data: { id: string; role: string; region: TenantCode; warehouseId?: string }) {
  const key = `${email}:${tenant}`
  userCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error('NEXT_PUBLIC_APP_URL must be defined for Talos auth configuration.')
}
if (!process.env.PORTAL_AUTH_URL) {
  throw new Error('PORTAL_AUTH_URL must be defined for Talos auth configuration.')
}
if (!process.env.NEXT_PUBLIC_PORTAL_AUTH_URL) {
  throw new Error('NEXT_PUBLIC_PORTAL_AUTH_URL must be defined for Talos auth configuration.')
}

applyDevAuthDefaults({
  appId: 'targon',
})

function sanitizeBaseUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    url.hash = ''
    url.search = ''
    if (/\/api\/auth\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/?api\/auth\/?$/, '') || '/'
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1)
    }
    return url.origin + (url.pathname === '/' ? '' : url.pathname)
  } catch {
    return undefined
  }
}

const normalizedNextAuthUrl = sanitizeBaseUrl(process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL)
if (normalizedNextAuthUrl) {
  process.env.NEXTAUTH_URL = normalizedNextAuthUrl
}

const sharedSecret = process.env.PORTAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (!sharedSecret) {
  throw new Error('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for Talos auth configuration.')
}
process.env.NEXTAUTH_SECRET = sharedSecret

const baseAuthOptions: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: sharedSecret,
  debug: false,
  // Include a no-op credentials provider so NextAuth routes (csrf/session) function
  // Talos does not authenticate locally; the portal issues the session cookie
  providers: [
    Credentials({
      name: 'noop',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize() {
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Talos is decode-only; preserve portal-issued claims
      const userId = (user as { id?: unknown } | null)?.id
      if (typeof userId === 'string') {
        token.sub = userId
      }
      return token
    },
    async session({ session, token }) {
      // Always hydrate a stable user id (portal-issued) so API routes don't crash
      // when a Talos user record doesn't exist yet in the tenant schema.
      if (
        (!session.user.id || typeof session.user.id !== 'string') &&
        typeof token.sub === 'string' &&
        token.sub.trim()
      ) {
        session.user.id = token.sub.trim()
      }

      // Get current tenant - if no tenant selected yet, skip user enrichment
      let currentTenant: TenantCode
      try {
        currentTenant = await getCurrentTenantCode()
      } catch {
        // No tenant context available (e.g., on world map page)
        return session
      }

      const email = (token.email ?? session.user?.email) as string | undefined
      if (!email) {
        return session
      }

      // Check in-memory cache first
      const cached = getCachedUser(email, currentTenant)
      if (cached) {
        session.user.id = cached.id
        session.user.role = cached.role as Session['user']['role']
        session.user.region = cached.region
        if (cached.warehouseId) {
          session.user.warehouseId = cached.warehouseId
        }
        return session
      }

      // Cache miss - fetch from DB
      const prisma = await getTenantPrisma()
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true, region: true, warehouseId: true },
      })

      if (user) {
        session.user.id = user.id
        session.user.role = user.role
        session.user.region = user.region
        if (user.warehouseId) {
          session.user.warehouseId = user.warehouseId
        }

        // Cache for subsequent requests
        setCachedUser(email, currentTenant, {
          id: user.id,
          role: user.role,
          region: user.region,
          warehouseId: user.warehouseId ?? undefined,
        })
      }

      return session
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
}

export const authOptions: NextAuthConfig = withSharedAuth(
  baseAuthOptions,
  {
    cookieDomain: process.env.COOKIE_DOMAIN || '.targonglobal.com',
    // Use portal cookie prefix so NextAuth reads the same dev cookie as Targon OS
    appId: 'targon',
  }
)

// Initialize NextAuth with config and export handlers + auth function
export const { handlers, auth, signIn, signOut } = NextAuth(authOptions)
