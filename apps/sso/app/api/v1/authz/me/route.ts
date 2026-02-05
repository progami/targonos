import { NextResponse } from 'next/server'
import { getUserAuthz } from '@targon/auth/server'

import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const userId = typeof (session.user as any).id === 'string'
    ? (session.user as any).id
    : null

  if (!userId) {
    return NextResponse.json({ error: 'Authenticated user id missing from session' }, { status: 401 })
  }

  const authz = await getUserAuthz(userId)

  return NextResponse.json(
    { authz },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
