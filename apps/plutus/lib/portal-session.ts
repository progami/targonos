import {
  decodePortalSession,
  getCandidateSessionCookieNames,
  type PortalJwtPayload,
} from '@targon/auth';

const COOKIE_NAMES = Array.from(
  new Set([
    ...getCandidateSessionCookieNames('targon'),
    ...getCandidateSessionCookieNames('plutus'),
  ]),
);

function requirePortalAuthSecret(): string {
  const secret = process.env.PORTAL_AUTH_SECRET;
  if (secret === undefined || secret === '') {
    throw new Error('PORTAL_AUTH_SECRET is required');
  }
  return secret;
}

export async function decodePlutusPortalSession(
  cookieHeader: string | null,
): Promise<PortalJwtPayload | null> {
  return decodePortalSession({
    cookieHeader,
    cookieNames: COOKIE_NAMES,
    secret: requirePortalAuthSecret(),
    appId: 'plutus',
  });
}

export function isPlatformAdminPortalSession(session: PortalJwtPayload | null): boolean {
  if (!session) return false;

  const rolesFromAuthz = Array.isArray(session.authz?.globalRoles)
    ? session.authz.globalRoles
    : [];
  const roles = Array.isArray(session.globalRoles)
    ? session.globalRoles
    : [];

  const normalized = [...rolesFromAuthz, ...roles]
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => value !== '');

  return normalized.includes('platform_admin');
}

