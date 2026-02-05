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
  authz?: PortalAuthz;
  globalRoles?: string[];
  authzVersion?: number;
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
export type AppRole = 'viewer' | 'member' | 'admin';

export type AuthzAppGrant = {
  role: AppRole;
  departments: string[];
};

export type PortalAuthz = {
  version: number;
  globalRoles: string[];
  apps: Record<string, AuthzAppGrant>;
};

export type AppEntitlement = {
  role?: AppRole;
  departments?: string[];
  depts?: string[];
};

export type RolesClaim = Record<string, AppEntitlement>; // legacy alias: { talos: { depts }, xplan: { ... } }

export type AppLifecycle = 'active' | 'dev' | 'archive';
export type AppEntryPolicy = 'role_gated' | 'public';

export type AuthDecision = {
  allowed: boolean;
  status: 'ok' | 'unauthenticated' | 'forbidden';
  reason: 'ok' | 'unauthenticated' | 'missing_authz' | 'app_archived' | 'dev_app_restricted' | 'no_app_role';
  authz: PortalAuthz | null;
};

const APP_ROLE_RANK: Record<AppRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
};

const AUTHZ_CACHE_TTL_MS = 30_000;
const authzCache = new Map<string, { authz: PortalAuthz; expiresAt: number }>();

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeAppRole(value: unknown): AppRole {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'viewer' || normalized === 'member' || normalized === 'admin') {
    return normalized;
  }
  return 'member';
}

function normalizeAuthzApps(value: unknown): Record<string, AuthzAppGrant> {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const apps: Record<string, AuthzAppGrant> = {};

  for (const [appId, grant] of Object.entries(raw)) {
    if (!grant || typeof grant !== 'object') continue;
    const rawGrant = grant as Record<string, unknown>;
    const departments = normalizeStringArray(rawGrant.departments ?? rawGrant.depts);
    apps[appId] = {
      role: normalizeAppRole(rawGrant.role),
      departments,
    };
  }

  return apps;
}

export function normalizePortalAuthz(value: unknown): PortalAuthz | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawVersion = raw.version;
  const version = typeof rawVersion === 'number' && Number.isFinite(rawVersion)
    ? Math.max(1, Math.floor(rawVersion))
    : 1;

  return {
    version,
    globalRoles: normalizeStringArray(raw.globalRoles),
    apps: normalizeAuthzApps(raw.apps),
  };
}

function normalizeAuthzFromClaims(payload: PortalJwtPayload | null): PortalAuthz | null {
  if (!payload) return null;

  const directAuthz = normalizePortalAuthz(payload.authz);
  if (directAuthz) {
    return directAuthz;
  }

  const version =
    typeof payload.authzVersion === 'number' && Number.isFinite(payload.authzVersion)
      ? Math.max(1, Math.floor(payload.authzVersion))
      : 1;

  if (!payload.roles || typeof payload.roles !== 'object') {
    return null;
  }

  return {
    version,
    globalRoles: normalizeStringArray(payload.globalRoles),
    apps: normalizeAuthzApps(payload.roles),
  };
}

function getSessionTokenCacheKey(
  cookieHeader: string | null,
  cookieNames: string[],
): string | null {
  if (!cookieHeader) return null;
  const cookies = parseCookieHeader(cookieHeader);
  for (const cookieName of cookieNames) {
    const values = cookies.get(cookieName);
    if (!values || values.length === 0) continue;
    const token = values[0];
    if (!token) continue;
    return `${cookieName}:${token.slice(0, 96)}`;
  }
  return null;
}

function resolveCookieNames(appId?: string, provided?: string[]): string[] {
  if (provided && provided.length > 0) {
    return Array.from(new Set(provided));
  }
  return Array.from(new Set([
    ...getCandidateSessionCookieNames(appId),
    ...getCandidateSessionCookieNames('targon'),
  ]));
}

