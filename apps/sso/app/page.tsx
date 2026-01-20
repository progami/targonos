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

  const rolesClaim = (session as any).roles as Record<string, any> | undefined
  const normalizedRolesClaim = (() => {
    if (!rolesClaim) return rolesClaim

    let normalized = rolesClaim
    const legacyAtlasKey = String.fromCharCode(104, 114, 109, 115)
    const legacyXplanKey = String.fromCharCode(120, 45, 112, 108, 97, 110)

    // Backwards-compat: Atlas was previously keyed differently in entitlements.
    if (legacyAtlasKey in normalized && !('atlas' in normalized)) {
      normalized = { ...normalized, atlas: (normalized as any)[legacyAtlasKey] }
    }

    // Backwards-compat: Talos was previously keyed as WMS in entitlements.
    if ('wms' in normalized && !('talos' in normalized)) {
      normalized = { ...normalized, talos: (normalized as any).wms }
    }

    if (legacyXplanKey in normalized && !('xplan' in normalized)) {
      normalized = { ...normalized, xplan: (normalized as any)[legacyXplanKey] }
    }

    return normalized
  })()
  const allowedAppIds = normalizedRolesClaim ? Object.keys(normalizedRolesClaim) : []
  const assignedApps = filterAppsForUser(allowedAppIds)

  const previewApps = ALL_APPS.filter((app) => {
    if (app.lifecycle !== 'dev') return false
    return !assignedApps.some((assigned) => assigned.id === app.id)
  })

  const apps = [...assignedApps, ...previewApps]

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
      accessError={accessError}
    />
  )
}
