import type { Session } from 'next-auth'
import type { PortalConsumerSession } from '@targon/auth'
import type { TenantCode } from '@/lib/tenant/constants'

type AuthzClaims = {
  authz?: unknown
  roles?: unknown
  globalRoles?: unknown
  authzVersion?: unknown
  activeTenant?: unknown
}

type SessionWithAuthz = Session & AuthzClaims

export type TalosSessionUserRecord = {
  id: string
  role: Session['user']['role']
  region: TenantCode
  warehouseId?: string
}

function applyPortalClaimsToSession(
  session: SessionWithAuthz,
  consumerSession: PortalConsumerSession,
) {
  session.authz = consumerSession.authz
  session.roles = consumerSession.payload.roles ?? consumerSession.authz.apps
  session.globalRoles = consumerSession.payload.globalRoles ?? consumerSession.authz.globalRoles
  session.authzVersion =
    typeof consumerSession.payload.authzVersion === 'number'
      ? consumerSession.payload.authzVersion
      : consumerSession.authz.version
  session.activeTenant = consumerSession.activeTenant
}

function buildSessionBase(consumerSession: PortalConsumerSession): SessionWithAuthz {
  const user = {
    id:
      typeof consumerSession.payload.sub === 'string' && consumerSession.payload.sub.trim() !== ''
        ? consumerSession.payload.sub
        : '',
    email:
      typeof consumerSession.payload.email === 'string'
        ? consumerSession.payload.email
        : undefined,
    name:
      typeof consumerSession.payload.name === 'string'
        ? consumerSession.payload.name
        : undefined,
  } as Session['user']

  const session = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user,
  } as SessionWithAuthz

  applyPortalClaimsToSession(session, consumerSession)
  return session
}

export async function buildTalosSessionFromConsumerSession(options: {
  consumerSession: PortalConsumerSession
  resolveCurrentTenant: (session: Session) => Promise<TenantCode | null>
  loadUser: (email: string, tenantCode: TenantCode) => Promise<TalosSessionUserRecord | null>
}): Promise<Session> {
  const session = buildSessionBase(options.consumerSession)
  const currentTenant = await options.resolveCurrentTenant(session)
  if (!currentTenant) {
    return session
  }

  session.activeTenant = currentTenant

  const email = session.user.email
  if (!email) {
    return session
  }

  const user = await options.loadUser(email, currentTenant)
  if (!user) {
    throw new Error(`Talos auth user ${email} is missing in tenant ${currentTenant}.`)
  }

  session.user.id = user.id
  session.user.role = user.role
  session.user.region = user.region
  if (user.warehouseId) {
    session.user.warehouseId = user.warehouseId
  }

  return session
}
