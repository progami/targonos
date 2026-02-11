import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { receivePurchaseOrderInventory, serializePurchaseOrder } from '@/lib/services/po-stage-service'
import type { ReceivePurchaseOrderInventoryInput, UserContext } from '@/lib/services/po-stage-service'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { getTenantPrisma } from '@/lib/tenant/server'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const OptionalString = z.preprocess(emptyToUndefined, z.string().trim().optional())

const RequiredString = (message: string) =>
  z.preprocess(
    emptyToUndefined,
    z.string({ required_error: message, invalid_type_error: message }).trim()
  )

const RequiredDateString = (requiredMessage: string) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ required_error: requiredMessage, invalid_type_error: requiredMessage })
      .trim()
      .refine((value) => !Number.isNaN(new Date(value).getTime()), {
        message: 'Invalid date',
      })
  )

const OptionalNumber = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value)
  if (cleaned === undefined || cleaned === null) return undefined
  if (typeof cleaned === 'string') {
    const parsed = Number(cleaned)
    return Number.isNaN(parsed) ? cleaned : parsed
  }
  return cleaned
}, z.number().optional())

const RequiredInboundReceiveType = z.preprocess(
  emptyToUndefined,
  z.enum(['CONTAINER_20', 'CONTAINER_40', 'CONTAINER_40_HQ', 'CONTAINER_45_HQ', 'LCL'] as const, {
    required_error: 'Receive type is required',
    invalid_type_error: 'Receive type is required',
  })
)

const ReceivePurchaseOrderSchema = z.object({
  warehouseCode: RequiredString('Warehouse is required'),
  receiveType: RequiredInboundReceiveType,
  customsEntryNumber: OptionalString.nullable().optional(),
  customsClearedDate: RequiredDateString('Customs cleared date is required'),
  receivedDate: RequiredDateString('Received date is required'),
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

const receiveErrorKeyToGateKey = (key: string): string => {
  switch (key) {
    case 'warehouseCode':
      return 'details.warehouseCode'
    case 'receiveType':
      return 'details.receiveType'
    case 'customsEntryNumber':
      return 'details.customsEntryNumber'
    case 'customsClearedDate':
      return 'details.customsClearedDate'
    case 'receivedDate':
      return 'details.receivedDate'
    case 'discrepancyNotes':
      return 'details.discrepancyNotes'
    case 'lineReceipts':
      return 'cargo.lines'
    default:
      return key
  }
}

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
    const errors = parsed.error.flatten().fieldErrors
    const normalized: Record<string, string | string[]> = {}
    for (const [key, value] of Object.entries(errors)) {
      normalized[receiveErrorKeyToGateKey(key)] = value
    }
    return ApiResponses.validationError(normalized)
  }

  const prisma = await getTenantPrisma()
  const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
    prisma,
    purchaseOrderId: id,
  })
  if (crossTenantGuard) {
    return crossTenantGuard
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

    const supplier =
      updated.counterpartyName && updated.counterpartyName.trim().length > 0
        ? await prisma.supplier.findFirst({
            where: { name: { equals: updated.counterpartyName.trim(), mode: 'insensitive' } },
            select: { phone: true, bankingDetails: true, address: true },
          })
        : null

    return ApiResponses.success({
      ...serializePurchaseOrder(updated),
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
