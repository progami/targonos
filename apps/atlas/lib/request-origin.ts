import type { NextRequest } from 'next/server'

function normalizeProtocol(protocol: string): string {
  const trimmed = protocol.trim()
  if (trimmed.endsWith(':')) {
    return trimmed.slice(0, -1)
  }
  return trimmed
}

export function resolveAppOrigin(request: Pick<NextRequest, 'headers' | 'nextUrl'>): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
    process.env.NEXTAUTH_URL,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return new URL(candidate).origin
    } catch {
      continue
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  let proto = request.nextUrl.protocol
  const forwardedProtoHeader = request.headers.get('x-forwarded-proto')
  if (forwardedProtoHeader) {
    const value = forwardedProtoHeader.split(',')[0]?.trim()
    if (value) {
      proto = value
    }
  }
  proto = normalizeProtocol(proto)

  if (forwardedHost) {
    const host = forwardedHost.split(',')[0]?.trim()
    if (host) {
      return `${proto}://${host}`
    }
  }

  const hostHeader = request.headers.get('host')
  if (hostHeader) {
    return `${proto}://${hostHeader}`
  }

  return request.nextUrl.origin
}

