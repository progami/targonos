import NextAuth from 'next-auth'
import type { NextAuthConfig, Session } from 'next-auth'
import Google from 'next-auth/providers/google'
import { getWorktreeDevSession, type PortalAuthz, withSharedAuth } from '@targon/auth'
import {
  getOrCreatePortalUserByEmail,
  getUserAuthz,
  getUserByEmail,
} from '@targon/auth/server'
import { resolvePortalCallbackTarget } from './callback-target'
import { authLogger } from './auth-logger'
import { requireAuthEnv } from './required-auth-env'

const ORG_EMAIL_DOMAIN = 'targonglobal.com'

function isOrgEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return normalized.endsWith(`@${ORG_EMAIL_DOMAIN}`)
}

const nextAuthUrl = requireAuthEnv('NEXTAUTH_URL')
requireAuthEnv('PORTAL_AUTH_URL')
requireAuthEnv('NEXT_PUBLIC_PORTAL_AUTH_URL')
const cookieDomain = requireAuthEnv('COOKIE_DOMAIN')
const googleClientId = requireAuthEnv('GOOGLE_CLIENT_ID')
const googleClientSecret = requireAuthEnv('GOOGLE_CLIENT_SECRET')

const portalHostname = new URL(nextAuthUrl).hostname.trim().toLowerCase()
const AUTO_PROVISION_PORTAL_USERS = !portalHostname.startsWith('dev-os.')

const sharedSecret = process.env.PORTAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (sharedSecret) {
  process.env.NEXTAUTH_SECRET = sharedSecret
}

if (!sharedSecret) {
  throw new Error('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for portal authentication.')
}

const providers: NextAuthConfig['providers'] = [
  Google({
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    authorization: {
      params: { prompt: 'select_account', access_type: 'offline', response_type: 'code' },
    },
  }),
]

const ENTITLEMENTS_REFRESH_INTERVAL_MS = 60_000

const baseAuthOptions: NextAuthConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: sharedSecret,
  logger: authLogger,
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login',
  },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        const email = (profile?.email || user?.email || '').toLowerCase()
        const emailVerified = typeof (profile as any)?.email_verified === 'boolean'
          ? Boolean((profile as any)?.email_verified)
          : typeof (profile as any)?.verified_email === 'boolean'
            ? Boolean((profile as any)?.verified_email)
            : true

        if (!email || !emailVerified) {
          return false
        }

        if (!isOrgEmail(email)) {
          console.warn(`[auth] Blocked Google login for ${email} (outside org domain)`)
          return false
        }

        const firstName = typeof (profile as any)?.given_name === 'string'
          ? (profile as any).given_name
          : null
        const lastName = typeof (profile as any)?.family_name === 'string'
          ? (profile as any).family_name
          : null
        const portalUser = AUTO_PROVISION_PORTAL_USERS
          ? await getOrCreatePortalUserByEmail({
              email,
              firstName,
              lastName,
            })
          : await getUserByEmail(email)
        if (!portalUser) {
          const reason = AUTO_PROVISION_PORTAL_USERS ? 'unable to provision portal user' : 'no portal user record'
          console.warn(`[auth] Blocked Google login for ${email} (${reason})`)
          return false
        }

        ;(user as any).portalUser = portalUser
        return true
      }

      if (account) {
        return false
      }
      return false
    },
    async jwt({ token, user }) {
      const portal = (user as any)?.portalUser
      if (portal) {
        const authz: PortalAuthz = {
          version: portal.authzVersion ?? 1,
          globalRoles: portal.globalRoles ?? [],
          apps: portal.entitlements ?? {},
        }
        token.sub = portal.id
        token.email = portal.email
        token.name = portal.fullName || user?.name || portal.email
        token.apps = Object.keys(authz.apps)
        ;(token as any).authz = authz
        ;(token as any).roles = authz.apps
        ;(token as any).globalRoles = authz.globalRoles
        ;(token as any).authzVersion = authz.version
        ;(token as any).entitlements_ver = Date.now()
        return token
      }

      const userId = typeof token.sub === 'string' ? token.sub : null
      if (!userId) {
        return token
      }

      const lastRefresh = (token as any).entitlements_ver
      const lastRefreshMs = typeof lastRefresh === 'number' ? lastRefresh : 0
      const now = Date.now()

      if (now - lastRefreshMs < ENTITLEMENTS_REFRESH_INTERVAL_MS) {
        return token
      }

      try {
        const authz = await getUserAuthz(userId)
        token.apps = Object.keys(authz.apps)
        ;(token as any).authz = authz
        ;(token as any).roles = authz.apps
        ;(token as any).globalRoles = authz.globalRoles
        ;(token as any).authzVersion = authz.version
      } catch (error) {
        console.error('[auth] Failed to refresh entitlements', error)
      } finally {
        ;(token as any).entitlements_ver = now
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as any).id = token.sub as string
        session.user.email = (token.email as string | undefined) ?? session.user.email
        session.user.name = (token.name as string | undefined) ?? session.user.name
        ;(session.user as any).apps = (token as any).apps as string[] | undefined
      }
      ;(session as any).authz = (token as any).authz
      ;(session as any).roles = (token as any).roles
      ;(session as any).globalRoles = (token as any).globalRoles
      ;(session as any).authzVersion = (token as any).authzVersion
      ;(session as any).activeTenant = (token as any).activeTenant ?? null
      ;(session as any).entitlements_ver = (token as any).entitlements_ver
      return session
    },
    async redirect({ url, baseUrl }) {
      const allowValue = String(process.env.ALLOW_CALLBACK_REDIRECT ?? '').trim().toLowerCase()
      const allowCallbackExplicit = ['1', 'true', 'yes', 'on'].includes(allowValue)
      const allowCallbackDefault = allowValue === ''
      const allowCallback = allowCallbackExplicit || allowCallbackDefault
      if (!allowCallback) {
        return baseUrl
      }

      const target = resolvePortalCallbackTarget({
        targetUrl: url,
        portalBaseUrl: baseUrl,
      })
      if (target) {
        return target
      }

      return baseUrl
    },
  },
}

export const authOptions: NextAuthConfig = withSharedAuth(baseAuthOptions, {
  cookieDomain,
  appId: 'targon',
})

// Initialize NextAuth with config and export handlers + auth function
const nextAuth = NextAuth(authOptions)

export const handlers = nextAuth.handlers
export const signIn = nextAuth.signIn
export const signOut = nextAuth.signOut

export async function auth(): Promise<Session | null> {
  const worktreeSession = await getWorktreeDevSession('targon')
  if (worktreeSession) {
    return worktreeSession as unknown as Session
  }
  return nextAuth.auth() as Promise<Session | null>
}
