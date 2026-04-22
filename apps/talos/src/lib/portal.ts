import { buildPortalUrl, resolvePortalAuthOrigin } from '@targon/auth'
import { withBasePath } from '@/lib/utils/base-path'

type RequestLike = {
 headers: Headers
 url: string
}

export function portalOrigin(request?: RequestLike, fallbackOrigin?: string) {
 return resolvePortalAuthOrigin({ request, fallbackOrigin })
}

export function portalUrl(path: string, request?: RequestLike, fallbackOrigin?: string) {
 return buildPortalUrl(path, { request, fallbackOrigin })
}

export function redirectToPortal(path: string, callbackUrl: string, request?: RequestLike, fallbackOrigin?: string) {
 const target = portalUrl(path, request, fallbackOrigin)
 target.searchParams.set('callbackUrl', callbackUrl)
 if (typeof window !== 'undefined') {
 window.location.href = target.toString()
 }
 return target.toString()
}

export function buildAppCallbackUrl(path: string, origin?: string): string {
 if (!path.startsWith('/')) {
  throw new Error('buildAppCallbackUrl expects an absolute app path starting with "/".')
 }

 let resolvedOrigin = origin
 if (typeof resolvedOrigin !== 'string' || resolvedOrigin.trim() === '') {
  if (typeof window === 'undefined') {
   throw new Error('App origin is required to build a portal callback URL.')
  }
  resolvedOrigin = window.location.origin
 }

 return `${resolvedOrigin}${withBasePath(path)}`
}
