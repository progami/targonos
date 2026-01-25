import { NextRequest } from 'next/server'
import { withAuth, ApiResponses, z } from '@/lib/api'
import { getPurchaseOrders, serializePurchaseOrder } from '@/lib/services/purchase-order-service'
import {
  createPurchaseOrder,
  serializePurchaseOrder as serializeNewPO,
} from '@/lib/services/po-stage-service'
import type { UserContext } from '@/lib/services/po-stage-service'
import { hasPermission } from '@/lib/services/permission-service'
import { getCurrentTenant } from '@/lib/tenant/server'

export const GET = withAuth(async (_request: NextRequest, _session) => {
  const orders = await getPurchaseOrders()
  return ApiResponses.success({
    data: orders.map(order => serializePurchaseOrder(order)),
  })
})

const LineItemSchema = z.object({
  skuCode: z.string().trim().min(1, 'SKU is required'),
  skuDescription: z.string().optional(),
  batchLot: z
    .string()
    .trim()
    .min(1)
    .refine(value => value.trim().toUpperCase() !== 'DEFAULT', 'Batch is required'),
  piNumber: z.string().trim().optional(),
  productNumber: z.string().trim().optional(),
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
 * Create a new RFQ in DRAFT status with an auto-generated order number.
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
          batchLot: line.batchLot,
          piNumber: line.piNumber,
          productNumber: line.productNumber,
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
    return ApiResponses.success(serializeNewPO(order, { defaultCurrency: tenant.currency }))
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
