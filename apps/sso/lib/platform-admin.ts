import type { Session } from 'next-auth'

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

  return normalizedRoles.includes('platform_admin')
}
