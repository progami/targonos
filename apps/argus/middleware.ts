import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname
  if (pathname === '/argus/argus' || pathname.startsWith('/argus/argus/')) {
    const next = new URL(request.url)
    next.pathname = pathname.replace('/argus/argus', '/argus')
    return NextResponse.redirect(next)
  }

  return NextResponse.next()
}
