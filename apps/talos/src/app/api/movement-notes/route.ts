import { withAuth, ApiResponses, z } from '@/lib/api'
import { createMovementNote, listMovementNotes, type CreateMovementNoteInput } from '@/lib/services/movement-note-service'

const lineSchema = z.object({
 purchaseOrderLineId: z.string().min(1, 'Purchase order line is required'),
 quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than zero'),
 batchLot: z.string().trim().min(1, 'Batch cannot be empty').optional().nullable(),
 storageCartonsPerPallet: z.number().int().positive().optional().nullable(),
 shippingCartonsPerPallet: z.number().int().positive().optional().nullable(),
 attachments: z.record(z.string(), z.any()).optional().nullable(),
})

const createSchema = z.object({
 purchaseOrderId: z.string().min(1, 'Purchase order is required'),
 referenceNumber: z.string().trim().optional().nullable(),
 receivedAt: z.string().optional().nullable(),
 notes: z.string().optional().nullable(),
 lines: z.array(lineSchema).min(1, 'At least one line item is required'),
})

export const GET = withAuth(async (request) => {
 const searchParams = request.nextUrl.searchParams
 const purchaseOrderId = searchParams.get('purchaseOrderId')

 const notes = await listMovementNotes({ purchaseOrderId: purchaseOrderId ?? undefined })
 return ApiResponses.success({ data: notes })
})

export const POST = withAuth(async (request, session) => {
 const body = await request.json().catch(() => null)
 if (!body) {
 return ApiResponses.badRequest('Invalid JSON payload')
 }

 const parsed = createSchema.safeParse(body)
 if (!parsed.success) {
 return ApiResponses.validationError(parsed.error.flatten().fieldErrors)
 }

 let receivedAt: Date | null = null
 if (parsed.data.receivedAt) {
 const parsedDate = new Date(parsed.data.receivedAt)
 if (Number.isNaN(parsedDate.getTime())) {
 return ApiResponses.validationError({ receivedAt: 'Invalid receivedAt value' })
 }
 receivedAt = parsedDate
 }

 const payload: CreateMovementNoteInput = {
 purchaseOrderId: parsed.data.purchaseOrderId,
 referenceNumber: parsed.data.referenceNumber ?? null,
 receivedAt,
 notes: parsed.data.notes ?? null,
 lines: parsed.data.lines.map(line => ({
 purchaseOrderLineId: line.purchaseOrderLineId,
 quantity: line.quantity,
 batchLot: line.batchLot ?? null,
 storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
 shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
 attachments: line.attachments ?? null,
 })),
 }

 const note = await createMovementNote(payload, {
 id: session.user.id,
 name: session.user.name,
 })

 return ApiResponses.created(note)
})
