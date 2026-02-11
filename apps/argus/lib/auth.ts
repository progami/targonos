import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import type { NextRequest } from 'next/server';
import { applyDevAuthDefaults, withSharedAuth } from '@targon/auth';

applyDevAuthDefaults({
  appId: 'argus',
});

type NextAuthResult = ReturnType<typeof NextAuth>;

function sanitizeBaseUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    if (/\/api\/auth\/?$/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\/?api\/auth\/?$/, '') || '/';
    }
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    return undefined;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be defined for Argus auth configuration.`);
  }
  return value;
}

function resolveAuthOptions(): NextAuthConfig {
  requireEnv('NEXT_PUBLIC_APP_URL');
  requireEnv('PORTAL_AUTH_URL');
  requireEnv('NEXT_PUBLIC_PORTAL_AUTH_URL');

  const normalizedNextAuthUrl = sanitizeBaseUrl(process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL);
  if (normalizedNextAuthUrl) {
    process.env.NEXTAUTH_URL = normalizedNextAuthUrl;
  }

  const sharedSecret = process.env.PORTAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!sharedSecret) {
    throw new Error('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET must be defined for Argus auth configuration.');
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
        (session as { authz?: unknown }).authz = (token as { authz?: unknown }).authz;
        (session as { roles?: unknown }).roles = (token as { roles?: unknown }).roles;
        (session as { globalRoles?: unknown }).globalRoles = (token as { globalRoles?: unknown }).globalRoles;
        (session as { authzVersion?: unknown }).authzVersion =
          (token as { authzVersion?: unknown }).authzVersion;
        session.user.id = (token.sub as string) || session.user.id;
        return session;
      },
    },
  };

  return withSharedAuth(baseAuthOptions, {
    cookieDomain: process.env.COOKIE_DOMAIN || '.targonglobal.com',
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

export async function auth() {
  return getNextAuth().auth();
}
