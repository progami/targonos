import { NextResponse } from 'next/server'
import { syncGroupBasedAppAccess } from '@targon/auth/server'

import { auth } from '@/lib/auth'
import { isPlatformAdminSession } from '@/lib/platform-admin'

export async function POST(request: Request) {
  const internalSyncToken = process.env.INTERNAL_AUTHZ_SYNC_TOKEN
  const suppliedToken = request.headers.get('x-internal-authz-token')

  const isInternalSync =
    typeof internalSyncToken === 'string' &&
    internalSyncToken.trim() !== '' &&
    suppliedToken === internalSyncToken

  if (!isInternalSync) {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    if (!isPlatformAdminSession(session)) {
      return NextResponse.json({ error: 'Only platform admins can trigger group sync' }, { status: 403 })
    }
  }

  const result = await syncGroupBasedAppAccess()

  return NextResponse.json({
    ok: true,
    trigger: isInternalSync ? 'internal' : 'platform_admin',
    result,
  })
}
