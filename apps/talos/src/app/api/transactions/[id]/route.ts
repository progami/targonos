import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { withBasePath } from '@/lib/utils/base-path'
import { Prisma } from '@targon/prisma-talos'
import { getS3Service } from '@/services/s3.service'

export const dynamic = 'force-dynamic'

type ApiAttachment = {
 fileName?: string
 name?: string
 contentType?: string
 type?: string
 size?: number
 s3Key?: string
 s3Url?: string
 uploadedAt?: string
 uploadedBy?: string
}

const toOptionalString = (value: unknown): string | undefined => {
 return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

const toOptionalNumber = (value: unknown): number | undefined => {
 return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeAttachmentRecord(value: unknown): Record<string, ApiAttachment> {
 const result: Record<string, ApiAttachment> = {}

 if (!value) {
 return result
 }

 if (Array.isArray(value)) {
 for (const entry of value) {
 if (!entry || typeof entry !== 'object') continue
 const record = entry as Record<string, unknown>
 const category = toOptionalString(record.type)
 if (!category || category === 'notes') continue

 const attachment: ApiAttachment = {}
 const s3Key = toOptionalString(record.s3Key)
 if (s3Key) {
 attachment.s3Key = s3Key
 }
 const name = toOptionalString(record.name)
 if (name) {
 attachment.fileName = name
 attachment.name = name
 }
 const uploadedAt = toOptionalString(record.uploadedAt)
 if (uploadedAt) {
 attachment.uploadedAt = uploadedAt
 }
 const uploadedBy = toOptionalString(record.uploadedBy)
 if (uploadedBy) {
 attachment.uploadedBy = uploadedBy
 }

 result[category] = attachment
 }

 return result
 }

 if (typeof value === 'object') {
 const record = value as Record<string, unknown>
 for (const [key, entry] of Object.entries(record)) {
 if (!entry || typeof entry !== 'object') continue

 const entryRecord = entry as Record<string, unknown>
 const s3Key = toOptionalString(entryRecord.s3Key)
 if (!s3Key) continue

 const attachment: ApiAttachment = {}
 attachment.s3Key = s3Key

 const fileName = toOptionalString(entryRecord.fileName)
 if (fileName) {
 attachment.fileName = fileName
 }
 const name = toOptionalString(entryRecord.name)
 if (name) {
 attachment.name = name
 }
 const contentType = toOptionalString(entryRecord.contentType)
 if (contentType) {
 attachment.contentType = contentType
 }
 const type = toOptionalString(entryRecord.type)
 if (type) {
 attachment.type = type
 }
 const size = toOptionalNumber(entryRecord.size)
 if (size !== undefined) {
 attachment.size = size
 }
 const uploadedAt = toOptionalString(entryRecord.uploadedAt)
 if (uploadedAt) {
 attachment.uploadedAt = uploadedAt
 }
 const uploadedBy = toOptionalString(entryRecord.uploadedBy)
 if (uploadedBy) {
 attachment.uploadedBy = uploadedBy
 }

 result[key] = attachment
 }
 }

 return result
}

async function addPresignedUrls(
 attachments: Record<string, ApiAttachment>
): Promise<Record<string, ApiAttachment>> {
 const entries = Object.entries(attachments)
 if (entries.length === 0) {
 return attachments
 }

 const s3Service = getS3Service()

 const processed = await Promise.all(
 entries.map(async ([category, attachment]) => {
 if (!attachment.s3Key) {
 return [category, attachment] as const
 }

 let filename = attachment.fileName
 if (!filename) {
 filename = attachment.name
 }
 if (!filename) {
 filename = attachment.s3Key
 }

 try {
 const s3Url = await s3Service.getPresignedUrl(attachment.s3Key, 'get', {
 responseContentDisposition: `attachment; filename="${filename}"`,
 expiresIn: 3600,
 })
 return [category, { ...attachment, s3Url }] as const
 } catch (_error) {
 return [category, attachment] as const
 }
 })
 )

 return Object.fromEntries(processed)
}

export const GET = withAuthAndParams(async (request, params, _session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id },
 select: {
 id: true,
 transactionDate: true,
 transactionType: true,
 lotRef: true,
 referenceId: true,
 cartonsIn: true,
 cartonsOut: true,
 storagePalletsIn: true,
 shippingPalletsOut: true,
 createdAt: true,
 shipName: true,
 trackingNumber: true,
 pickupDate: true,
 attachments: true,
 storageCartonsPerPallet: true,
 shippingCartonsPerPallet: true,
 unitsPerCarton: true,
 supplier: true,
 // Use snapshot data instead of relations
 warehouseCode: true,
 warehouseName: true,
 warehouseAddress: true,
 skuCode: true,
 skuDescription: true,
 unitDimensionsCm: true,
 unitWeightKg: true,
 cartonDimensionsCm: true,
 cartonWeightKg: true,
 packagingType: true,
 createdById: true,
 createdByName: true
 }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Fetch costs from CostLedger for this transaction
 const costLedger = await prisma.costLedger.findMany({
 where: {
 transactionId: id // Use the UUID directly
 },
 select: {
 costCategory: true,
 quantity: true,
 unitRate: true,
 totalCost: true
 }
 })

  // Process attachments to add presigned URLs
  const attachmentRecord = normalizeAttachmentRecord(transaction.attachments)
  const processedAttachments = await addPresignedUrls(attachmentRecord)

 // Create response object with transaction and costs
 // Transform to match expected format with nested objects
 const response = {
 ...transaction,
 attachments: processedAttachments,
 costLedger: costLedger,
 calculatedCosts: costLedger, // For backward compatibility
 // Add nested objects for backward compatibility
 warehouse: {
 id: '', // No longer have warehouse ID
 code: transaction.warehouseCode,
 name: transaction.warehouseName
 },
 sku: {
 id: '', // No longer have SKU ID
 skuCode: transaction.skuCode,
 description: transaction.skuDescription,
 unitsPerCarton: transaction.unitsPerCarton
 },
 createdBy: {
 id: transaction.createdById,
 fullName: transaction.createdByName
 }
 }

 return NextResponse.json(response)
 } catch (_error) {
 // console.error('Failed to fetch transaction:', _error)
 return NextResponse.json({ 
 error: 'Failed to fetch transaction'
 }, { status: 500 })
 }
})

