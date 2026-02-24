import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';
import { hasCapability } from '@targon/auth';

import { auth } from '@/lib/auth';

export type KairosAuthedHandler<TContext = unknown> = (
  request: Request,
  session: Session,
  context: TContext,
) => Promise<Response>;

const truthyValues = new Set(['1', 'true', 'yes', 'on']);

function isDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  return (
    truthyValues.has(String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase()) ||
    truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase())
  );
}

function buildDevBypassSession(): Session {
  const rawUserId = process.env.DEV_AUTH_BYPASS_USER_ID;
  const userId = rawUserId && rawUserId.trim() !== '' ? rawUserId.trim() : 'dev-bypass-user';

  const rawEmail = process.env.DEV_AUTH_BYPASS_EMAIL;
  const email = rawEmail && rawEmail.trim() !== '' ? rawEmail.trim().toLowerCase() : 'dev-bypass@targonglobal.com';

  const rawName = process.env.DEV_AUTH_BYPASS_NAME;
  const name = rawName && rawName.trim() !== '' ? rawName.trim() : 'Dev Bypass';

  const authz = {
    version: 1,
    globalRoles: ['platform_admin'],
    apps: {
      kairos: {
        role: 'viewer',
        departments: [] as string[],
      },
    },
  };

  const session = {
    user: {
      id: userId,
      email,
      name,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    authz,
    roles: authz.apps,
    globalRoles: authz.globalRoles,
    authzVersion: authz.version,
  } as Session;

  return session;
}

export function withKairosAuth<TContext = unknown>(handler: KairosAuthedHandler<TContext>) {
  return async (request: Request, context: TContext) => {
    let session = await auth();
    if (!session && isDevBypassEnabled()) {
      session = buildDevBypassSession();
    }

    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const canEnter = hasCapability({ session, appId: 'kairos', capability: 'enter' });
    if (!canEnter) {
      return NextResponse.json({ error: 'No access to Kairos' }, { status: 403 });
    }

    return handler(request, session, context);
  };
}
