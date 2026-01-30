import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function targetUrl(req: Request): URL {
  return new URL('/hermes/api/solicitations/request-review', req.url)
}

export function GET(req: Request) {
  return NextResponse.redirect(targetUrl(req), { status: 307 })
}

export function POST(req: Request) {
  return NextResponse.redirect(targetUrl(req), { status: 307 })
}
