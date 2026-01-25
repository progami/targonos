import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { receivePurchaseOrderInventory, serializePurchaseOrder } from '@/lib/services/po-stage-service'
import type { ReceivePurchaseOrderInventoryInput, UserContext } from '@/lib/services/po-stage-service'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const DateInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date',
  })

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const OptionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())

const OptionalNumber = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().optional())

const ReceivePurchaseOrderSchema = z.object({
  warehouseCode: z.string().trim().min(1),
  receiveType: z.enum(['CONTAINER_20', 'CONTAINER_40', 'CONTAINER_40_HQ', 'CONTAINER_45_HQ', 'LCL'] as const),
  customsEntryNumber: z.string().trim().min(1),
  customsClearedDate: DateInputSchema,
  receivedDate: DateInputSchema,
  dutyAmount: OptionalNumber.nullable().optional(),
  dutyCurrency: OptionalString.nullable().optional(),
  discrepancyNotes: OptionalString.nullable().optional(),
  lineReceipts: z
    .array(
      z.object({
        lineId: z.string().trim().min(1),
        quantityReceived: z.number().int().min(0),
      })
    )
    .optional(),
})

const readParam = (params: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

export const POST = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params as Record<string, unknown> | undefined, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = ReceivePurchaseOrderSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const userContext: UserContext = {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? 'Unknown',
    email: session.user.email ?? '',
  }

  try {
    const updated = await receivePurchaseOrderInventory({
      orderId: id,
      input: parsed.data as ReceivePurchaseOrderInventoryInput,
      user: userContext,
    })

    return ApiResponses.success(serializePurchaseOrder(updated))
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
