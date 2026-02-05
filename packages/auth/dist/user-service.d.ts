type AppEntitlementMap = Record<string, {
    departments: string[];
}>;
export type AuthenticatedUser = {
    id: string;
    email: string;
    username: string | null;
    fullName: string | null;
    entitlements: Record<string, {
        departments: string[];
    }>;
};
type ProvisionedAppAccess = {
    slug: string;
    name: string;
    departments: string[];
};
export declare function provisionPortalUser(options: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    apps: ProvisionedAppAccess[];
}): Promise<AuthenticatedUser>;
export declare function authenticateWithPortalDirectory(input: unknown): Promise<AuthenticatedUser | null>;
export declare function getUserEntitlements(userId: string): Promise<AppEntitlementMap>;
export declare function getUserByEmail(email: string): Promise<AuthenticatedUser | null>;
export {};
