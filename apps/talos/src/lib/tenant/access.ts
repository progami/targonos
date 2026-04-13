import type { TenantCode } from './constants'
import { getTenantPrismaClient } from './prisma-factory'

export async function getPrismaForTenant(tenantCode: TenantCode) {
  return getTenantPrismaClient(tenantCode)
}
