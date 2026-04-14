import { buildCookieOptions } from '@targon/auth'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSafeServerSession } from '@/lib/safe-session'
import {
  activeTenantCookieName,
  encodeSessionTokenWithActiveTenant,
  encodeSignedTenantSelection,
  isRequestedTenantAllowed,
} from '@/lib/tenant-selection'

const bodySchema = z.object({
  appId: z.string().min(1),
  tenantCode: z.string().min(1),
})

export async function PUT(request: Request) {
  const session = await getSafeServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const body = bodySchema.parse(await request.json())
  if (!isRequestedTenantAllowed(session, body.appId, body.tenantCode)) {
    return NextResponse.json({ error: 'Tenant not allowed' }, { status: 403 })
  }

  const response = NextResponse.json({
    ok: true,
    activeTenant: body.tenantCode,
    appId: body.appId,
  })
  const sessionToken = await encodeSessionTokenWithActiveTenant(
    request.headers.get('cookie'),
    body.tenantCode,
  )
  const sharedCookies = buildCookieOptions({
    domain: process.env.COOKIE_DOMAIN!,
    appId: 'targon',
  })!
  const sessionTokenCookie = sharedCookies.sessionToken!

  response.cookies.set(sessionToken.name, sessionToken.value, sessionTokenCookie.options)

  response.cookies.set(
    activeTenantCookieName(body.appId),
    await encodeSignedTenantSelection(body.appId, body.tenantCode),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    },
  )

  return response
}
