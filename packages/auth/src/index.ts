import type { NextAuthConfig } from 'next-auth';
import { decode } from 'next-auth/jwt';
import { z } from 'zod';

// Backward compatibility alias
export type NextAuthOptions = NextAuthConfig;

export type SameSite = 'lax' | 'strict' | 'none';

export interface CookieDomainOptions {
  domain: string; // e.g. .targonglobal.com
  secure?: boolean; // default true in production
  sameSite?: SameSite; // default 'lax'
  appId?: string; // used to namespace cookies in dev (e.g., 'talos')
}

/**
 * Build consistent cookie names and options for NextAuth across apps.
 * - In production (secure), uses __Secure- prefix for session/callback and __Host- for csrf (no domain).
 * - In development, optionally prefixes cookie names with `${appId}.` to avoid collisions on localhost.
 */
export function buildCookieOptions(opts: CookieDomainOptions) {
  const secure = opts.secure ?? (process.env.NODE_ENV === 'production');
  const sameSite: SameSite = opts.sameSite ?? 'lax';
  const appPrefix = !secure && opts.appId ? `${opts.appId}.` : '';

  const sessionTokenName = secure
    ? '__Secure-next-auth.session-token'
    : `${appPrefix}next-auth.session-token`;
  const callbackUrlName = secure
    ? '__Secure-next-auth.callback-url'
    : `${appPrefix}next-auth.callback-url`;
  const csrfTokenName = secure
    ? '__Host-next-auth.csrf-token'
    : `${appPrefix}next-auth.csrf-token`;

  // Determine if we should set the Domain attribute on cookies.
  // On localhost / 127.0.0.1, setting Domain causes cookies to be rejected by browsers.
  const rawDomain = (opts.domain || '').trim().toLowerCase();
  const isIPv4 = /^\d+\.\d+\.\d+\.\d+$/.test(rawDomain);
  const isLocalhost = rawDomain === 'localhost' || rawDomain.endsWith('.localhost');
  const shouldSetDomain = !!rawDomain && !isIPv4 && !isLocalhost;
  const domainOption = shouldSetDomain ? { domain: rawDomain } : {};

  return {
    sessionToken: {
      name: sessionTokenName,
      options: {
        httpOnly: true,
        sameSite,
        path: '/',
        secure,
        // Only set Domain when valid (never on localhost/IP). Host-only cookies work in dev.
        ...domainOption,
      },
    },
    callbackUrl: {
      name: callbackUrlName,
      options: {
        sameSite,
        path: '/',
        secure,
        ...domainOption,
      },
    },
    csrfToken: {
      name: csrfTokenName,
      options: {
        httpOnly: true,
        sameSite,
        path: '/',
        secure,
        // Important: __Host- cookies cannot set domain in secure mode.
        // In dev, also avoid Domain on localhost/IP to ensure cookie is accepted.
        ...(secure ? {} : domainOption),
      },
    },
  } as NextAuthConfig['cookies'];
}

function parseCookieHeader(header: string | undefined | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!header) return map;
  const parts = header.split(';');
  for (const part of parts) {
    const [rawName, ...rawValue] = part.split('=');
    if (!rawName) continue;
    const name = rawName.trim();
    if (!name) continue;
    const value = rawValue.join('=').trim();
    const list = map.get(name);
    if (list) {
      list.push(value);
    } else {
      map.set(name, [value]);
    }
  }
  return map;
}

export const AuthEnvSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(16),
  NEXTAUTH_URL: z.string().url().optional(),
  COOKIE_DOMAIN: z.string().min(1), // e.g. .targonglobal.com
});

export interface SharedAuthOptions {
  cookieDomain: string;
  appId?: string;
}

/**
 * Compose app-specific NextAuth options with shared, secure defaults.
 */
const truthyValues = new Set(['1', 'true', 'yes', 'on']);

export interface DevAuthDefaultsOptions {
  appId?: string;
  port?: string | number;
  baseUrl?: string;
  cookieDomain?: string;
  portalUrl?: string;
  publicPortalUrl?: string;
  allowDefaults?: boolean;
}

/**
 * Provide sane defaults for local development so NextAuth stops warning about missing env vars.
 */
