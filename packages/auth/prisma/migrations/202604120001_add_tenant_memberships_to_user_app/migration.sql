ALTER TABLE "UserApp" ADD COLUMN "tenantMemberships" JSONB;
ALTER TABLE "GroupAppMapping" ADD COLUMN "tenantMemberships" JSONB;