export const PUT = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const body = await request.json()

 // Get the existing transaction
 const existingTransaction = await prisma.inventoryTransaction.findUnique({
 where: { id }
 })

 if (!existingTransaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Check if user has permission to edit this warehouse's transactions
 // Since we don't have warehouseId anymore, we need to check by warehouse code
 if (session.user.role === 'staff' && session.user.warehouseId) {
 const userWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true }
 })
 if (userWarehouse && userWarehouse.code !== existingTransaction.warehouseCode) {
 return NextResponse.json({ error: 'Access denied' }, { status: 403 })
 }
 }

 // Only allow updating reference fields, NOT quantities or costs
 const allowedFields = [
 'referenceId',
 'shipName',
 'trackingNumber',
 'supplier'
 ]

 const updateData: Record<string, unknown> = {}
 for (const field of allowedFields) {
 if (body[field] !== undefined) {
 updateData[field] = body[field]
 }
 }

 // Update the transaction
 const updatedTransaction = await prisma.inventoryTransaction.update({
 where: { id },
 data: updateData as Prisma.InventoryTransactionUpdateInput
 })

 return NextResponse.json(updatedTransaction)
 } catch (_error) {
 // console.error('Failed to update transaction:', _error)
 return NextResponse.json({ 
 error: 'Failed to update transaction'
 }, { status: 500 })
 }
})

export const DELETE = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 // First validate if this transaction can be deleted
  const validationResponse = await fetch(withBasePath(`/api/transactions/${id}/validate-edit`), {
  method: 'GET',
  headers: {
  'Cookie': request.headers.get('cookie') || ''
  }
  })


 if (!validationResponse.ok) {
 return NextResponse.json({ error: 'Failed to validate transaction' }, { status: 500 })
 }

 const validation = await validationResponse.json()

 if (!validation.canDelete) {
 return NextResponse.json({ 
 error: validation.reason || 'Cannot delete this transaction' 
 }, { status: 400 })
 }

 // Get transaction details before deletion for logging
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Check user permissions
 if (session.user.role === 'staff' && session.user.warehouseId) {
 const userWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true }
 })
 if (userWarehouse && userWarehouse.code !== transaction.warehouseCode) {
 return NextResponse.json({ error: 'Access denied' }, { status: 403 })
 }
 }

 // Delete the transaction (cascade deletion will handle related cost ledger entries)
 await prisma.inventoryTransaction.delete({
 where: { id }
 })

 // Log the deletion
 // console.log(`Transaction ${transaction.id} deleted by ${session.user.email}`)

 return NextResponse.json({ 
 success: true, 
 message: 'Transaction deleted successfully',
 deletedTransaction: {
 id: transaction.id,
 type: transaction.transactionType,
 sku: transaction.skuCode,
 lotRef: transaction.lotRef,
 quantity: transaction.cartonsIn || transaction.cartonsOut
 }
 })
 } catch (_error) {
 // console.error('Failed to delete transaction:', _error)
 return NextResponse.json({ 
 error: 'Failed to delete transaction'
 }, { status: 500 })
 }
})
