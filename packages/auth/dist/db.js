import { createRequire } from 'node:module';
// Use the Prisma client generated for the portal auth schema.
// Load it at runtime so Next does not try to statically resolve the generated path.
const require = createRequire(import.meta.url);
const PrismaClient = require('../node_modules/.prisma/client-auth/index.js').PrismaClient;
let prismaInstance = globalThis.__portalAuthPrisma ?? null;
function resolvePortalDbUrl() {
    const databaseUrl = process.env.PORTAL_DB_URL;
    if (!databaseUrl) {
        throw new Error('PORTAL_DB_URL is not configured');
    }
    const url = new URL(databaseUrl);
    url.searchParams.set('application_name', 'auth');
    return url.toString();
}
export function getPortalAuthPrisma() {
    if (!prismaInstance) {
        prismaInstance = new PrismaClient({
            datasources: {
                db: { url: resolvePortalDbUrl() },
            },
            transactionOptions: { timeout: 30000, maxWait: 30000 },
        });
        if (process.env.NODE_ENV !== 'production') {
            ;
            globalThis.__portalAuthPrisma = prismaInstance;
        }
    }
    return prismaInstance;
}