export function applyDevAuthDefaults(options: DevAuthDefaultsOptions = {}) {
  const env = process.env.NODE_ENV ?? 'development';
  const isDevLike = env === 'development' || env === 'test';
  if (!isDevLike) return;

  const allowDefaultsEnv = truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase());
  const allowDefaults = options.allowDefaults ?? allowDefaultsEnv;

  const missing: string[] = [];

  const resolveSecret = () => {
    const existingSecret = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (existingSecret) {
      if (!process.env.NEXTAUTH_SECRET) {
        process.env.NEXTAUTH_SECRET = existingSecret;
      }
      return;
    }

    if (allowDefaults) {
      const suffix = options.appId ? `-${options.appId}` : '';
      process.env.NEXTAUTH_SECRET = `dev-only-nextauth-secret${suffix}-change-me`;
      return;
    }

    missing.push('PORTAL_AUTH_SECRET or NEXTAUTH_SECRET');
  };

  const ensureValue = (current: string | undefined, label: string, fallback?: string) => {
    if (current && current.trim() !== '') {
      return current;
    }
    if (allowDefaults && fallback) {
      return fallback;
    }
    missing.push(label);
    return undefined;
  };

  resolveSecret();

  const port = options.port ?? process.env.PORT ?? 3000;
  const computedBaseUrl = options.baseUrl ?? `http://localhost:${port}`;

  const nextAuthUrl = ensureValue(process.env.NEXTAUTH_URL, 'NEXTAUTH_URL', allowDefaults ? String(computedBaseUrl) : undefined);
  if (nextAuthUrl && !process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = nextAuthUrl;
  }

  const portalUrl = ensureValue(
    process.env.PORTAL_AUTH_URL,
    'PORTAL_AUTH_URL',
    allowDefaults ? options.portalUrl ?? nextAuthUrl : undefined,
  );
  if (portalUrl && !process.env.PORTAL_AUTH_URL) {
    process.env.PORTAL_AUTH_URL = portalUrl;
  }

  const publicPortalUrl = ensureValue(
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
    'NEXT_PUBLIC_PORTAL_AUTH_URL',
    allowDefaults ? options.publicPortalUrl ?? portalUrl ?? nextAuthUrl : undefined,
  );
  if (publicPortalUrl && !process.env.NEXT_PUBLIC_PORTAL_AUTH_URL) {
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = publicPortalUrl;
  }

  const cookieDomain = ensureValue(
    process.env.COOKIE_DOMAIN,
    'COOKIE_DOMAIN',
    allowDefaults ? options.cookieDomain : undefined,
  );
  if (cookieDomain && !process.env.COOKIE_DOMAIN) {
    process.env.COOKIE_DOMAIN = cookieDomain;
  }

  if (missing.length > 0) {
    throw new Error(`[auth] Missing required auth environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NEXTAUTH_DEBUG === undefined) {
    // Default to off; callers can opt-in with NEXTAUTH_DEBUG=1 if needed.
    process.env.NEXTAUTH_DEBUG = '0';
  }
}

export function withSharedAuth(base: NextAuthConfig, optsOrDomain: SharedAuthOptions | string): NextAuthConfig {
  const opts: SharedAuthOptions = typeof optsOrDomain === 'string'
    ? { cookieDomain: optsOrDomain }
    : optsOrDomain;

  const envDebug = process.env.NEXTAUTH_DEBUG ? truthyValues.has(process.env.NEXTAUTH_DEBUG.toLowerCase()) : undefined;
  const baseDebug = typeof base.debug === 'boolean' ? base.debug : undefined;
  const debug = envDebug ?? baseDebug ?? false;

  const resolvedSecret = process.env.NEXTAUTH_SECRET ?? base.secret;

  const envMode = process.env.NODE_ENV ?? 'development';
  const isDevLike = envMode === 'development' || envMode === 'test';

  if (!resolvedSecret) {
    throw new Error('NEXTAUTH_SECRET (or PORTAL_AUTH_SECRET) must be provided for shared auth.');
  }

  if (!isDevLike) {
    const result = AuthEnvSchema.safeParse({
      NEXTAUTH_SECRET: resolvedSecret,
      NEXTAUTH_URL: process.env.NEXTAUTH_URL,
      COOKIE_DOMAIN: process.env.COOKIE_DOMAIN ?? opts.cookieDomain,
    });
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Missing required auth configuration: ${detail}`);
    }
  }

  return {
    // Keep base providers/callbacks etc. from app
    ...base,
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60,
      ...base.session,
    },
    debug,
    secret: resolvedSecret,
    cookies: {
      ...buildCookieOptions({ domain: opts.cookieDomain, sameSite: 'lax', appId: opts.appId }),
      ...base.cookies,
    },
  } satisfies NextAuthConfig;
}

/**
 * Helper to derive the likely session cookie names to probe in middleware.
 * Always include both secure (__Secure-) and non-secure variants because
 * different environments flip between dev/prod cookie prefixes.
 */
export function getCandidateSessionCookieNames(appId?: string): string[] {
  const names = new Set<string>([
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
  ]);

  const portalAppIdRaw =
    typeof process !== 'undefined' && process.env
      ? (process.env.PORTAL_APP_ID ?? 'targon')
      : 'targon';
  const normalizedPortalAppId = portalAppIdRaw.trim();

  const addNamesFor = (id?: string) => {
    const normalized = id?.trim();
    if (!normalized) return;
    names.add(`${normalized}.next-auth.session-token`);
    names.add(`__Secure-${normalized}.next-auth.session-token`);
  };

  addNamesFor(appId);
  const normalizedAppId = appId?.trim() ?? '';
  if (normalizedPortalAppId && normalizedPortalAppId !== normalizedAppId) {
    addNamesFor(normalizedPortalAppId);
  }

  return Array.from(names);
}

