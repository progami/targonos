import { headers } from 'next/headers';
import type { Session } from 'next-auth';
import type { PortalConsumerSession } from '@targon/auth';
import { readPortalConsumerSession } from '@targon/auth';

type XPlanSession = Session & {
  authz?: unknown;
  roles?: unknown;
  globalRoles?: unknown;
  authzVersion?: unknown;
  activeTenant?: string | null;
};

function requireSharedSecret(): string {
  const value = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value || value.trim() === '') {
    throw new Error('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for X-Plan auth.');
  }
  return value;
}

function buildSession(session: PortalConsumerSession): Session {
  const result: XPlanSession = {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user: {
      name: typeof session.payload.name === 'string' ? session.payload.name : undefined,
      email: typeof session.payload.email === 'string' ? session.payload.email : undefined,
    },
    authz: session.authz,
    roles: session.payload.roles ?? session.authz.apps,
    globalRoles: session.payload.globalRoles ?? session.authz.globalRoles,
    authzVersion:
      typeof session.payload.authzVersion === 'number'
        ? session.payload.authzVersion
        : session.authz.version,
    activeTenant: session.activeTenant,
  };

  if (typeof session.payload.sub === 'string' && session.payload.sub.trim() !== '') {
    (result.user as { id?: string }).id = session.payload.sub;
  }

  return result;
}

export async function auth(): Promise<Session | null> {
  const headerList = await headers();
  const session = await readPortalConsumerSession({
    request: { headers: headerList },
    appId: 'xplan',
    secret: requireSharedSecret(),
  });

  if (!session) {
    return null;
  }

  return buildSession(session);
}
