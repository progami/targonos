import fs from 'fs'
import path from 'path'

export type AppLifecycle = 'active' | 'dev' | 'archive'
export type AppEntryPolicy = 'role_gated' | 'public'

function normalizeOrigin(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const candidates = hasScheme ? [trimmed] : [`https://${trimmed}`, `http://${trimmed}`]
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      return url.origin
    } catch {
      continue
    }
  }
  return undefined
}

function resolvePortalBaseUrl(): string {
  const candidates = [
    process.env.PORTAL_APPS_HOST,
    process.env.PORTAL_APPS_BASE_URL,
    process.env.NEXT_PUBLIC_PORTAL_APPS_BASE_URL,
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
    process.env.PORTAL_AUTH_URL,
    process.env.NEXTAUTH_URL,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate)
    if (normalized) {
      return normalized
    }
  }

  throw new Error('Portal base URL is not configured. Set PORTAL_APPS_BASE_URL or NEXT_PUBLIC_PORTAL_AUTH_URL.')
}

function joinBaseUrl(base: string, suffix: string): string {
  const normalizedBase = base.replace(/\/+$/, '')
  if (!suffix || suffix === '/') {
    return `${normalizedBase}/`
  }
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`
  return `${normalizedBase}${normalizedSuffix}`
}

type AppBase = {
  id: string
  name: string
  description: string
  url: string
  entryPolicy?: AppEntryPolicy
  category: string
  icon?: string
  devPath?: string
  devUrl?: string
}

type AppManifestEntry = {
  lifecycle?: AppLifecycle | 'archived'
}

type AppManifest = {
  apps?: Record<string, AppManifestEntry>
  devOnly?: string[]
}

type AppOverrideConfig = {
  host?: string
  apps?: Record<string, string | number>
}

export type AppDef = AppBase & {
  lifecycle: AppLifecycle
  entryPolicy: AppEntryPolicy
}

const PORTAL_BASE_URL = resolvePortalBaseUrl()

const BASE_APPS: AppBase[] = [
  {
    id: 'talos',
    name: 'Talos',
    description: 'Inbound, outbound, inventory and reporting.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/talos'),
    category: 'Ops',
  },
  {
    id: 'atlas',
    name: 'Atlas',
    description: 'HR, payroll and people operations.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/atlas'),
    devPath: '/atlas',
    category: 'HR / Admin',
  },
  {
    id: 'website',
    name: 'Website',
    description: 'Marketing website and CMS.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/'),
    entryPolicy: 'public',
    category: 'Product',
  },
  {
    id: 'kairos',
    name: 'Kairos',
    description: 'Forecasting workspace for marketplace signals and statistical models.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/kairos'),
    category: 'Product',
    devUrl: 'http://localhost:3010',
  },
  {
    id: 'xplan',
    name: 'xPlan',
    description: 'Collaborative planning workspace for sales, operations, and finance.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/xplan/1-strategies'),
    category: 'Product',
    devUrl: 'http://localhost:3008',
  },
  {
    id: 'plutus',
    name: 'Plutus',
    description: 'Finance workspace (FCC rebrand).',
    url: joinBaseUrl(PORTAL_BASE_URL, '/plutus'),
    category: 'Finance',
    devPath: '/plutus',
    devUrl: 'http://localhost:3012',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    description: 'Amazon Seller Central automations (messaging + solicitations).',
    url: joinBaseUrl(PORTAL_BASE_URL, '/hermes'),
    category: 'Account / Listing',
    devPath: '/hermes',
    devUrl: 'http://localhost:3014',
  },
  {
    id: 'argus',
    name: 'Argus',
    description: 'Amazon listing version control and monitoring.',
    url: joinBaseUrl(PORTAL_BASE_URL, '/argus'),
    entryPolicy: 'public',
    category: 'Account / Listing',
    devPath: '/argus',
    devUrl: 'http://localhost:3016',
  },
]

let manifestCache: AppManifest | null | undefined
let portalOverridesCache: AppOverrideConfig | null | undefined

function tryLoadAppManifest(): AppManifest | null {
  if (manifestCache !== undefined) {
    return manifestCache
  }

  const candidates = [
    path.resolve(process.cwd(), '../../app-manifest.json'),
    path.resolve(process.cwd(), '../app-manifest.json'),
    path.resolve(process.cwd(), 'app-manifest.json'),
  ]

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const raw = fs.readFileSync(candidate, 'utf8')
        manifestCache = JSON.parse(raw) as AppManifest
        return manifestCache
      }
    } catch (_err) {
      manifestCache = null
      return manifestCache
    }
  }

  manifestCache = null
  return manifestCache
}

const devOnlyEnv = process.env.APP_DEV_ONLY
const portalOverrides = tryLoadPortalOverrides()
const overrideAppIds = portalOverrides ? new Set(Object.keys(portalOverrides.apps ?? {})) : null
const devOnlySet = new Set(
  devOnlyEnv
    ? devOnlyEnv
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
    : []
)

const LIFECYCLE_ENV_PREFIX = 'APP_LIFECYCLE_'

function getEnvLifecycle(appId: string): AppLifecycle | undefined {
  const normalizedId = appId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()
  const envValue = process.env[`${LIFECYCLE_ENV_PREFIX}${normalizedId}`]
  if (!envValue) {
    return undefined
  }
  const normalizedValue = envValue.trim().toLowerCase()
  if (normalizedValue === 'dev' || normalizedValue === 'development') {
    return 'dev'
  }
  if (normalizedValue === 'active' || normalizedValue === 'stable' || normalizedValue === 'prod' || normalizedValue === 'production') {
    return 'active'
  }
  if (normalizedValue === 'archive' || normalizedValue === 'archived') {
    return 'archive'
  }
  return undefined
}

function resolveLifecycle(appId: string): AppLifecycle {
  if (appId.toLowerCase() === 'atlas') {
    return 'active'
  }

  const envLifecycle = getEnvLifecycle(appId)
  if (envLifecycle) {
    return envLifecycle
  }

  if (devOnlySet.has(appId.toLowerCase())) {
    return 'dev'
  }

  const manifest = tryLoadAppManifest()
  const manifestEntry = manifest?.apps?.[appId]
  if (manifestEntry?.lifecycle === 'dev') {
    return 'dev'
  }
  if (manifestEntry?.lifecycle === 'archive' || manifestEntry?.lifecycle === 'archived') {
    return 'archive'
  }
  if (manifestEntry?.lifecycle === 'active') {
    return 'active'
  }
  if (manifest?.devOnly?.some((value) => value.toLowerCase() === appId.toLowerCase())) {
    return 'dev'
  }

  return 'active'
}

const SOURCE_APPS = overrideAppIds ? BASE_APPS.filter((app) => overrideAppIds.has(app.id)) : BASE_APPS

export const ALL_APPS: AppDef[] = SOURCE_APPS.map((app) => ({
  ...app,
  lifecycle: resolveLifecycle(app.id),
  entryPolicy: app.entryPolicy ?? 'role_gated',
}))

export function filterAppsForUser(allowedAppIds: string[]) {
  const set = new Set(allowedAppIds)
  return ALL_APPS.filter(app => {
    if (app.lifecycle === 'archive') {
      return false
    }
    if (app.entryPolicy === 'public') {
      return true
    }
    return set.has(app.id)
  })
}

// Development URL resolution (ports from a global root file or env)
type DevConfig = { host?: string; apps?: Record<string, number | string> }

function tryLoadRootDevConfig(): DevConfig | null {
  try {
    // Look for dev.apps.json in likely root locations relative to app cwd
    const candidates = [
      path.resolve(process.cwd(), '../../dev.apps.json'),
      path.resolve(process.cwd(), '../dev.apps.json'),
      path.resolve(process.cwd(), 'dev.apps.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8')
        return JSON.parse(raw) as DevConfig
      }
    }
  } catch (_e) {
    // ignore
  }
  return null
}

function getEnvDevUrl(appId: string): string | undefined {
  const keyUrl = `DEV_APP_URL_${appId.toUpperCase()}`
  const keyPortA = `DEV_${appId.toUpperCase()}_PORT`
  const keyPortB = `${appId.toUpperCase()}_PORT`
  if (process.env[keyUrl]) return process.env[keyUrl]
  const host = process.env.DEV_APPS_HOST || 'localhost'
  const port = process.env[keyPortA] || process.env[keyPortB]
  if (port) return `http://${host}:${port}`
  return undefined
}

