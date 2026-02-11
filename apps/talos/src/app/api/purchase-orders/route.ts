import { NextRequest } from 'next/server'
import { withAuth, ApiResponses, z } from '@/lib/api'
import { getPurchaseOrders, getPurchaseOrdersBySplitGroup } from '@/lib/services/purchase-order-service'
import {
  createPurchaseOrder,
  serializePurchaseOrder as serializeNewPO,
} from '@/lib/services/po-stage-service'
import type { UserContext } from '@/lib/services/po-stage-service'
import { hasPermission } from '@/lib/services/permission-service'
import { getCurrentTenant, getTenantPrisma } from '@/lib/tenant/server'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'

export const GET = withAuth(async (request: NextRequest, _session) => {
  const splitGroupId = request.nextUrl.searchParams.get('splitGroupId')
  const orders =
    typeof splitGroupId === 'string' && splitGroupId.trim().length > 0
      ? await getPurchaseOrdersBySplitGroup(splitGroupId)
      : await getPurchaseOrders()
  const tenant = await getCurrentTenant()
  return ApiResponses.success({
    data: orders.map(order => serializeNewPO(order, { defaultCurrency: tenant.currency })),
  })
})

const LineItemSchema = z.object({
  skuCode: z.string().trim().min(1, 'SKU is required'),
  skuDescription: z.string().optional(),
  piNumber: z.string().trim().optional(),
  commodityCode: z.string().trim().optional(),
  countryOfOrigin: z.string().trim().optional(),
  netWeightKg: z.number().positive().optional(),
  cartonWeightKg: z.number().positive().optional(),
  cartonSide1Cm: z.number().positive().optional(),
  cartonSide2Cm: z.number().positive().optional(),
  cartonSide3Cm: z.number().positive().optional(),
  material: z.string().trim().optional(),
  unitsOrdered: z.number().int().positive(),
  unitsPerCarton: z.number().int().positive(),
  totalCost: z.number().min(0).optional(),
  currency: z.string().trim().min(1, 'Currency is required'),
  notes: z.string().optional(),
})

const CreatePOSchema = z.object({
  counterpartyName: z.string().trim().min(1),
  expectedDate: z
    .string()
    .trim()
    .min(1, 'Cargo ready date is required')
    .refine(value => !Number.isNaN(new Date(value).getTime()), 'Invalid cargo ready date'),
  incoterms: z.string().trim().min(1, 'Incoterms is required'),
  paymentTerms: z.string().trim().min(1, 'Payment terms is required'),
  notes: z.string().optional(),
  lines: z.array(LineItemSchema).min(1, 'At least one line item is required'),
})

/**
 * POST /api/purchase-orders
 * Create a new purchase order in RFQ status with an auto-generated order number.
 * PO number is assigned when the RFQ is advanced to ISSUED.
 * Warehouse is NOT required at this stage - selected at Stage 4 (WAREHOUSE)
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const payload = await request.json().catch(() => null)
  const result = CreatePOSchema.safeParse(payload)

  if (!result.success) {
    return ApiResponses.badRequest(
      `Invalid payload: ${result.error.errors.map(e => e.message).join(', ')}`
    )
  }

  const userContext: UserContext = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? 'Unknown',
    email: session.user.email ?? '',
  }

  const canCreate = await hasPermission(userContext.id, 'po.create')
  if (!canCreate) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  try {
    const order = await createPurchaseOrder(
      {
        counterpartyName: result.data.counterpartyName,
        expectedDate: result.data.expectedDate,
        incoterms: result.data.incoterms,
        paymentTerms: result.data.paymentTerms,
        notes: result.data.notes,
        lines: result.data.lines.map(line => ({
          skuCode: line.skuCode,
          skuDescription: line.skuDescription,
          piNumber: line.piNumber,
          commodityCode: line.commodityCode,
          countryOfOrigin: line.countryOfOrigin,
          netWeightKg: line.netWeightKg,
          cartonWeightKg: line.cartonWeightKg,
          cartonSide1Cm: line.cartonSide1Cm,
          cartonSide2Cm: line.cartonSide2Cm,
          cartonSide3Cm: line.cartonSide3Cm,
          material: line.material,
          unitsOrdered: line.unitsOrdered,
          unitsPerCarton: line.unitsPerCarton,
          totalCost: line.totalCost,
          currency: line.currency,
          notes: line.notes,
        })),
      },
      userContext
    )

    const tenant = await getCurrentTenant()
    const prisma = await getTenantPrisma()
    const supplier = await prisma.supplier.findFirst({
      where: { name: { equals: order.counterpartyName?.trim() ?? '', mode: 'insensitive' } },
      select: { phone: true, bankingDetails: true, address: true },
    })
    return ApiResponses.success({
      ...serializeNewPO(order, { defaultCurrency: tenant.currency }),
      supplier: supplier
        ? {
            phone: supplier.phone ?? null,
            bankingDetails: supplier.bankingDetails ?? null,
            address: supplier.address ?? null,
            country: deriveSupplierCountry(supplier.address),
          }
        : null,
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
