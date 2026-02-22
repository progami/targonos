import { redirect } from 'next/navigation'
import RelayClient from './RelayClient'

export const dynamic = 'force-dynamic'

type SearchParams = Record<string, string | string[] | undefined>

function getFirstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function normalizeCookieDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, '')
  if (trimmed.startsWith('.')) {
    return trimmed.slice(1)
  }
  return trimmed
}

function isHostWithinDomain(hostname: string, domain: string): boolean {
  const normalizedHost = hostname.trim().toLowerCase().replace(/\.$/, '')
  if (normalizedHost === domain) return true
  return normalizedHost.endsWith(`.${domain}`)
}

export default function AuthRelay({ searchParams }: { searchParams?: SearchParams }) {
  const toParam = getFirstString(searchParams?.to)
  if (!toParam || toParam.trim().length === 0) {
    redirect('/')
  }

  const baseUrl = process.env.NEXTAUTH_URL
  if (!baseUrl) {
    throw new Error('NEXTAUTH_URL must be defined for /auth/relay.')
  }
  const portalOrigin = new URL(baseUrl).origin

  let target: URL
  try {
    target = new URL(toParam, portalOrigin)
  } catch {
    redirect('/')
  }

  const protocol = target.protocol.toLowerCase()
  if (protocol !== 'http:' && protocol !== 'https:') {
    redirect('/')
  }

  if (target.origin === portalOrigin) {
    return <RelayClient to={target.toString()} />
  }

  const isProd = process.env.NODE_ENV === 'production'
  const hostname = target.hostname.toLowerCase()

  if (!isProd && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    return <RelayClient to={target.toString()} />
  }

  const cookieDomainRaw = process.env.COOKIE_DOMAIN
  if (!cookieDomainRaw) {
    throw new Error('COOKIE_DOMAIN must be defined for /auth/relay.')
  }
  const cookieDomain = normalizeCookieDomain(cookieDomainRaw)
  if (cookieDomain.length === 0) {
    throw new Error('COOKIE_DOMAIN must be a non-empty domain for /auth/relay.')
  }

  if (isProd && protocol !== 'https:') {
    redirect('/')
  }

  if (!isHostWithinDomain(hostname, cookieDomain)) {
    redirect('/')
  }

  return <RelayClient to={target.toString()} />
}