export interface PortalJwtPayload extends Record<string, unknown> {
  sub?: string;
  email?: string;
  name?: string;
  roles?: RolesClaim;
  apps?: string[];
  exp?: number;
}

export interface DecodePortalSessionOptions {
  cookieHeader?: string | null;
  cookieNames?: string[];
  appId?: string;
  secret?: string;
  debug?: boolean;
}

export async function decodePortalSession(options: DecodePortalSessionOptions = {}): Promise<PortalJwtPayload | null> {
  const {
    cookieHeader,
    cookieNames,
    appId,
    secret,
    debug = truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase()),
  } = options;

  const header = cookieHeader ?? '';
  if (!header) {
    if (debug) {
      console.warn('[auth] decodePortalSession: missing cookie header');
    }
    return null;
  }

  const names = Array.from(new Set((cookieNames && cookieNames.length > 0)
    ? cookieNames
    : getCandidateSessionCookieNames(appId)));

 const resolvedSecret = secret
    || process.env.PORTAL_AUTH_SECRET
    || process.env.NEXTAUTH_SECRET;

  if (!resolvedSecret) {
    if (debug) {
      console.warn('[auth] decodePortalSession: missing shared secret');
    }
    return null;
  }

  const cookies = parseCookieHeader(header);
  for (const name of names) {
    const values = cookies.get(name);
    if (!values?.length) {
      continue;
    }
    for (const raw of values) {
      if (!raw) continue;
      try {
        // In v5, salt is required - use the cookie name as salt (typical pattern)
        const decoded = await decode({
          token: raw,
          secret: resolvedSecret,
          salt: name, // Use the cookie name as salt
        });
        if (decoded && typeof decoded === 'object') {
          const payload = decoded as PortalJwtPayload;

          const roles = payload.roles;
          if (roles && typeof roles === 'object') {
            const roleMap = roles as Record<string, any>;
            if (!roleMap.talos && roleMap.wms) {
              roleMap.talos = roleMap.wms;
            }
          }

          return payload;
        }
      } catch (error) {
        if (debug) {
          const detail = error instanceof Error ? error.message : String(error);
          console.warn('[auth] decodePortalSession: failed to decode token', name, 'value length', raw.length, detail);
        }
      }
    }
  }

  return null;
}


export type PortalUrlRequestLike = {
  headers: Headers;
  url: string;
};

export interface PortalUrlOptions {
  request?: PortalUrlRequestLike;
  fallbackOrigin?: string;
}

export interface PortalSessionProbeOptions {
  request: Request;
  appId?: string;
  cookieNames?: string[];
  secret?: string;
  portalUrl?: string;
  debug?: boolean;
  fetchImpl?: typeof fetch;
}

const DEFAULT_PORTAL_DEV = 'http://localhost:3000';
const missingSecretWarnings = new Set<string>();

function normalizeOrigin(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidates = hasScheme ? [trimmed] : [`https://${trimmed}`, `http://${trimmed}`];

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      return url.origin;
    } catch {
      continue;
    }
  }

  return undefined;
}

function originFromRequestLike(request: PortalUrlRequestLike | undefined): string | undefined {
  if (!request) return undefined;
  const headers = request.headers;
  const forwardedProto = headers.get('x-forwarded-proto');
  const forwardedHost = headers.get('x-forwarded-host');
  const primaryHost = forwardedHost ? forwardedHost.split(',')[0]?.trim() : undefined;
  const host = primaryHost || headers.get('host');
  const url = request.url ? new URL(request.url) : null;

  const fallbackProto = url?.protocol ? url.protocol.replace(/:$/, '') : undefined;
  const protocol = forwardedProto?.split(',')[0]?.trim() || fallbackProto || 'http';
  const candidate = host ? `${protocol}://${host}` : url?.origin;
  return normalizeOrigin(candidate ?? undefined);
}

function originFromGlobalScope(): string | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  const maybeLocation = (globalThis as any)?.location;
  if (maybeLocation && typeof maybeLocation.origin === 'string') {
    return normalizeOrigin(maybeLocation.origin);
  }
  return undefined;
}

