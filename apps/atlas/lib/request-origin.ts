import type { NextRequest } from 'next/server'
import { resolveAppAuthOrigin } from '@targon/auth'

export function resolveAppOrigin(request: Pick<NextRequest, 'headers' | 'nextUrl'>): string {
  return resolveAppAuthOrigin({
    request: {
      headers: request.headers,
      url: request.nextUrl.origin,
    },
  })
}
