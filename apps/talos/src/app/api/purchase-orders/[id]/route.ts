import { ApiResponses, withAuthAndParams, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { serializePurchaseOrder as serializeWithStageData } from '@/lib/services/po-stage-service'
import {
  getPurchaseOrderById,
  updatePurchaseOrderDetails,
} from '@/lib/services/purchase-order-service'

export const GET = withAuthAndParams(async (_request, params) => {
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params?.id?.[0]
        : undefined
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const order = await getPurchaseOrderById(id)
  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  const serialized = serializeWithStageData(order)
  return ApiResponses.success({
    ...serialized,
    proformaInvoices: order.proformaInvoices.map(pi => ({
      id: pi.id,
      piNumber: pi.piNumber,
      invoiceDate: pi.invoiceDate ? pi.invoiceDate.toISOString() : null,
    })),
  })
})

const UpdateDetailsSchema = z.object({
  expectedDate: z.string().trim().optional().nullable(),
  incoterms: z.string().trim().optional().nullable(),
  paymentTerms: z.string().trim().optional().nullable(),
  counterpartyName: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export const PATCH = withAuthAndParams(async (request, params, session) => {
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params?.id?.[0]
        : undefined
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return ApiResponses.badRequest('Invalid update payload')
  }

  const parsed = UpdateDetailsSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const normalized = {
    expectedDate: parsed.data.expectedDate === '' ? null : parsed.data.expectedDate ?? undefined,
    incoterms: parsed.data.incoterms === '' ? null : parsed.data.incoterms ?? undefined,
    paymentTerms: parsed.data.paymentTerms === '' ? null : parsed.data.paymentTerms ?? undefined,
    counterpartyName:
      parsed.data.counterpartyName === '' ? null : parsed.data.counterpartyName ?? undefined,
    notes: parsed.data.notes === '' ? null : parsed.data.notes ?? undefined,
  }

  try {
    const updated = await updatePurchaseOrderDetails(id, normalized, {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? null,
    })
    const serialized = serializeWithStageData(updated)
    return ApiResponses.success({
      ...serialized,
      proformaInvoices: updated.proformaInvoices.map(pi => ({
        id: pi.id,
        piNumber: pi.piNumber,
        invoiceDate: pi.invoiceDate ? pi.invoiceDate.toISOString() : null,
      })),
    })
  } catch (error) {
    return ApiResponses.handleError(error)
  }
})
