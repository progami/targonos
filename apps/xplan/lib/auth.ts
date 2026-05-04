import NextAuth from 'next-auth';
import type { NextAuthConfig, Session } from 'next-auth';
import type { NextRequest } from 'next/server';
import { getWorktreeDevSession, withSharedAuth } from '@targon/auth';

type NextAuthResult = ReturnType<typeof NextAuth>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be defined for X-Plan auth configuration.`);
  }
  return value;
}

function resolveAuthOptions(): NextAuthConfig {
  requireEnv('COOKIE_DOMAIN');
  requireEnv('NEXTAUTH_URL');
  requireEnv('NEXT_PUBLIC_APP_URL');
  requireEnv('PORTAL_AUTH_URL');
  requireEnv('NEXT_PUBLIC_PORTAL_AUTH_URL');

  const portalAuthSecret = process.env.PORTAL_AUTH_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  const sharedSecret =
    typeof portalAuthSecret === 'string' && portalAuthSecret.trim() !== ''
      ? portalAuthSecret
      : typeof nextAuthSecret === 'string' && nextAuthSecret.trim() !== ''
        ? nextAuthSecret
        : undefined;
  if (!sharedSecret) {
    throw new Error(
      'PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for X-Plan auth configuration.',
    );
  }
  process.env.NEXTAUTH_SECRET = sharedSecret;

  const baseAuthOptions: NextAuthConfig = {
    trustHost: true,
    providers: [],
    session: { strategy: 'jwt' },
    secret: sharedSecret,
    callbacks: {
      async jwt({ token, user }) {
        if (user && (user as any).id) {
          token.sub = (user as any).id;
        }
        return token;
      },
      async session({ session, token }) {
        const tokenClaims = token as {
          authz?: {
            apps?: unknown;
            globalRoles?: unknown;
            version?: unknown;
          };
          roles?: unknown;
          globalRoles?: unknown;
          authzVersion?: unknown;
          sub?: unknown;
        };

        (session as { authz?: unknown }).authz = tokenClaims.authz;
        (session as { roles?: unknown }).roles = tokenClaims.roles ?? tokenClaims.authz?.apps;
        (session as { globalRoles?: unknown }).globalRoles =
          tokenClaims.globalRoles ?? tokenClaims.authz?.globalRoles;
        (session as { authzVersion?: unknown }).authzVersion =
          tokenClaims.authzVersion ?? tokenClaims.authz?.version;
        if (typeof tokenClaims.sub === 'string' && tokenClaims.sub.trim() !== '') {
          session.user.id = tokenClaims.sub;
        }
        return session;
      },
    },
  };

  return withSharedAuth(baseAuthOptions, {
    cookieDomain: requireEnv('COOKIE_DOMAIN'),
    // Read portal cookie in dev
    appId: 'targon',
  });
}

let cached: NextAuthResult | null = null;

function getNextAuth(): NextAuthResult {
  if (cached) return cached;
  cached = NextAuth(resolveAuthOptions());
  return cached;
}

export const handlers = {
  GET: (request: NextRequest) => getNextAuth().handlers.GET(request),
  POST: (request: NextRequest) => getNextAuth().handlers.POST(request),
} satisfies NextAuthResult['handlers'];

export async function auth(): Promise<Session | null> {
  const worktreeSession = await getWorktreeDevSession('xplan');
  if (worktreeSession) {
    return worktreeSession as unknown as Session;
  }
  return getNextAuth().auth() as Promise<Session | null>;
}
