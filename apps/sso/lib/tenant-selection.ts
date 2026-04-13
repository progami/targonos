import { getCandidateSessionCookieNames } from '@targon/auth'
import { decode, encode } from 'next-auth/jwt'

function parseCookieHeader(header: string | null): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!header) return map

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.split('=')
    if (!rawName) continue
    const name = rawName.trim()
    if (!name) continue

    const value = rawValue.join('=').trim()
    const existing = map.get(name)
    if (existing) {
      existing.push(value)
      continue
    }

    map.set(name, [value])
  }

  return map
}

export function activeTenantCookieName(appId: string): string {
  return `__Secure-targon.active-tenant.${appId}`
}

export async function encodeSignedTenantSelection(appId: string, tenantCode: string): Promise<string> {
  return encode({
    token: { activeTenant: tenantCode },
    secret: process.env.PORTAL_AUTH_SECRET!,
    salt: activeTenantCookieName(appId),
  })
}

export async function decodeSignedTenantSelection(appId: string, value: string): Promise<string | null> {
  const payload = await decode({
    token: value,
    secret: process.env.PORTAL_AUTH_SECRET!,
    salt: activeTenantCookieName(appId),
  })

  return typeof payload?.activeTenant === 'string' ? payload.activeTenant : null
}

export function isRequestedTenantAllowed(session: unknown, appId: string, tenantCode: string): boolean {
  const grant = (session as any)?.authz?.apps?.[appId]
  const memberships = Array.isArray(grant?.tenantMemberships) ? grant.tenantMemberships : []
  return memberships.includes(tenantCode)
}

export async function encodeSessionTokenWithActiveTenant(
  cookieHeader: string | null,
  activeTenant: string,
): Promise<{ name: string; value: string }> {
  const cookies = parseCookieHeader(cookieHeader)

  for (const cookieName of getCandidateSessionCookieNames('targon')) {
    const raw = cookies.get(cookieName)?.[0]
    if (!raw) continue

    const payload = await decode({
      token: raw,
      secret: process.env.NEXTAUTH_SECRET!,
      salt: cookieName,
    })

    if (!payload || typeof payload !== 'object') {
      throw new Error('Authenticated portal session payload is invalid.')
    }

    return {
      name: cookieName,
      value: await encode({
        token: {
          ...payload,
          activeTenant,
        },
        secret: process.env.NEXTAUTH_SECRET!,
        salt: cookieName,
      }),
    }
  }

  throw new Error('Authenticated portal session cookie not found.')
}