export function resolveAppUrl(app: AppDef): string {
  const overrideUrl = resolveOverrideUrl(app)
  if (overrideUrl) {
    return overrideUrl
  }

  if (process.env.NODE_ENV === 'production') {
    return app.url
  }

  let base = getEnvDevUrl(app.id)

  if (!base) {
    const cfg = tryLoadRootDevConfig()
    if (cfg?.apps && app.id in cfg.apps) {
      const val = cfg.apps[app.id]
      const host = cfg.host || 'localhost'
      base = typeof val === 'number' ? `http://${host}:${val}` : typeof val === 'string' ? val : undefined
    }
  }

  if (!base && (process.env.NODE_ENV as string | undefined) !== 'production' && app.devUrl) {
    base = app.devUrl
  }

  if (!base) {
    base = app.url
  }

  if (app.devPath) {
    try {
      const url = new URL(base)
      url.pathname = app.devPath
      return url.toString()
    } catch {}
  }

  return base
}

function tryLoadPortalOverrides(): AppOverrideConfig | null {
  if (portalOverridesCache !== undefined) {
    return portalOverridesCache
  }

  const configPath = process.env.PORTAL_APPS_CONFIG?.trim()
  if (!configPath) {
    portalOverridesCache = null
    return portalOverridesCache
  }

  const resolvedPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath)

  try {
    if (fs.existsSync(resolvedPath)) {
      const raw = fs.readFileSync(resolvedPath, 'utf8')
      portalOverridesCache = JSON.parse(raw) as AppOverrideConfig
      return portalOverridesCache
    }
  } catch (_err) {
    portalOverridesCache = null
    return portalOverridesCache
  }

  portalOverridesCache = null
  return portalOverridesCache
}

function resolveOverrideUrl(app: AppDef): string | undefined {
  if (!portalOverrides) {
    return undefined
  }

  const entry = portalOverrides.apps?.[app.id]
  if (entry === undefined) {
    return undefined
  }

  const host = normalizeHost(portalOverrides.host || process.env.PORTAL_APPS_HOST)

  if (typeof entry === 'number') {
    const base = host ? `${host.replace(/\/$/, '')}:${entry}` : `http://localhost:${entry}`
    if (app.devPath) {
      try {
        const url = new URL(base)
        url.pathname = app.devPath
        return url.toString()
      } catch {
        return `${base}${app.devPath.startsWith('/') ? app.devPath : `/${app.devPath}`}`
      }
    }
    return base
  }

  const trimmed = entry.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (host) {
    try {
      const baseUrl = new URL(host)
      baseUrl.pathname = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
      return baseUrl.toString()
    } catch {}
  }

  return trimmed
}

function normalizeHost(rawHost?: string): string | undefined {
  if (!rawHost) return undefined
  const trimmed = rawHost.trim()
  if (!trimmed) return undefined
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, '')
  }
  return `http://${trimmed.replace(/\/$/, '')}`
}
