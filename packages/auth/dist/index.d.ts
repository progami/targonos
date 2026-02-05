import type { NextAuthConfig } from 'next-auth';
import { z } from 'zod';
export type NextAuthOptions = NextAuthConfig;
export type SameSite = 'lax' | 'strict' | 'none';
export interface CookieDomainOptions {
    domain: string;
    secure?: boolean;
    sameSite?: SameSite;
    appId?: string;
}
/**
 * Build consistent cookie names and options for NextAuth across apps.
 * - In production (secure), uses __Secure- prefix for session/callback and __Host- for csrf (no domain).
 * - In development, optionally prefixes cookie names with `${appId}.` to avoid collisions on localhost.
 */
export declare function buildCookieOptions(opts: CookieDomainOptions): NextAuthConfig["cookies"];
export declare const AuthEnvSchema: z.ZodObject<{
    NEXTAUTH_SECRET: z.ZodString;
    NEXTAUTH_URL: z.ZodOptional<z.ZodString>;
    COOKIE_DOMAIN: z.ZodString;
}, "strip", z.ZodTypeAny, {
    NEXTAUTH_SECRET: string;
    COOKIE_DOMAIN: string;
    NEXTAUTH_URL?: string | undefined;
}, {
    NEXTAUTH_SECRET: string;
    COOKIE_DOMAIN: string;
    NEXTAUTH_URL?: string | undefined;
}>;
export interface SharedAuthOptions {
    cookieDomain: string;
    appId?: string;
}
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
export declare function applyDevAuthDefaults(options?: DevAuthDefaultsOptions): void;
export declare function withSharedAuth(base: NextAuthConfig, optsOrDomain: SharedAuthOptions | string): NextAuthConfig;
/**
 * Helper to derive the likely session cookie names to probe in middleware.
 * Always include both secure (__Secure-) and non-secure variants because
 * different environments flip between dev/prod cookie prefixes.
 */
export declare function getCandidateSessionCookieNames(appId?: string): string[];
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
export declare function decodePortalSession(options?: DecodePortalSessionOptions): Promise<PortalJwtPayload | null>;
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
export declare function resolvePortalAuthOrigin(options?: PortalUrlOptions): string;
export declare function buildPortalUrl(path: string, options?: PortalUrlOptions): URL;
/**
 * Determine whether a request already carries a valid portal NextAuth session.
 * - Tries to decode the session cookie locally using the shared secret.
 * - Falls back to probing the portal `/api/auth/session` endpoint to handle
 *   environments where app-specific secrets differ from the portal.
 */
export declare function hasPortalSession(options: PortalSessionProbeOptions): Promise<boolean>;
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
export type RolesClaim = Record<string, AppEntitlement>;
export type AppLifecycle = 'active' | 'dev' | 'archive';
export type AppEntryPolicy = 'role_gated' | 'public';
export type AuthDecision = {
    allowed: boolean;
    status: 'ok' | 'unauthenticated' | 'forbidden';
    reason: 'ok' | 'unauthenticated' | 'missing_authz' | 'app_archived' | 'dev_app_restricted' | 'no_app_role';
    authz: PortalAuthz | null;
};
export declare function normalizePortalAuthz(value: unknown): PortalAuthz | null;
export declare function getCurrentAuthz(request: Request, options?: {
    appId?: string;
    cookieNames?: string[];
    secret?: string;
    debug?: boolean;
    fetchImpl?: typeof fetch;
}): Promise<PortalAuthz>;
export declare function requireAppEntry(options: {
    request: Request;
    appId: string;
    lifecycle: AppLifecycle;
    entryPolicy?: AppEntryPolicy;
    cookieNames?: string[];
    secret?: string;
    debug?: boolean;
}): Promise<AuthDecision>;
export declare function hasCapability(options: {
    session: unknown;
    appId: string;
    capability: string;
}): boolean;
export declare function getAppEntitlement(rolesOrAuthz: unknown, appId: string): AppEntitlement | undefined;
