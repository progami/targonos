import { withAuthAndParams, ApiResponses, z } from '@/lib/api'
import { hasPermission } from '@/lib/services/permission-service'
import { getTenantPrisma } from '@/lib/tenant/server'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function readParam(params: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = params?.[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

const DateInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine(value => !Number.isNaN(new Date(value).getTime()), {
    message: 'Invalid date',
  })

const CreateProformaInvoiceSchema = z.object({
  piNumber: z.string().trim().min(1),
  invoiceDate: DateInputSchema.optional(),
})

export const GET = withAuthAndParams(async (_request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canView = await hasPermission(session.user.id, 'po.view')
  if (!canView) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const prisma = await getTenantPrisma()

  const invoices = await prisma.purchaseOrderProformaInvoice.findMany({
    where: { purchaseOrderId: id },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      piNumber: true,
      invoiceDate: true,
      createdAt: true,
      createdByName: true,
    },
  })

  return ApiResponses.success({
    proformaInvoices: invoices.map(row => ({
      id: row.id,
      piNumber: row.piNumber,
      invoiceDate: row.invoiceDate ? row.invoiceDate.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName ?? null,
    })),
  })
})

export const POST = withAuthAndParams(async (request: NextRequest, params, session) => {
  const id = readParam(params, 'id')
  if (!id) {
    return ApiResponses.badRequest('Purchase order ID is required')
  }

  const canEdit = await hasPermission(session.user.id, 'po.edit')
  if (!canEdit) {
    return ApiResponses.forbidden('Insufficient permissions')
  }

  const payload = await request.json().catch(() => null)
  const parsed = CreateProformaInvoiceSchema.safeParse(payload)
  if (!parsed.success) {
    return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
  }

  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      proformaInvoiceNumber: true,
    },
  })

  if (!order) {
    return ApiResponses.notFound('Purchase order not found')
  }

  const piNumber = parsed.data.piNumber.trim()
  const invoiceDate = parsed.data.invoiceDate ? new Date(parsed.data.invoiceDate) : null

  const existing = await prisma.purchaseOrderProformaInvoice.findUnique({
    where: { purchaseOrderId_piNumber: { purchaseOrderId: id, piNumber } },
    select: { id: true },
  })

  if (existing) {
    return ApiResponses.conflict('PI number already exists for this purchase order')
  }

  const created = await prisma.purchaseOrderProformaInvoice.create({
    data: {
      purchaseOrderId: id,
      piNumber,
      invoiceDate,
      createdById: session.user.id,
      createdByName: session.user.name ?? session.user.email ?? null,
    },
    select: {
      id: true,
      piNumber: true,
      invoiceDate: true,
      createdAt: true,
      createdByName: true,
    },
  })

  if (!order.proformaInvoiceNumber) {
    await prisma.purchaseOrder.update({
      where: { id },
      data: {
        proformaInvoiceNumber: piNumber,
        proformaInvoiceDate: invoiceDate,
      },
    })
  }

  return ApiResponses.success({
    id: created.id,
    piNumber: created.piNumber,
    invoiceDate: created.invoiceDate ? created.invoiceDate.toISOString() : null,
    createdAt: created.createdAt.toISOString(),
    createdByName: created.createdByName ?? null,
  })
})

