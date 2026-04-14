import { ALL_APPS, resolveAppUrl, type AppDef } from './apps'

const ALLOWED_PORTAL_PATHS = ['/', '/login', '/logout', '/xplan']

function normalizeBasePath(pathname: string): string {
  if (pathname === '/' || pathname.trim() === '') {
    return '/'
  }

  const normalized = pathname.replace(/\/+$/, '')
  return normalized === '' ? '/' : normalized
}

function isPathWithinBase(pathname: string, basePath: string): boolean {
  const normalizedPath = normalizeBasePath(pathname)
  const normalizedBase = normalizeBasePath(basePath)

  if (normalizedBase === '/') {
    return normalizedPath === '/'
  }

  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`)
}

function isAllowedPortalPath(pathname: string): boolean {
  return ALLOWED_PORTAL_PATHS.some((allowedPath) => isPathWithinBase(pathname, allowedPath))
}

function getRegistryPathPrefixes(app: AppDef): string[] {
  const prefixes = new Set<string>()
  prefixes.add(normalizeBasePath(new URL(app.url).pathname))
  if (app.devPath) {
    prefixes.add(normalizeBasePath(app.devPath))
  }
  return Array.from(prefixes)
}

function matchesRegisteredPath(app: AppDef, pathname: string): boolean {
  return getRegistryPathPrefixes(app).some((prefix) => isPathWithinBase(pathname, prefix))
}

function resolveRegistryBaseUrl(app: AppDef): string {
  if (process.env.NODE_ENV === 'production') {
    return app.url
  }

  return resolveAppUrl(app)
}

function matchesRegisteredAppTarget(target: URL): boolean {
  const candidateApps = ALL_APPS.filter((app) => app.id !== 'website' && matchesRegisteredPath(app, target.pathname))

  for (const app of candidateApps) {
    const registeredBase = new URL(resolveRegistryBaseUrl(app))
    if (target.origin !== registeredBase.origin) {
      continue
    }
    if (isPathWithinBase(target.pathname, registeredBase.pathname)) {
      return true
    }
  }

  return false
}

export function resolvePortalCallbackTarget(input: {
  targetUrl: string
  portalBaseUrl: string
}): string | null {
  let portalBase: URL
  try {
    portalBase = new URL(input.portalBaseUrl)
  } catch {
    return null
  }

  let target: URL
  try {
    target = new URL(input.targetUrl, portalBase)
  } catch {
    return null
  }

  const protocol = target.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    return null
  }

  if (target.origin === portalBase.origin && isAllowedPortalPath(target.pathname)) {
    return target.toString()
  }

  if (matchesRegisteredAppTarget(target)) {
    return target.toString()
  }

  return null
}
