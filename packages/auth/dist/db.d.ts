declare const PrismaClient: typeof import('../node_modules/.prisma/client-auth/index.js').PrismaClient;
type PortalAuthPrismaClient = InstanceType<typeof PrismaClient>;
export declare function getPortalAuthPrisma(): PortalAuthPrismaClient;
declare global {
    var __portalAuthPrisma: PortalAuthPrismaClient | null | undefined;
}
export {};
