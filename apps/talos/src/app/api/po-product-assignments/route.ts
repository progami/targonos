import { NextRequest } from 'next/server'
import { ApiResponses, withAuth, z } from '@/lib/api'
import { isSuperAdmin } from '@/lib/services/permission-service'
import {
  assignSkuToEmail,
  listAssignmentsByEmail,
  unassignSkuFromEmail,
} from '@/lib/services/po-product-assignment-service'
import { getTenantPrisma } from '@/lib/tenant/server'

const AssignmentSchema = z.object({
  email: z.string().trim().email(),
  skuCode: z.string().trim().min(1),
})

export const GET = withAuth(async (request: NextRequest, session) => {
  if (!isSuperAdmin(session.user.email || '')) {
    return ApiResponses.forbidden('Only super admins can manage PO product assignments')
  }

  const email = request.nextUrl.searchParams.get('email')?.trim()
  if (!email) {
    return ApiResponses.badRequest('email query param is required')
  }

  const assignments = await listAssignmentsByEmail(email)
  return ApiResponses.success({
    assignments: assignments.map((assignment) => ({
      email: assignment.userEmail,
      skuCode: assignment.skuCode,
      createdAt: assignment.createdAt.toISOString(),
      createdByEmail: assignment.createdByEmail,
    })),
  })
})

export const POST = withAuth(async (request: NextRequest, session) => {
  if (!isSuperAdmin(session.user.email || '')) {
    return ApiResponses.forbidden('Only super admins can manage PO product assignments')
  }

  const payload = await request.json().catch(() => null)
  const parsed = AssignmentSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()
  const sku = await prisma.sku.findUnique({
    where: { skuCode: parsed.data.skuCode },
    select: { skuCode: true },
  })

  if (!sku) {
    return ApiResponses.badRequest(`SKU ${parsed.data.skuCode} not found in current tenant`)
  }

  const assignment = await assignSkuToEmail(
    parsed.data.email,
    parsed.data.skuCode,
    session.user.email || 'unknown@local'
  )

  return ApiResponses.success({
    assignment: {
      email: assignment.userEmail,
      skuCode: assignment.skuCode,
      createdAt: assignment.createdAt.toISOString(),
      createdByEmail: assignment.createdByEmail,
    },
  })
})

export const DELETE = withAuth(async (request: NextRequest, session) => {
  if (!isSuperAdmin(session.user.email || '')) {
    return ApiResponses.forbidden('Only super admins can manage PO product assignments')
  }

  const payload = await request.json().catch(() => null)
  const parsed = AssignmentSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  await unassignSkuFromEmail(parsed.data.email, parsed.data.skuCode)

  return ApiResponses.success({
    success: true,
    email: parsed.data.email.trim().toLowerCase(),
    skuCode: parsed.data.skuCode,
  })
})
