import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserAuthz, removeManualUserAppGrant, upsertManualUserAppGrant } from '@targon/auth/server'

import { auth } from '@/lib/auth'
import { isPlatformAdminSession } from '@/lib/platform-admin'

const updateGrantSchema = z.object({
  mode: z.enum(['grant', 'deny']).default('grant'),
  role: z.enum(['viewer', 'member', 'admin']).optional(),
  appName: z.string().min(1).optional(),
  locked: z.boolean().optional(),
  departments: z.array(z.string().min(1)).optional(),
})

async function resolveParams(context: { params: Promise<unknown> }) {
  const params = await context.params
  const parsed = z.object({ userId: z.string().min(1), appId: z.string().min(1) }).parse(params)
  return parsed
}

export async function PUT(request: Request, context: { params: Promise<unknown> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (!isPlatformAdminSession(session)) {
    return NextResponse.json({ error: 'Only platform admins can update app grants' }, { status: 403 })
  }

  const { userId, appId } = await resolveParams(context)
  const body = await request.json().catch(() => ({}))
  const parsed = updateGrantSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  if (parsed.data.mode === 'deny') {
    const user = await removeManualUserAppGrant(userId, appId)
    const authz = await getUserAuthz(userId)
    return NextResponse.json({ mode: 'deny', user, authz })
  }

  const user = await upsertManualUserAppGrant({
    userId,
    appSlug: appId,
    appName: parsed.data.appName,
    role: parsed.data.role ?? 'member',
    departments: parsed.data.departments ?? [],
    locked: parsed.data.locked ?? true,
  })
  const authz = await getUserAuthz(userId)

  return NextResponse.json({ mode: 'grant', user, authz })
}

export async function DELETE(_request: Request, context: { params: Promise<unknown> }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (!isPlatformAdminSession(session)) {
    return NextResponse.json({ error: 'Only platform admins can update app grants' }, { status: 403 })
  }

  const { userId, appId } = await resolveParams(context)
  const user = await removeManualUserAppGrant(userId, appId)
  const authz = await getUserAuthz(userId)

  return NextResponse.json({ mode: 'deny', user, authz })
}
