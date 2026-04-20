import NextAuth from 'next-auth'
import type { NextAuthConfig, Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import { getWorktreeDevSession, withSharedAuth } from '@targon/auth'
import { getCurrentTenantCode } from '@/lib/tenant/server'
import { getPrismaForTenant } from '@/lib/tenant/access'
import type { TenantCode } from '@/lib/tenant/constants'

// In-memory cache for Talos user data to avoid DB queries on every request
// Key: `${email}:${tenantCode}`, Value: { data, expiresAt }
const userCache = new Map<string, {
  data: { id: string; role: string; region: TenantCode; warehouseId?: string }
  expiresAt: number
}>()

const CACHE_TTL_MS = 1 * 60 * 1000 // 1 minute - reduced to ensure role changes propagate quickly

type AuthzClaims = {
  authz?: unknown
  roles?: unknown
  globalRoles?: unknown
  authzVersion?: unknown
  activeTenant?: unknown
}

type SessionWithAuthz = Session & AuthzClaims
type TokenWithAuthz = JWT & AuthzClaims

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

function applyPortalClaimsToSession(
  session: SessionWithAuthz,
  claims: {
    authz?: unknown
    roles?: unknown
    globalRoles?: unknown
    authzVersion?: unknown
    activeTenant?: unknown
    sub?: unknown
  }
) {
  session.authz = claims.authz
  session.roles = claims.roles
  session.globalRoles = claims.globalRoles
  session.authzVersion = claims.authzVersion
  if (typeof claims.activeTenant === 'string') {
    session.activeTenant = claims.activeTenant
  } else {
    session.activeTenant = null
  }

  if (
    (!session.user.id || typeof session.user.id !== 'string') &&
    typeof claims.sub === 'string' &&
    claims.sub.trim()
  ) {
    session.user.id = claims.sub.trim()
  }
}

async function enrichTalosSessionUser(
  session: SessionWithAuthz,
  email: string,
  tenantCode: TenantCode
) {
  const cached = getCachedUser(email, tenantCode)
  if (cached) {
    session.user.id = cached.id
    session.user.role = cached.role as Session['user']['role']
    session.user.region = cached.region
    if (cached.warehouseId) {
      session.user.warehouseId = cached.warehouseId
    }
    return
  }

  const prisma = await getPrismaForTenant(tenantCode)
  const user = await prisma.user.findFirst({
    where: { email, isActive: true },
    select: { id: true, role: true, region: true, warehouseId: true },
  })

  if (!user) {
    throw new Error(`Talos worktree dev user is missing in tenant ${tenantCode}.`)
  }

  session.user.id = user.id
  session.user.role = user.role
  session.user.region = user.region
  if (user.warehouseId) {
    session.user.warehouseId = user.warehouseId
  }

  setCachedUser(email, tenantCode, {
    id: user.id,
    role: user.role,
    region: user.region,
    warehouseId: user.warehouseId ?? undefined,
  })
}

async function buildWorktreeTalosSession(): Promise<Session | null> {
  const worktreeSession = await getWorktreeDevSession('talos')
  if (!worktreeSession) {
    return null
  }

  const session: SessionWithAuthz = {
    expires: worktreeSession.expires,
    user: {
      id: worktreeSession.user.id,
      email: worktreeSession.user.email,
      name: worktreeSession.user.name,
      role: 'admin' as Session['user']['role'],
      region: 'US' as TenantCode,
    },
  }

  applyPortalClaimsToSession(session, {
    sub: worktreeSession.user.id,
    authz: worktreeSession.authz,
    roles: worktreeSession.roles,
    globalRoles: worktreeSession.globalRoles,
    authzVersion: worktreeSession.authzVersion,
    activeTenant: worktreeSession.activeTenant,
  })

  const tenantCode = await getCurrentTenantCode()
  session.activeTenant = tenantCode

  await enrichTalosSessionUser(session, worktreeSession.user.email, tenantCode)
  return session
}

if (!process.env.NEXT_PUBLIC_APP_URL) {
  throw new Error('NEXT_PUBLIC_APP_URL must be defined for Talos auth configuration.')
}
if (!process.env.NEXTAUTH_URL) {
  throw new Error('NEXTAUTH_URL must be defined for Talos auth configuration.')
}
if (!process.env.PORTAL_AUTH_URL) {
  throw new Error('PORTAL_AUTH_URL must be defined for Talos auth configuration.')
}
if (!process.env.NEXT_PUBLIC_PORTAL_AUTH_URL) {
  throw new Error('NEXT_PUBLIC_PORTAL_AUTH_URL must be defined for Talos auth configuration.')
}
if (!process.env.COOKIE_DOMAIN) {
  throw new Error('COOKIE_DOMAIN must be defined for Talos auth configuration.')
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
  providers: [],
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
      const sessionWithAuthz = session as SessionWithAuthz
      const tokenWithAuthz = token as TokenWithAuthz

      applyPortalClaimsToSession(sessionWithAuthz, {
        sub: token.sub,
        authz: tokenWithAuthz.authz,
        roles: tokenWithAuthz.roles,
        globalRoles: tokenWithAuthz.globalRoles,
        authzVersion: tokenWithAuthz.authzVersion,
        activeTenant: tokenWithAuthz.activeTenant,
      })

      const currentTenant = await getCurrentTenantCode(sessionWithAuthz)
      sessionWithAuthz.activeTenant = currentTenant

      const email = (token.email ?? session.user?.email) as string | undefined
      if (!email) {
        return session
      }

      await enrichTalosSessionUser(sessionWithAuthz, email, currentTenant)

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
    cookieDomain: process.env.COOKIE_DOMAIN,
    // Use portal cookie prefix so NextAuth reads the same dev cookie as Targon OS
    appId: 'targon',
  }
)

// Initialize NextAuth with config and export handlers + auth function
const nextAuth = NextAuth(authOptions)

export const handlers = nextAuth.handlers
export const signIn = nextAuth.signIn
export const signOut = nextAuth.signOut

export async function auth() {
  const worktreeSession = await buildWorktreeTalosSession()
  if (worktreeSession) {
    return worktreeSession
  }
  return nextAuth.auth()
}