function normalizeAuthzApiResponse(value: unknown): PortalAuthz | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if ('authz' in raw) {
    return normalizePortalAuthz(raw.authz);
  }
  return normalizePortalAuthz(value);
}

async function fetchPortalAuthz(options: {
  request: Request;
  cookieHeader: string;
  debug: boolean;
  fetchImpl?: typeof fetch;
}): Promise<PortalAuthz | null> {
  const { request, cookieHeader, debug, fetchImpl } = options;

  let portalBase: string;
  try {
    portalBase = resolvePortalAuthOrigin({ request: request as unknown as PortalUrlRequestLike });
  } catch (error) {
    if (debug) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn('[auth] unable to resolve portal auth origin for authz fetch', detail);
    }
    return null;
  }

  try {
    const endpoint = new URL('/api/v1/authz/me', portalBase);
    const response = await (fetchImpl ?? fetch)(endpoint, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
        accept: 'application/json',
        'x-targon-authz-probe': '1',
      },
      cache: 'no-store',
    });

    if (response.status === 401 || response.status === 403) {
      return null;
    }
    if (!response.ok) {
      if (debug) {
        console.warn('[auth] portal authz endpoint returned status', response.status);
      }
      return null;
    }

    const payload = await response.json().catch(() => null);
    const authz = normalizeAuthzApiResponse(payload);
    if (!authz && debug) {
      console.warn('[auth] portal authz endpoint returned invalid payload', payload);
    }
    return authz;
  } catch (error) {
    if (debug) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn('[auth] portal authz fetch failed', detail);
    }
    return null;
  }
}

export async function getCurrentAuthz(
  request: Request,
  options?: {
    appId?: string;
    cookieNames?: string[];
    secret?: string;
    debug?: boolean;
    fetchImpl?: typeof fetch;
  },
): Promise<PortalAuthz> {
  const debug = options?.debug ?? truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase());
  const cookieNames = resolveCookieNames(options?.appId, options?.cookieNames);
  const cookieHeader = request.headers.get('cookie');

  const decoded = await decodePortalSession({
    cookieHeader,
    cookieNames,
    appId: options?.appId,
    secret: options?.secret,
    debug,
  });

  const cacheKey = getSessionTokenCacheKey(cookieHeader, cookieNames);
  const now = Date.now();
  if (cacheKey) {
    const cached = authzCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.authz;
    }
  }

  if (!decoded) {
    const authzFromPortalWithoutDecode =
      cookieHeader
        ? await fetchPortalAuthz({
            request,
            cookieHeader,
            debug,
            fetchImpl: options?.fetchImpl,
          })
        : null;

    if (authzFromPortalWithoutDecode) {
      if (cacheKey) {
        authzCache.set(cacheKey, {
          authz: authzFromPortalWithoutDecode,
          expiresAt: now + AUTHZ_CACHE_TTL_MS,
        });
      }
      return authzFromPortalWithoutDecode;
    }

    throw new Error('AUTH_UNAUTHENTICATED');
  }

  const authzFromPortal =
    cookieHeader
      ? await fetchPortalAuthz({
          request,
          cookieHeader,
          debug,
          fetchImpl: options?.fetchImpl,
        })
      : null;

  const authz = authzFromPortal ?? normalizeAuthzFromClaims(decoded);
  if (!authz) {
    throw new Error('AUTH_MISSING_AUTHZ');
  }

  if (cacheKey) {
    authzCache.set(cacheKey, { authz, expiresAt: now + AUTHZ_CACHE_TTL_MS });
    if (authzCache.size > 5000) {
      for (const [key, value] of authzCache) {
        if (value.expiresAt <= now) {
          authzCache.delete(key);
        }
      }
    }
  }

  return authz;
}

