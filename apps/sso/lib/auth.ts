import NextAuth from 'next-auth'
import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'
import { applyDevAuthDefaults, type PortalAuthz, withSharedAuth } from '@targon/auth'
import { getOrCreatePortalUserByEmail, getUserAuthz, getUserByEmail } from '@targon/auth/server'

if (!process.env.NEXTAUTH_URL) {
  throw new Error('NEXTAUTH_URL must be defined for portal authentication.')
}
if (!process.env.PORTAL_AUTH_URL) {
  throw new Error('PORTAL_AUTH_URL must be defined for portal authentication.')
}
if (!process.env.NEXT_PUBLIC_PORTAL_AUTH_URL) {
  throw new Error('NEXT_PUBLIC_PORTAL_AUTH_URL must be defined for portal authentication.')
}
if (!process.env.COOKIE_DOMAIN) {
  throw new Error('COOKIE_DOMAIN must be defined for portal authentication.')
}
applyDevAuthDefaults({
  appId: 'targon',
})

const ORG_EMAIL_DOMAIN = 'targonglobal.com'

function isOrgEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return normalized.endsWith(`@${ORG_EMAIL_DOMAIN}`)
}

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

function resolveCookieDomain(explicit: string | undefined, baseUrl: string | undefined): string {
  const trimmed = explicit?.trim()
  if (baseUrl) {
    try {
      const { hostname } = new URL(baseUrl)
      const normalizedHost = hostname.replace(/\.$/, '')
      if (trimmed && trimmed !== '') {
        const normalizedExplicit = trimmed.startsWith('.') ? trimmed.slice(1) : trimmed
        if (normalizedHost && !normalizedHost.endsWith(normalizedExplicit)) {
          return `.${normalizedHost}`
        }
        return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
      }
      if (normalizedHost) {
        return `.${normalizedHost}`
      }
    } catch {
      // fall back to default domain below
    }
  } else if (trimmed && trimmed !== '') {
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
  }
  return '.targonglobal.com'
}

const normalizedBaseUrl = sanitizeBaseUrl(process.env.NEXTAUTH_URL || process.env.PORTAL_AUTH_URL)
if (normalizedBaseUrl) {
  process.env.NEXTAUTH_URL = normalizedBaseUrl
  if (!process.env.PORTAL_AUTH_URL) {
    process.env.PORTAL_AUTH_URL = normalizedBaseUrl
  }
}

const resolvedCookieDomain = resolveCookieDomain(process.env.COOKIE_DOMAIN, process.env.NEXTAUTH_URL)
process.env.COOKIE_DOMAIN = resolvedCookieDomain

const portalHostname = new URL(process.env.NEXTAUTH_URL).hostname.trim().toLowerCase()
const AUTO_PROVISION_PORTAL_USERS = !portalHostname.startsWith('dev-os.')

const sharedSecret = process.env.PORTAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET
if (sharedSecret) {
  process.env.NEXTAUTH_SECRET = sharedSecret
}

const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const hasGoogleOAuth = Boolean(googleClientId && googleClientSecret)

if (!hasGoogleOAuth) {
  throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured for Targon auth.')
}

const providers: NextAuthConfig['providers'] = [
  Google({
    clientId: googleClientId || '',
    clientSecret: googleClientSecret || '',
    authorization: { params: { prompt: 'select_account', access_type: 'offline', response_type: 'code' } },
  }),
]

const ENTITLEMENTS_REFRESH_INTERVAL_MS = 60_000

const baseAuthOptions: NextAuthConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: sharedSecret,
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
      ;(session as any).entitlements_ver = (token as any).entitlements_ver
      return session
    },
    async redirect({ url, baseUrl }) {
      const allowValue = String(process.env.ALLOW_CALLBACK_REDIRECT || '').toLowerCase()
      const allowCallbackExplicit = ['1', 'true', 'yes', 'on'].includes(allowValue)
      const allowCallbackDefault = process.env.NODE_ENV !== 'production' && allowValue === ''
      const allowCallback = allowCallbackExplicit || allowCallbackDefault
      if (!allowCallback) {
        return baseUrl
      }
      try {
        const target = new URL(url, baseUrl)
        const base = new URL(baseUrl)
        if (target.origin === base.origin) return target.toString()

        const hostMismatch = target.hostname !== base.hostname
        const bothPortalHosts =
          target.hostname.endsWith('.os.targonglobal.com') &&
          base.hostname.endsWith('.targonglobal.com')
        if (hostMismatch && bothPortalHosts) {
          const loginOrigin = `${target.protocol}//${target.hostname}`
          const rewritten = new URL('/login', loginOrigin)
          rewritten.searchParams.set('callbackUrl', target.toString())
          return rewritten.toString()
        }

        if (process.env.NODE_ENV !== 'production') {
          if (target.hostname === 'localhost' || target.hostname === '127.0.0.1') {
            const relay = new URL('/auth/relay', base)
            relay.searchParams.set('to', target.toString())
            return relay.toString()
          }
          return baseUrl
        }

        const cookieDomain = resolvedCookieDomain.replace(/^\./, '')
        if (cookieDomain && target.hostname.endsWith(cookieDomain)) {
          const relay = new URL('/auth/relay', base)
          relay.searchParams.set('to', target.toString())
          return relay.toString()
        }
      } catch {}
      return baseUrl
    },
  },
}

export const authOptions: NextAuthConfig = withSharedAuth(baseAuthOptions, {
  cookieDomain: resolvedCookieDomain,
  appId: 'targon',
})

// Initialize NextAuth with config and export handlers + auth function
export const { handlers, auth, signIn, signOut } = NextAuth(authOptions)
