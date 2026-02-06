import type { AppRole, AuthzAppGrant, PortalAuthz } from './index.js';
type AppEntitlementMap = Record<string, AuthzAppGrant>;
export type AuthenticatedUser = {
    id: string;
    email: string;
    username: string | null;
    fullName: string | null;
    authzVersion: number;
    globalRoles: string[];
    entitlements: AppEntitlementMap;
};
type ProvisionedAppAccess = {
    slug: string;
    name: string;
    departments: string[];
    role?: AppRole;
    source?: 'manual' | 'group' | 'bootstrap';
    locked?: boolean;
};
export type ManualAppGrantInput = {
    userId: string;
    appSlug: string;
    appName?: string;
    role: AppRole;
    departments?: string[];
    locked?: boolean;
};
export type GroupSyncResult = {
    updatedUsers: number;
    upsertedGrants: number;
    deletedGrants: number;
    skippedLocked: number;
};
export declare function provisionPortalUser(options: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    apps: ProvisionedAppAccess[];
}): Promise<AuthenticatedUser>;
export declare function upsertManualUserAppGrant(input: ManualAppGrantInput): Promise<AuthenticatedUser>;
export declare function removeManualUserAppGrant(userId: string, appSlug: string): Promise<AuthenticatedUser>;
export declare function syncGroupBasedAppAccess(): Promise<GroupSyncResult>;
export declare function authenticateWithPortalDirectory(input: unknown): Promise<AuthenticatedUser | null>;
export declare function getUserEntitlements(userId: string): Promise<AppEntitlementMap>;
export declare function getUserGlobalRoles(userId: string): Promise<string[]>;
export declare function getUserAuthz(userId: string): Promise<PortalAuthz>;
export declare function getUserByEmail(email: string): Promise<AuthenticatedUser | null>;
export declare function getOrCreatePortalUserByEmail(options: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
}): Promise<AuthenticatedUser | null>;
export {};
