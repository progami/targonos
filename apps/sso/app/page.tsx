import { filterAppsForUser, resolveAppUrl, ALL_APPS } from '@/lib/apps'
import { getSafeServerSession } from '@/lib/safe-session'
import PortalClient from './PortalClient'
import LoginPage from './login/page'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function PortalHome({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSafeServerSession()
  if (!session) {
    return <LoginPage />
  }

  const params = await searchParams
  const errorCode = typeof params.error === 'string' ? params.error : undefined
  const errorApp = typeof params.app === 'string' ? params.app : undefined

  let accessError: string | undefined
  if (errorCode === 'no_access' && errorApp) {
    const appDef = ALL_APPS.find(a => a.id === errorApp)
    const appName = appDef?.name ?? errorApp
    accessError = `You don't have access to ${appName}. Contact an administrator if you need access.`
  }

  const authzApps = (session as any).authz?.apps as Record<string, any> | undefined
  const rolesClaim = authzApps ?? ((session as any).roles as Record<string, any> | undefined)
  const normalizedRolesClaim = (() => {
    if (!rolesClaim) return rolesClaim

    let normalized = rolesClaim
    const legacyAtlasKey = String.fromCharCode(104, 114, 109, 115)
    const legacyXplanKey = String.fromCharCode(120, 45, 112, 108, 97, 110)

    // Backwards-compat: Atlas was previously keyed differently in entitlements.
    if (legacyAtlasKey in normalized && !('atlas' in normalized)) {
      normalized = { ...normalized, atlas: (normalized as any)[legacyAtlasKey] }
    }

    if (legacyXplanKey in normalized && !('xplan' in normalized)) {
      normalized = { ...normalized, xplan: (normalized as any)[legacyXplanKey] }
    }

    return normalized
  })()
  const globalRolesFromAuthz = Array.isArray((session as any).authz?.globalRoles)
    ? ((session as any).authz.globalRoles as unknown[])
    : []
  const globalRolesFromSession = Array.isArray((session as any).globalRoles)
    ? ((session as any).globalRoles as unknown[])
    : []
  const isPlatformAdmin = [...globalRolesFromAuthz, ...globalRolesFromSession]
    .map((value) => String(value).trim().toLowerCase())
    .includes('platform_admin')

  const allowedAppIds = normalizedRolesClaim ? Object.keys(normalizedRolesClaim) : []
  const assignedApps = isPlatformAdmin
    ? ALL_APPS.filter((app) => app.lifecycle !== 'archive')
    : filterAppsForUser(allowedAppIds)

  const apps = ALL_APPS.filter((app) => (
    app.lifecycle !== 'archive'
    && (app.lifecycle !== 'dev' || isPlatformAdmin)
  ))

  // Resolve URLs on the server side so the client never sees placeholder slugs or stale hosts
  const appsWithUrls = apps.map(app => ({
    ...app,
    url: resolveAppUrl(app)
  }))

  const assignedAppsWithUrls = assignedApps.map((app) => ({
    ...app,
    url: resolveAppUrl(app),
  }))

  return (
    <PortalClient
      session={session}
      apps={appsWithUrls}
      accessApps={assignedAppsWithUrls}
      roles={normalizedRolesClaim}
      isPlatformAdmin={isPlatformAdmin}
      accessError={accessError}
    />
  )
}