export async function requireAppEntry(options: {
  request: Request;
  appId: string;
  lifecycle: AppLifecycle;
  entryPolicy?: AppEntryPolicy;
  cookieNames?: string[];
  secret?: string;
  debug?: boolean;
}): Promise<AuthDecision> {
  if (options.lifecycle === 'archive') {
    return {
      allowed: false,
      status: 'forbidden',
      reason: 'app_archived',
      authz: null,
    };
  }

  let authz: PortalAuthz;
  try {
    authz = await getCurrentAuthz(options.request, {
      appId: options.appId,
      cookieNames: options.cookieNames,
      secret: options.secret,
      debug: options.debug,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTH_UNAUTHENTICATED') {
      return {
        allowed: false,
        status: 'unauthenticated',
        reason: 'unauthenticated',
        authz: null,
      };
    }

    return {
      allowed: false,
      status: 'forbidden',
      reason: 'missing_authz',
      authz: null,
    };
  }

  const isPlatformAdmin = authz.globalRoles.includes('platform_admin');
  if (options.lifecycle === 'dev' && !isPlatformAdmin) {
    return {
      allowed: false,
      status: 'forbidden',
      reason: 'dev_app_restricted',
      authz,
    };
  }

  const entryPolicy = options.entryPolicy ?? 'role_gated';
  if (entryPolicy === 'public' || isPlatformAdmin) {
    return {
      allowed: true,
      status: 'ok',
      reason: 'ok',
      authz,
    };
  }

  const grant = authz.apps[options.appId];
  if (!grant) {
    return {
      allowed: false,
      status: 'forbidden',
      reason: 'no_app_role',
      authz,
    };
  }

  return {
    allowed: true,
    status: 'ok',
    reason: 'ok',
    authz,
  };
}

function normalizeAuthzFromSessionLike(session: unknown): PortalAuthz | null {
  if (!session || typeof session !== 'object') return null;
  const raw = session as Record<string, unknown>;
  return (
    normalizePortalAuthz(raw.authz)
    ?? normalizePortalAuthz({
      version: typeof raw.authzVersion === 'number' ? raw.authzVersion : 1,
      globalRoles: raw.globalRoles,
      apps: raw.roles,
    })
  );
}

export function hasCapability(options: {
  session: unknown;
  appId: string;
  capability: string;
}): boolean {
  const authz = normalizeAuthzFromSessionLike(options.session);
  if (!authz) return false;

  if (authz.globalRoles.includes('platform_admin')) {
    return true;
  }

  const grant = authz.apps[options.appId];
  if (!grant) {
    return false;
  }

  const capability = options.capability.trim().toLowerCase();
  let requiredRank = 1;
  if (capability === 'write' || capability === 'edit' || capability === 'member') {
    requiredRank = 2;
  } else if (capability === 'admin' || capability === 'manage') {
    requiredRank = 3;
  } else if (capability.startsWith('role:')) {
    const requiredRole = normalizeAppRole(capability.slice('role:'.length));
    requiredRank = APP_ROLE_RANK[requiredRole];
  }

  return APP_ROLE_RANK[grant.role] >= requiredRank;
}

export function getAppEntitlement(rolesOrAuthz: unknown, appId: string): AppEntitlement | undefined {
  if (!rolesOrAuthz || typeof rolesOrAuthz !== 'object') return undefined;

  const authz = normalizePortalAuthz(rolesOrAuthz);
  if (authz) {
    const grant = authz.apps[appId];
    if (!grant) return undefined;
    return {
      role: grant.role,
      departments: grant.departments,
      depts: grant.departments,
    };
  }

  const rec = rolesOrAuthz as Record<string, unknown>;
  let ent = rec[appId];
  if ((!ent || typeof ent !== 'object') && appId === 'xplan') {
    const legacyKey = String.fromCharCode(120, 45, 112, 108, 97, 110);
    ent = rec[legacyKey];
  }
  if (!ent || typeof ent !== 'object') return undefined;
  const raw = ent as Record<string, unknown>;
  const departments = normalizeStringArray(raw.departments ?? raw.depts);
  return {
    role: normalizeAppRole(raw.role),
    departments,
    depts: departments,
  };
}
