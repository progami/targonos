import { TENANT_CODES, type TenantCode } from './constants'
import { getTenantPrismaClient } from './prisma-factory'

export async function getAccessibleTenantCodesForEmail(email: string): Promise<TenantCode[]> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) {
    return []
  }

  const accessibleTenants: TenantCode[] = []

  for (const tenantCode of TENANT_CODES) {
    try {
      const prisma = await getTenantPrismaClient(tenantCode)
      const user = await prisma.user.findFirst({
        where: { email: normalizedEmail, isActive: true },
        select: { id: true },
      })

      if (user) {
        accessibleTenants.push(tenantCode)
      }
    } catch (error) {
      console.warn(`[tenant/access] Could not check tenant ${tenantCode}:`, error)
    }
  }

  return accessibleTenants
}

export async function getPrismaForTenant(tenantCode: TenantCode) {
  return getTenantPrismaClient(tenantCode)
}
