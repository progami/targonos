/**
 * Utility functions for handling base path in the application
 */

function normalizeBasePath(rawBasePath: string): string {
 const trimmed = rawBasePath.trim()
 if (!trimmed || trimmed === '/') return ''

 const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
 const withoutTrailingSlash = withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
 const collapsedSlashes = withoutTrailingSlash.replace(/\/{2,}/g, '/')

 const segments = collapsedSlashes.split('/').filter(Boolean)
 if (segments.length > 0 && segments.length % 2 === 0) {
  const halfLen = segments.length / 2
  const firstHalf = segments.slice(0, halfLen).join('/')
  const secondHalf = segments.slice(halfLen).join('/')
  if (firstHalf === secondHalf) {
   return `/${firstHalf}`
  }
 }

 return collapsedSlashes
}

function inferBasePathFromPathname(pathname: string): string {
 const trimmed = pathname.trim()
 if (!trimmed.startsWith('/')) return ''

 const [firstSegment] = trimmed.split('/').filter(Boolean)
 if (firstSegment === 'talos') return '/talos'

 return ''
}

/**
 * Get the base path from environment or default to empty string
 */
export function getBasePath(): string {
 const rawBasePath =
  typeof window === 'undefined'
   ? (process.env.BASE_PATH ?? process.env.NEXT_PUBLIC_BASE_PATH ?? '')
   : (process.env.NEXT_PUBLIC_BASE_PATH ?? '')

 const normalized = normalizeBasePath(rawBasePath)
 if (normalized) return normalized

 // If Talos is accessed via `/talos/*` but BASE_PATH is not set (rewrite mode),
 // infer it so client-side fetches hit the same origin path.
 if (typeof window !== 'undefined') {
  const inferred = inferBasePathFromPathname(window.location.pathname ?? '')
  return normalizeBasePath(inferred)
 }

 return ''
}

/**
 * Prepend base path to a given path
 * @param path - The path to prepend base path to
 * @returns The path with base path prepended
 */
export function withBasePath(path: string): string {
 const basePath = getBasePath()
 if (!basePath) return path
 
 // Ensure path starts with /
 const normalizedPath = path.startsWith('/') ? path : `/${path}`

 if (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`)) {
  return normalizedPath
 }
 
 // Avoid double slashes
 return `${basePath}${normalizedPath}`
}

/**
 * Remove base path from a given path
 * @param path - The path to remove base path from
 * @returns The path without base path
 */
export function withoutBasePath(path: string): string {
 const basePath = getBasePath()
 if (!basePath || !path.startsWith(basePath)) return path
 
 const pathWithoutBase = path.slice(basePath.length)
 return pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`
}

/**
 * Check if we're running with a base path
 */
export function hasBasePath(): boolean {
 return !!getBasePath()
}
