import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  if (pathname === '/argus/argus' || pathname.startsWith('/argus/argus/')) {
    const next = request.nextUrl.clone()
    next.pathname = pathname.replace('/argus/argus', '/argus')
    return NextResponse.redirect(next)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/argus/argus', '/argus/argus/:path*'],
}

