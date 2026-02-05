export { getPortalAuthPrisma } from './db.js';
export { authenticateWithPortalDirectory, getUserAuthz, getUserEntitlements, getUserByEmail, getUserGlobalRoles, provisionPortalUser, removeManualUserAppGrant, syncGroupBasedAppAccess, upsertManualUserAppGrant, } from './user-service.js';
