import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'
import { getS3Service } from '@/services/s3.service'
import { validateFile, scanFileContent } from '@/lib/security/file-upload'

interface AttachmentData {
 fileName: string;
 uploadedAt: string;
 uploadedBy: string;
 s3Key: string;
 s3Url: string;
 size: number;
 contentType: string;
}

type AttachmentsRecord = Record<string, AttachmentData>
type AttachmentInput = Partial<AttachmentData> & {
 name?: string
 category?: string
 data?: string
}
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 seconds for file uploads

export const POST = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 // Initialize S3 service
 const s3Service = getS3Service();

 // Check content type to handle both FormData and JSON
 const contentType = request.headers.get('content-type')

 if (contentType?.includes('application/json')) {
 // Handle JSON with base64 attachments - migrate to S3
 const body = await request.json()
 const { attachments } = body as { attachments?: unknown }

 if (!attachments || !Array.isArray(attachments)) {
 return NextResponse.json({ error: 'Attachments array is required' }, { status: 400 })
 }

 // Get the transaction
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }
 
 // Upload base64 attachments to S3
 const attachmentInputs = attachments as AttachmentInput[]
 const currentAttachments = (transaction.attachments as unknown as AttachmentsRecord) || {}
 const updatedAttachments: AttachmentsRecord = { ...currentAttachments }

 for (const attachment of attachmentInputs) {
 try {
 const category = (attachment.category || 'general').toString()
 if (attachment.data && attachment.data.startsWith('data:')) {
 // Extract base64 data
 const matches = attachment.data.match(/^data:(.+);base64,(.+)$/)
 if (!matches) continue
 
 const mimeType = matches[1]
 const base64Data = matches[2]
 const buffer = Buffer.from(base64Data, 'base64')
 
 // Validate file
 const validation = await validateFile(
 { name: attachment.name, size: buffer.length, type: mimeType },
 'transaction-attachment'
 )
 
 if (!validation.valid) {
 // console.error(`File validation failed: ${validation.error}`)
 continue
 }
 
 // Scan file content
 const scanResult = await scanFileContent(buffer, mimeType)
 if (!scanResult.valid) {
 // console.error(`File scan failed: ${scanResult.error}`)
 continue
 }
 
 // Generate S3 key
 const s3Key = s3Service.generateKey(
 { 
 type: 'transaction', 
 transactionId: id, 
 documentType: attachment.category || 'general' 
 },
 attachment.name
 )
 
 // Upload to S3
 const uploadResult = await s3Service.uploadFile(buffer, s3Key, {
 contentType: mimeType,
 metadata: {
 transactionId: id,
 documentType: attachment.category || 'general',
 originalName: attachment.name,
 uploadedBy: session.user.id,
 },
 })
 
 // Get presigned URL for immediate access
 const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', {
 expiresIn: 3600, // 1 hour
 })
 
 const attachmentData: AttachmentData = {
 fileName: attachment.fileName || attachment.name || category,
 uploadedAt: new Date().toISOString(),
 uploadedBy: session.user.id,
 s3Key: uploadResult.key,
 s3Url: presignedUrl,
 size: uploadResult.size,
 contentType: uploadResult.contentType || mimeType
 }

 if (currentAttachments[category]?.s3Key && currentAttachments[category].s3Key !== attachmentData.s3Key) {
 try {
 await s3Service.deleteFile(currentAttachments[category].s3Key)
 } catch (_error) {
 // ignore deletion failure
 }
 }

 updatedAttachments[category] = attachmentData
 } else {
 // Already has S3 key or no data
 if (attachment.s3Key) {
 updatedAttachments[category] = {
 fileName: attachment.fileName || attachment.name || category,
 uploadedAt: attachment.uploadedAt || new Date().toISOString(),
 uploadedBy: attachment.uploadedBy || session.user.id,
 s3Key: attachment.s3Key,
 s3Url: attachment.s3Url || '',
 size: attachment.size || 0,
 contentType: attachment.contentType || 'application/octet-stream'
 }
 }
 }
 } catch (_error) {
 // console.error('Failed to upload attachment:', _error)
 // Keep existing attachment data if upload fails
 }
 }
 
 // Check if all required documents are now present
 const hasAllRequiredDocs = checkIfAllRequiredDocsPresent(transaction.transactionType, updatedAttachments)
 
 // Update transaction with S3 references
 await prisma.inventoryTransaction.update({
 where: { id },
 data: {
 attachments: updatedAttachments as unknown as Prisma.InputJsonValue,
 // Automatically mark as reconciled if all required docs are present
 ...(hasAllRequiredDocs && { isReconciled: true })
 }
 })
 
 return NextResponse.json({ 
 success: true,
 message: 'Attachments uploaded to S3 successfully',
 attachments: updatedAttachments,
 reconciled: hasAllRequiredDocs
 })
 } else {
 // Original FormData handling
 const formData = await request.formData()
 const file = formData.get('file') as File
 const documentType = formData.get('documentType') as string

 if (!file || !documentType) {
 return NextResponse.json({ error: 'File and document type are required' }, { status: 400 })
 }

 // Validate file
 const validation = await validateFile(file, 'transaction-attachment')
 if (!validation.valid) {
 return NextResponse.json({ error: validation.error }, { status: 400 })
 }
 
 // Get the transaction
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Convert file to buffer and scan
 const bytes = await file.arrayBuffer()
 const buffer = Buffer.from(bytes)
 
 const scanResult = await scanFileContent(buffer, file.type)
 if (!scanResult.valid) {
 return NextResponse.json({ error: scanResult.error }, { status: 400 })
 }
 
 // Generate S3 key
 const s3Key = s3Service.generateKey(
 { 
 type: 'transaction', 
 transactionId: id, 
 documentType: documentType 
 },
 file.name
 )
 
 // Upload to S3
 const uploadResult = await s3Service.uploadFile(buffer, s3Key, {
 contentType: file.type,
 metadata: {
 transactionId: id,
 documentType: documentType,
 originalName: file.name,
 uploadedBy: session.user.id,
 },
 })
 
 // Get presigned URL for immediate access
 const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', {
 expiresIn: 3600, // 1 hour
 })

 // Update transaction attachments
 const currentAttachments = (transaction.attachments as unknown as AttachmentsRecord) || {}
 
 // Delete old file from S3 if replacing an existing attachment
 if (currentAttachments[documentType]?.s3Key) {
 try {
 await s3Service.deleteFile(currentAttachments[documentType].s3Key)
 // File deleted from S3
 } catch (_error) {
 // console.error('Failed to delete old S3 file:', _error)
 // Continue even if deletion fails
 }
 }
 
 const updatedAttachments = {
 ...currentAttachments,
 [documentType]: {
 fileName: file.name,
 uploadedAt: new Date().toISOString(),
 uploadedBy: session.user.id,
 s3Key: uploadResult.key,
 s3Url: presignedUrl,
 size: uploadResult.size,
 contentType: uploadResult.contentType,
 }
 }

 // Check if all required documents are now present
 const hasAllRequiredDocs = checkIfAllRequiredDocsPresent(transaction.transactionType, updatedAttachments)
 
 await prisma.inventoryTransaction.update({
 where: { id },
 data: {
 attachments: updatedAttachments as unknown as Prisma.InputJsonValue,
 // Automatically mark as reconciled if all required docs are present
 ...(hasAllRequiredDocs && { isReconciled: true })
 }
 })

 return NextResponse.json({ 
 success: true,
 message: 'Document uploaded successfully',
 reconciled: hasAllRequiredDocs
 })
 }
 } catch (_error) {
 // console.error('Upload attachment error:', error)
 return NextResponse.json({ 
 error: 'Failed to upload attachment',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})

export const GET = withAuthAndParams(async (request, params, _session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const s3Service = getS3Service();
 const searchParams = request.nextUrl.searchParams
 const download = searchParams.get('download') === 'true'
 const s3Key = searchParams.get('key')

 // If specific file requested, return presigned URL
 if (s3Key) {
 const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', {
 expiresIn: 3600, // 1 hour
 responseContentDisposition: download 
 ? `attachment; filename="${s3Key.split('/').pop()}"` 
 : undefined
 })
 
 return NextResponse.json({ 
 url: presignedUrl,
 expiresIn: 3600
 })
 }

 // Otherwise, return all attachments with fresh presigned URLs
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id },
 select: {
 attachments: true
 }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Generate fresh presigned URLs for all attachments
 const attachmentsValue = transaction.attachments as unknown
 const attachments = attachmentsValue as AttachmentsRecord | AttachmentInput[] | null
 const attachmentsWithUrls: Record<string, AttachmentData & { url?: string }> = {}

 if (attachments && !Array.isArray(attachments) && typeof attachments === 'object') {
 // Handle object-style attachments (documentType as key)
 for (const [docType, attachment] of Object.entries(attachments)) {
 if (attachment && typeof attachment === 'object') {
 const attachmentData = attachment as AttachmentData
 if (attachmentData.s3Key) {
 const presignedUrl = await s3Service.getPresignedUrl(attachmentData.s3Key, 'get', {
 expiresIn: 3600,
 })
 attachmentsWithUrls[docType] = {
 ...attachmentData,
 s3Url: presignedUrl
 }
 } else {
 attachmentsWithUrls[docType] = attachmentData
 }
 }
 }
 } else if (Array.isArray(attachments)) {
 // Handle array-style attachments
 const attachmentArray: AttachmentInput[] = []
 for (const attachment of attachments as AttachmentInput[]) {
 if (attachment.s3Key) {
 const presignedUrl = await s3Service.getPresignedUrl(attachment.s3Key, 'get', {
 expiresIn: 3600,
 })
 attachmentArray.push({
 ...attachment,
 s3Url: presignedUrl
 })
 } else {
 attachmentArray.push(attachment)
 }
 }
 return NextResponse.json({ 
 attachments: attachmentArray
 })
 }

 return NextResponse.json({ 
 attachments: attachmentsWithUrls
 })
 } catch (_error) {
 // console.error('Get attachments error:', _error)
 return NextResponse.json({ 
 error: 'Failed to get attachments',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})

export const DELETE = withAuthAndParams(async (request, params, _session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 const searchParams = request.nextUrl.searchParams
 const category = searchParams.get('category')

 if (!category) {
 return NextResponse.json({ error: 'Category is required' }, { status: 400 })
 }

 // Get the transaction
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id },
 select: {
 attachments: true,
 transactionType: true
 }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Remove the attachment from the specified category
 const attachments = (transaction.attachments as unknown as AttachmentsRecord) || {}
 
 // If the attachment has an S3 key, we should delete it from S3
 const s3Service = getS3Service()
 const recordToDelete = attachments[category]
 if (recordToDelete?.s3Key) {
 const primaryKey = recordToDelete.s3Key
 await s3Service.deleteFile(primaryKey)

 // Also sweep any other files for this transaction/category prefix (to avoid clutter)
 const prefix = deriveCategoryPrefix(primaryKey, category)
 if (prefix) {
 const keys = await s3Service.listFiles(prefix)
 for (const key of keys) {
 if (key !== primaryKey) {
 await s3Service.deleteFile(key)
 }
 }
 }
 }

 // Remove the category from attachments
 delete attachments[category]

 // Check if transaction should be un-reconciled after deletion
 const hasAllRequiredDocs = checkIfAllRequiredDocsPresent(transaction.transactionType, attachments)
 
 // Check reconciliation status after deletion

 // Update the transaction
 await prisma.inventoryTransaction.update({
 where: { id },
 data: {
 attachments: attachments as unknown as Prisma.InputJsonValue,
 // Un-reconcile if missing required docs
 isReconciled: hasAllRequiredDocs
 }
 })

 return NextResponse.json({ 
 success: true,
 message: 'Attachment deleted successfully',
 reconciled: hasAllRequiredDocs
 })
 } catch (_error) {
 // console.error('Delete attachment error:', _error)
 return NextResponse.json({ 
 error: 'Failed to delete attachment',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})

function deriveCategoryPrefix(s3Key: string, category: string): string | null {
 if (!s3Key) return null
 const lastSlash = s3Key.lastIndexOf('/')
 if (lastSlash === -1) return null

 // Keys are stored as: transactions/YYYY/MM/{transactionId}/{category}_<timestamp>_...
 const basePath = s3Key.slice(0, lastSlash + 1)
 const normalizedCategory = category.trim().toLowerCase()
 return `${basePath}${normalizedCategory}_`
}

// Helper function to check if all required documents are present
function checkIfAllRequiredDocsPresent(
 transactionType: string,
 attachments: AttachmentsRecord | AttachmentInput[] | null
): boolean {
 if (!attachments) return false

 // Define required documents for each transaction type
 const requiredDocs: Record<string, string[]> = {
 RECEIVE: [
 'commercial_invoice',
 'bill_of_lading', 
 'packing_list',
 'grn',
 'cube_master',
 'transaction_certificate',
 'custom_declaration'
 ],
 SHIP: [
 'packing_list',
 'grn'
 ],
 ADJUST_IN: ['proof_of_pickup'],
 ADJUST_OUT: ['proof_of_pickup']
 }
 
 const required = requiredDocs[transactionType]
 if (!required) return true // No requirements defined, consider reconciled
 
 const attachmentSynonyms: Record<string, string[]> = {}

 const checkRecord = (record: AttachmentsRecord): boolean => {
 for (const docKey of required) {
 const aliases = attachmentSynonyms[docKey] ?? [docKey]
 const possibleKeys = aliases.flatMap(alias => {
 const camelCase = alias.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase())
 return [alias, camelCase]
 })

 const recordEntry = possibleKeys.reduce<AttachmentData | undefined>((found, key) => {
 if (found) return found
 return record[key]
 }, undefined)
 if (!recordEntry || !recordEntry.s3Key) {
 return false
 }
 }
 return true
 }

 if (Array.isArray(attachments)) {
 const recordFromArray: AttachmentsRecord = {}
 for (const item of attachments as AttachmentInput[]) {
 const category = (item.category || 'general').toString()
 if (item.s3Key) {
 recordFromArray[category] = {
 fileName: item.fileName || item.name || category,
 uploadedAt: item.uploadedAt || new Date().toISOString(),
 uploadedBy: item.uploadedBy || 'unknown',
 s3Key: item.s3Key,
 s3Url: item.s3Url || '',
 size: item.size || 0,
 contentType: item.contentType || 'application/octet-stream'
 }
 }
 }
 return checkRecord(recordFromArray)
 }

 return checkRecord(attachments)
}
