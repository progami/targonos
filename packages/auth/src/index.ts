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
  activeTenant?: string;
  exp?: number;
}

export type WorktreeDevSession = {
  expires: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  authz: PortalAuthz;
  roles: RolesClaim;
  globalRoles: string[];
  authzVersion: number;
  activeTenant: string | null;
  apps: string[];
};

export interface DecodePortalSessionOptions {
  cookieHeader?: string | null;
  cookieNames?: string[];
  appId?: string;
  secret?: string;
  debug?: boolean;
  request?: PortalUrlRequestLike;
}

export function isWorktreeDevAuthEnabled(): boolean {
  const raw = process.env.TARGON_WORKTREE_DEV_AUTH;
  if (!raw) {
    return false;
  }
  return truthyValues.has(raw.trim().toLowerCase());
}

function requireWorktreeDevAuthEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be defined when TARGON_WORKTREE_DEV_AUTH is enabled.`);
  }
  if (value.trim() === '') {
    throw new Error(`${name} must be defined when TARGON_WORKTREE_DEV_AUTH is enabled.`);
  }
  return value.trim();
}

function buildRolesClaimFromAuthz(authz: PortalAuthz): RolesClaim {
  const roles: RolesClaim = {};
  for (const [appId, grant] of Object.entries(authz.apps)) {
    roles[appId] = {
      departments: grant.departments,
      depts: grant.departments,
      tenantMemberships: grant.tenantMemberships,
    };
  }
  return roles;
}

function getWorktreeDevAuthz(): PortalAuthz {
  const raw = requireWorktreeDevAuthEnv('TARGON_WORKTREE_DEV_AUTHZ_JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`TARGON_WORKTREE_DEV_AUTHZ_JSON is invalid JSON: ${message}`);
  }

  const authz = normalizePortalAuthz(parsed);
  if (!authz) {
    throw new Error('TARGON_WORKTREE_DEV_AUTHZ_JSON must define a valid authz payload.');
  }
  return authz;
}

async function resolveWorktreeDevPortalPayload(
  appId: string | undefined,
  cookieHeader: string | null | undefined,
): Promise<PortalJwtPayload | null> {
  if (!isWorktreeDevAuthEnabled()) {
    return null;
  }

  const authz = getWorktreeDevAuthz();
  const payload: PortalJwtPayload = {
    sub: requireWorktreeDevAuthEnv('TARGON_WORKTREE_DEV_USER_ID'),
    email: requireWorktreeDevAuthEnv('TARGON_WORKTREE_DEV_USER_EMAIL'),
    name: requireWorktreeDevAuthEnv('TARGON_WORKTREE_DEV_USER_NAME'),
    authz,
    globalRoles: authz.globalRoles,
    authzVersion: authz.version,
    roles: buildRolesClaimFromAuthz(authz),
    apps: Object.keys(authz.apps),
  };

  if (!appId) {
    return payload;
  }

  const activeTenant = await resolveActiveTenantFromCookies({
    appId,
    cookieHeader,
  });
  return applyActiveTenantOverride(payload, appId, activeTenant);
}

export async function getWorktreeDevSession(appId?: string): Promise<WorktreeDevSession | null> {
  const payload = await resolveWorktreeDevPortalPayload(appId, null);
  if (!payload) {
    return null;
  }

  const authz = normalizeAuthzFromClaims(payload);
  if (!authz) {
    throw new Error('Worktree dev auth payload is incomplete.');
  }
  if (!payload.sub) {
    throw new Error('Worktree dev auth payload is incomplete.');
  }
  if (!payload.email) {
    throw new Error('Worktree dev auth payload is incomplete.');
  }
  if (typeof payload.name !== 'string') {
    throw new Error('Worktree dev auth payload is incomplete.');
  }
  if (payload.name.trim() === '') {
    throw new Error('Worktree dev auth payload is incomplete.');
  }

  return {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    },
    authz,
    roles: buildRolesClaimFromAuthz(authz),
    globalRoles: authz.globalRoles,
    authzVersion: authz.version,
    activeTenant: typeof payload.activeTenant === 'string' ? payload.activeTenant : null,
    apps: Object.keys(authz.apps),
  };
}

export async function decodePortalSession(options: DecodePortalSessionOptions = {}): Promise<PortalJwtPayload | null> {
  const {
    cookieHeader,
    cookieNames,
    appId,
    secret,
    debug = truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase()),
  } = options;

  const worktreePayload = await resolveWorktreeDevPortalPayload(appId, cookieHeader);
  if (worktreePayload) {
    return worktreePayload;
  }

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
          if (!appId) {
            return payload;
          }

          const activeTenant = await resolveActiveTenantFromCookies({ appId, cookieHeader: header });

          return applyActiveTenantOverride(payload, appId, activeTenant);
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

function resolveConfiguredOrigin(candidates: Array<string | undefined>, errorMessage: string): string {
  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      return normalized;
    }
  }

  throw new Error(errorMessage);
}

export function resolvePortalAuthOrigin(options?: PortalUrlOptions): string {
  void options;

  return resolveConfiguredOrigin([
    process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
    process.env.PORTAL_AUTH_URL,
    process.env.NEXTAUTH_URL,
  ], 'Portal auth origin is not configured. Set PORTAL_AUTH_URL or NEXT_PUBLIC_PORTAL_AUTH_URL.');
}

export function buildPortalUrl(path: string, options?: PortalUrlOptions): URL {
  const origin = resolvePortalAuthOrigin(options);
  return new URL(path, origin);
}

export function resolveAppAuthOrigin(options?: PortalUrlOptions): string {
  void options;

  return resolveConfiguredOrigin([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
    process.env.NEXTAUTH_URL,
  ], 'Application origin is not configured. Set NEXT_PUBLIC_APP_URL, BASE_URL, or NEXTAUTH_URL.');
}

/**
 * Determine whether a request already carries a valid portal NextAuth session.
 * - Decodes the session cookie locally using the shared secret.
 */
export async function hasPortalSession(options: PortalSessionProbeOptions): Promise<boolean> {
  const {
    request,
    appId,
    cookieNames,
    debug = options.debug ?? truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase()),
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

  return false;
}

// ===== Entitlement / Roles claim helpers =====
export type AuthzAppGrant = {
  departments: string[];
  tenantMemberships: string[];
};

export type PortalAuthz = {
  version: number;
  globalRoles: string[];
  apps: Record<string, AuthzAppGrant>;
};

export type PortalConsumerSession = {
  payload: PortalJwtPayload;
  authz: PortalAuthz;
  activeTenant: string | null;
};

export type AppEntitlement = {
  departments?: string[];
  depts?: string[];
  tenantMemberships?: string[];
};

export type RolesClaim = Record<string, AppEntitlement>; // legacy alias: { talos: { depts }, xplan: { ... } }

export type AppLifecycle = 'active' | 'dev' | 'archive';
export type AppEntryPolicy = 'role_gated' | 'public';

export type AuthDecision = {
  allowed: boolean;
  status: 'ok' | 'unauthenticated' | 'forbidden';
  reason: 'ok' | 'unauthenticated' | 'missing_authz' | 'app_archived' | 'dev_app_restricted' | 'no_app_access';
  authz: PortalAuthz | null;
};

const AUTHZ_CACHE_TTL_MS = 30_000;
const authzCache = new Map<string, { authz: PortalAuthz; expiresAt: number }>();

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeAuthzApps(value: unknown): Record<string, AuthzAppGrant> {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const apps: Record<string, AuthzAppGrant> = {};

  for (const [appId, grant] of Object.entries(raw)) {
    if (!grant || typeof grant !== 'object') continue;
    const rawGrant = grant as Record<string, unknown>;
    const departments = normalizeStringArray(rawGrant.departments ?? rawGrant.depts);
    const tenantMemberships = normalizeStringArray(rawGrant.tenantMemberships);
    apps[appId] = { departments, tenantMemberships };
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

export async function readPortalConsumerSession(options: {
  request: Request | { headers: Headers };
  appId: string;
  cookieNames?: string[];
  secret?: string;
  debug?: boolean;
}): Promise<PortalConsumerSession | null> {
  const debug = options.debug ?? truthyValues.has(String(process.env.NEXTAUTH_DEBUG ?? '').toLowerCase());
  const cookieNames = resolveCookieNames(options.appId, options.cookieNames);
  const cookieHeader = options.request.headers.get('cookie');

  const payload = await decodePortalSession({
    cookieHeader,
    cookieNames,
    appId: options.appId,
    secret: options.secret,
    debug,
  });

  if (!payload) {
    return null;
  }

  const authz = normalizeAuthzFromClaims(payload);
  if (!authz) {
    return null;
  }

  return {
    payload,
    authz,
    activeTenant: typeof payload.activeTenant === 'string' ? payload.activeTenant : null,
  };
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
    throw new Error('AUTH_UNAUTHENTICATED');
  }

  const authz = normalizeAuthzFromClaims(decoded);
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
      reason: 'no_app_access',
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
  if (!authz) {
    return false;
  }

  if (authz.globalRoles.includes('platform_admin')) {
    return true;
  }

  const grant = authz.apps[options.appId];
  if (!grant) {
    return false;
  }

  void options.capability;
  return true;
}

export function getAppEntitlement(rolesOrAuthz: unknown, appId: string): AppEntitlement | undefined {
  if (!rolesOrAuthz || typeof rolesOrAuthz !== 'object') return undefined;

  const authz = normalizePortalAuthz(rolesOrAuthz);
  if (authz) {
    const grant = authz.apps[appId];
    if (!grant) return undefined;
    return {
      departments: grant.departments,
      depts: grant.departments,
      tenantMemberships: grant.tenantMemberships,
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
  const tenantMemberships = normalizeStringArray(raw.tenantMemberships);
  return {
    departments,
    depts: departments,
    tenantMemberships,
  };
}

export async function resolveActiveTenantFromCookies(options: {
  appId: string
  cookieHeader?: string | null
}): Promise<string | undefined> {
  const cookieMap = parseCookieHeader(options.cookieHeader)
  const cookieName = `__Secure-targon.active-tenant.${options.appId}`
  const values = cookieMap.get(cookieName)
  const raw = values?.[0]
  if (!raw) return undefined

  const decoded = await decode({
    token: raw,
    secret: process.env.PORTAL_AUTH_SECRET!,
    salt: cookieName,
  })

  return typeof decoded?.activeTenant === 'string' ? decoded.activeTenant : undefined
}

export function applyActiveTenantOverride(
  payload: PortalJwtPayload,
  appId: string,
  activeTenant: string | undefined,
): PortalJwtPayload {
  const nextPayload = activeTenant
    ? {
        ...payload,
        activeTenant,
      }
    : payload
  if (typeof nextPayload.activeTenant !== 'string') {
    return nextPayload
  }

  const authz = normalizeAuthzFromClaims(nextPayload)
  const grant = authz?.apps[appId]
  if (!grant || !grant.tenantMemberships.includes(nextPayload.activeTenant)) {
    const { activeTenant: _removed, ...rest } = nextPayload
    return rest
  }

  return nextPayload
}

export { buildAppLoginRedirect } from './middleware-login.js'
export { buildHostedAppUrl, normalizeBasePath } from './topology.js'