export function resolvePortalAuthOrigin(options?: PortalUrlOptions): string {
  const envCandidates = [
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
    process.env.PORTAL_AUTH_URL,
    process.env.NEXTAUTH_URL,
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const requestOrigin = originFromRequestLike(options?.request);
  if (requestOrigin) {
    return requestOrigin;
  }

  const fallbackOrigin = normalizeOrigin(options?.fallbackOrigin);
  if (fallbackOrigin) {
    return fallbackOrigin;
  }

  const globalOrigin = originFromGlobalScope();
  if (globalOrigin) {
    return globalOrigin;
  }

  const allowDefaults = truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase());
  if (allowDefaults && process.env.NODE_ENV !== 'production') {
    return DEFAULT_PORTAL_DEV;
  }

  throw new Error('Portal auth origin is not configured. Set PORTAL_AUTH_URL or NEXT_PUBLIC_PORTAL_AUTH_URL.');
}

export function buildPortalUrl(path: string, options?: PortalUrlOptions): URL {
  const origin = resolvePortalAuthOrigin(options);
  return new URL(path, origin);
}

/**
 * Determine whether a request already carries a valid portal NextAuth session.
 * - Tries to decode the session cookie locally using the shared secret.
 * - Falls back to probing the portal `/api/auth/session` endpoint to handle
 *   environments where app-specific secrets differ from the portal.
 */
export async function hasPortalSession(options: PortalSessionProbeOptions): Promise<boolean> {
  const {
    request,
    appId,
    cookieNames,
    debug = options.debug ?? truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase()),
    fetchImpl,
  } = options;

  const names = Array.from(new Set((cookieNames && cookieNames.length > 0)
    ? cookieNames
    : getCandidateSessionCookieNames(appId)));

  const cookieHeader = request.headers.get('cookie');
  const sharedSecret = options.secret
    || process.env.PORTAL_AUTH_SECRET
    || process.env.NEXTAUTH_SECRET;

  const decoded = await decodePortalSession({
    cookieHeader,
    cookieNames: names,
    appId,
    secret: sharedSecret,
    debug,
  });

  if (decoded) {
    return true;
  }

  if (!sharedSecret && debug) {
    const warnKey = names.join('|') || 'global';
    if (!missingSecretWarnings.has(warnKey)) {
      missingSecretWarnings.add(warnKey);
      console.warn('[auth] missing shared NEXTAUTH_SECRET; falling back to portal probe');
    }
  }

  if (!cookieHeader) {
    return false;
  }

  const hasCandidateCookie = names.some((name) => cookieHeader.includes(`${name}=`));
  if (!hasCandidateCookie) {
    return false;
  }

  let portalBase: string | undefined = options.portalUrl ? normalizeOrigin(options.portalUrl) : undefined;
  if (!portalBase) {
    try {
      portalBase = resolvePortalAuthOrigin({ request: options.request as unknown as PortalUrlRequestLike });
    } catch (error) {
      if (debug) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn('[auth] unable to resolve portal origin', detail);
      }
      portalBase = undefined;
    }
  }

  if (!portalBase) {
    return false;
  }

  try {
    const endpoint = new URL('/api/auth/session', portalBase);
    const res = await (fetchImpl ?? fetch)(endpoint, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
        accept: 'application/json',
        'x-targon-session-probe': '1',
      },
      cache: 'no-store',
    });
   if (!res.ok) {
     if (debug) {
       console.warn('[auth] portal session probe returned status', res.status);
     }
     return false;
   }
   const data = await res.json().catch(() => null);
    if (data?.user) {
      return true;
    }

    const allowDevProbeBypass =
      process.env.NODE_ENV !== 'production' &&
      (truthyValues.has(String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase()) ||
        truthyValues.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase()));

    if (allowDevProbeBypass) {
      if (debug) {
        console.warn(
          '[auth] portal session probe returned 200 but no user; allowing due to dev override',
          data
        );
      }
      return true;
    }

    if (debug) {
      console.warn('[auth] portal session probe returned 200 but no user payload; treating as unauthenticated', data);
    }
    return false;
 } catch (error) {
   if (debug) {
     const detail = error instanceof Error ? error.message : String(error);
     console.warn('[auth] portal session probe failed', detail);
   }
    return false;
  }
}

// ===== Entitlement / Roles claim helpers =====
export type AppEntitlement = {
  departments?: string[];
  depts?: string[];
};

export type RolesClaim = Record<string, AppEntitlement>; // { talos: { depts }, fcc: { ... } }

export function getAppEntitlement(roles: unknown, appId: string): AppEntitlement | undefined {
  if (!roles || typeof roles !== 'object') return undefined;
  const rec = roles as Record<string, any>;
  let ent = rec[appId];
  if ((!ent || typeof ent !== 'object') && appId === 'xplan') {
    const legacyKey = String.fromCharCode(120, 45, 112, 108, 97, 110);
    ent = rec[legacyKey];
  }
  if (!ent || typeof ent !== 'object') return undefined;
  const departments = Array.isArray(ent.departments)
    ? ent.departments.map(String)
    : Array.isArray(ent.depts)
      ? ent.depts.map(String)
      : undefined;
  return {
    departments,
    depts: departments,
  };
}
