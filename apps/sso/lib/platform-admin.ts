import type { Session } from 'next-auth'

function parseEmailSet(raw: string | undefined) {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

const DEFAULT_PLATFORM_ADMINS = new Set(['jarrar@targonglobal.com'])

function bootstrapAdminEmailSet() {
  const configured = parseEmailSet(process.env.PORTAL_BOOTSTRAP_ADMIN_EMAILS)
  return new Set([...DEFAULT_PLATFORM_ADMINS, ...configured])
}

export function isPlatformAdminSession(session: Session | null): boolean {
  if (!session?.user) {
    return false
  }

  const globalRolesFromAuthz = Array.isArray((session as any).authz?.globalRoles)
    ? ((session as any).authz.globalRoles as unknown[])
    : []
  const globalRoles = Array.isArray((session as any).globalRoles)
    ? ((session as any).globalRoles as unknown[])
    : []

  const normalizedRoles = [...globalRolesFromAuthz, ...globalRoles]
    .map((value) => String(value).trim().toLowerCase())

  if (normalizedRoles.includes('platform_admin')) {
    return true
  }

  const email = typeof session.user.email === 'string'
    ? session.user.email.trim().toLowerCase()
    : ''

  if (!email) {
    return false
  }

  return bootstrapAdminEmailSet().has(email)
}
