type HostedSmokeGrant = {
  appSlug: string
  appName: string
  departments: string[]
  tenantMemberships: string[]
  locked: boolean
}

type HostedSmokeEnv = Partial<Record<string, string>>

export const hostedSmokeAppGrants: HostedSmokeGrant[] = [
  {
    appSlug: 'talos',
    appName: 'Talos',
    departments: ['Ops'],
    tenantMemberships: ['US', 'UK'],
    locked: false,
  },
  {
    appSlug: 'atlas',
    appName: 'Atlas',
    departments: ['People Ops'],
    tenantMemberships: ['US', 'UK'],
    locked: false,
  },
  {
    appSlug: 'kairos',
    appName: 'Kairos',
    departments: ['Product'],
    tenantMemberships: [],
    locked: false,
  },
  {
    appSlug: 'xplan',
    appName: 'xPlan',
    departments: ['Product'],
    tenantMemberships: [],
    locked: false,
  },
  {
    appSlug: 'plutus',
    appName: 'Plutus',
    departments: ['Finance'],
    tenantMemberships: [],
    locked: false,
  },
  {
    appSlug: 'hermes',
    appName: 'Hermes',
    departments: ['Account / Listing'],
    tenantMemberships: [],
    locked: false,
  },
  {
    appSlug: 'argus',
    appName: 'Argus',
    departments: ['Account / Listing'],
    tenantMemberships: [],
    locked: false,
  },
]

function requireHostedSmokeEnv(name: string, env: HostedSmokeEnv): string {
  const value = env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined for hosted portal smoke tests.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined for hosted portal smoke tests.`)
  }

  return trimmed
}

export function getHostedAuthSecret(env: HostedSmokeEnv = process.env): string {
  const nextAuthSecret = env.NEXTAUTH_SECRET
  if (typeof nextAuthSecret === 'string') {
    const trimmed = nextAuthSecret.trim()
    if (trimmed !== '') {
      return trimmed
    }
  }

  const portalAuthSecret = env.PORTAL_AUTH_SECRET
  if (typeof portalAuthSecret === 'string') {
    const trimmed = portalAuthSecret.trim()
    if (trimmed !== '') {
      return trimmed
    }
  }

  throw new Error('NEXTAUTH_SECRET or PORTAL_AUTH_SECRET must be defined for hosted portal smoke tests.')
}

export function buildHostedSmokeAuthz() {
  const apps = Object.fromEntries(
    hostedSmokeAppGrants.map((grant) => [
      grant.appSlug,
      {
        departments: grant.departments,
        tenantMemberships: grant.tenantMemberships,
      },
    ]),
  )

  return {
    version: 1,
    globalRoles: ['platform_admin'],
    apps,
  }
}

export function buildHostedSmokeSessionTokenPayload(env: HostedSmokeEnv = process.env) {
  const authz = buildHostedSmokeAuthz()

  return {
    sub: requireHostedSmokeEnv('E2E_PORTAL_USER_ID', env),
    email: requireHostedSmokeEnv('E2E_PORTAL_EMAIL', env),
    name: requireHostedSmokeEnv('E2E_PORTAL_NAME', env),
    authz,
    roles: authz.apps,
    globalRoles: authz.globalRoles,
    authzVersion: authz.version,
    apps: Object.keys(authz.apps),
    activeTenant: requireHostedSmokeEnv('E2E_ACTIVE_TENANT', env),
    entitlements_ver: Date.now(),
  }
}
