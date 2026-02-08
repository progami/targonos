import { headers } from 'next/headers';
import {
  decodePortalSession,
  getCandidateSessionCookieNames,
  type PortalJwtPayload,
} from '@targon/auth';

export type CurrentUser = {
  id: string;
  email: string;
  name: string | undefined;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headersList = await headers();
  const cookieHeader = headersList.get('cookie');

  const cookieNames = Array.from(
    new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('plutus'),
    ]),
  );
  const sharedSecret = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  const session: PortalJwtPayload | null = await decodePortalSession({
    cookieHeader,
    cookieNames,
    secret: sharedSecret,
    appId: 'plutus',
  });

  if (!session?.sub) {
    return null;
  }

  return {
    id: session.sub,
    email: session.email ?? '',
    name: session.name,
  };
}
