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

  void request
  throw new Error('Unable to resolve application origin. Set NEXT_PUBLIC_APP_URL, BASE_URL, or NEXTAUTH_URL.')
}
