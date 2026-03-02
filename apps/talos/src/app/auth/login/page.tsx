import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { portalOrigin } from '@/lib/portal'
import { withoutBasePath } from '@/lib/utils/base-path'

type SearchParamsInput =
 | { callbackUrl?: string }
 | Promise<{ callbackUrl?: string } | undefined>
 | undefined

export default async function LoginPage({ searchParams }: { searchParams?: SearchParamsInput }) {
 const resolved = await Promise.resolve(searchParams)
 const desiredRaw =
  typeof resolved?.callbackUrl === 'string' && resolved.callbackUrl.trim().length > 0
   ? resolved.callbackUrl.trim()
   : '/dashboard'
 const desiredRelative = desiredRaw.startsWith('/') ? desiredRaw : `/${desiredRaw}`
 const desired =
  desiredRaw.startsWith('http://') || desiredRaw.startsWith('https://')
   ? desiredRaw
   : withoutBasePath(desiredRelative)

 const session = await auth()
 if (session) {
 redirect(desired)
 }
 const portalAuth = portalOrigin()
 const resolvedAppBase = await resolveAppBase()
 if (!resolvedAppBase) {
  throw new Error('Unable to determine Talos application base URL. Configure BASE_PATH or NEXT_PUBLIC_APP_URL.')
 }
const { baseUrl, basePath, originHostname } = resolvedAppBase

 if (originHostname === 'example.com') {
 throw new Error('Application origin is still example.com; configure production URLs in environment variables.')
 }
 const url = new URL('/login', portalAuth)
 // Pass back the full app URL users should land on after portal login
 if (desired.startsWith('http')) {
 url.searchParams.set('callbackUrl', desired)
 } else {
 url.searchParams.set('callbackUrl', buildCallback(baseUrl, basePath, desired))
 }
 redirect(url.toString())
}

async function resolveAppBase(): Promise<{ baseUrl: string; basePath: string; originHostname: string } | null> {
 const normalizeBasePath = (value?: string | null) => {
 if (!value) return ''
 let normalized = value.trim()
 if (!normalized) return ''
 if (!normalized.startsWith('/')) {
 normalized = `/${normalized}`
 }
 if (normalized.length > 1 && normalized.endsWith('/')) {
 normalized = normalized.slice(0, -1)
 }
 return normalized
 }

 const parseUrl = (value?: string | null) => {
 if (!value) return null
 try {
 return new URL(value)
 } catch {
 return null
 }
 }

 const appUrlFromEnv = parseUrl(process.env.NEXT_PUBLIC_APP_URL)
 const portalUrl = parseUrl(process.env.PORTAL_AUTH_URL)
 const headerList = await headers()
 const requestUrlFromHeaders = resolveUrlFromHeaders(headerList)

 const basePathCandidates = [
  normalizeBasePath(process.env.BASE_PATH),
  normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH),
  normalizeBasePath(requestUrlFromHeaders?.pathname ?? ''),
  normalizeBasePath(appUrlFromEnv?.pathname ?? ''),
 ]

 let basePath = ''
 for (const candidate of basePathCandidates) {
  if (!candidate) continue
  basePath = candidate
  break
 }

 let originUrl = requestUrlFromHeaders
 if (!originUrl) {
  originUrl = appUrlFromEnv
 }
 if (!originUrl) {
  originUrl = portalUrl
 }
 if (!originUrl) {
  throw new Error('NEXT_PUBLIC_APP_URL or PORTAL_AUTH_URL must be configured for Talos login redirect.')
 }

 const baseUrl = `${originUrl.origin}${basePath}`
 return { baseUrl, basePath, originHostname: originUrl.hostname }
}

function resolveUrlFromHeaders(headerList: { get(name: string): string | null }): URL | null {
 const parseUrl = (value?: string | null) => {
  if (!value) return null
  try {
   return new URL(value)
  } catch {
   return null
  }
 }

 const forwardedOriginRaw = headerList.get('x-forwarded-origin')
 const forwardedOrigin = forwardedOriginRaw ? forwardedOriginRaw.split(',')[0].trim() : ''
 if (forwardedOrigin) {
  const parsed = parseUrl(forwardedOrigin)
  if (parsed) return parsed
 }

 const forwardedHostRaw = headerList.get('x-forwarded-host')
 const forwardedHost = forwardedHostRaw ? forwardedHostRaw.split(',')[0].trim() : ''
 const forwardedProtoRaw = headerList.get('x-forwarded-proto')
 const forwardedProto = forwardedProtoRaw ? forwardedProtoRaw.split(',')[0].trim() : 'https'

 if (forwardedHost) {
  const parsed = parseUrl(`${forwardedProto}://${forwardedHost}`)
  if (parsed) return parsed
 }

 const hostRaw = headerList.get('host')
 const host = hostRaw ? hostRaw.trim() : ''
 if (host) {
  const parsed = parseUrl(`${forwardedProto}://${host}`)
  if (parsed) return parsed
 }

 return null
}

function buildCallback(appBase: string, basePath: string, target: string): string {
 const cleanedBase = appBase.endsWith('/') ? appBase.slice(0, -1) : appBase
 if (target.startsWith('http://') || target.startsWith('https://')) {
 return target
 }
 const relative = target.startsWith('/') ? target : `/${target}`
 if (!basePath) {
 return `${cleanedBase}${relative}`
 }
 const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
 if (relative === normalizedBasePath) {
 return cleanedBase
 }
 if (relative.startsWith(`${normalizedBasePath}/`)) {
 const trimmed = relative.slice(normalizedBasePath.length)
 return `${cleanedBase}${trimmed}`
 }
 const trimmedRelative = relative.startsWith('/') ? relative.slice(1) : relative
 return `${cleanedBase}/${trimmedRelative}`
}
