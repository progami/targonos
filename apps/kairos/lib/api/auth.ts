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

function isLoopbackHostname(rawHostname: string): boolean {
  const hostname = rawHostname.trim().toLowerCase().replace(/\.$/, '');
  if (!hostname) return false;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost')
  );
}

function isLocalhostOrigin(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function hasLocalhostBypassContext(request: Request): boolean {
  const envCandidates = [
    process.env.NEXTAUTH_URL,
    process.env.PORTAL_AUTH_URL,
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];

  if (envCandidates.some((candidate) => isLocalhostOrigin(candidate))) {
    return true;
  }

  try {
    const requestUrl = new URL(request.url);
    if (isLoopbackHostname(requestUrl.hostname)) {
      return true;
    }
  } catch {
    // continue to host header checks
  }

  const hostHeader = request.headers.get('host');
  if (!hostHeader) {
    return false;
  }

  try {
    const hostUrl = new URL(`http://${hostHeader}`);
    return isLoopbackHostname(hostUrl.hostname);
  } catch {
    return false;
  }
}

function isDevBypassEnabled(request: Request): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const allowBypass =
    truthyValues.has(String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase()) ||
    truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase());

  if (!allowBypass) {
    return false;
  }

  return hasLocalhostBypassContext(request);
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
    if (!session && isDevBypassEnabled(request)) {
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
