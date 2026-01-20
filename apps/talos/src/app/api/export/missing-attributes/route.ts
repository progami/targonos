import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import * as XLSX from 'xlsx'
import { getS3Service } from '@/services/s3.service'
import { formatDateGMT } from '@/lib/date-utils'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for large exports

export const GET = withAuth(async (_request, session) => {
 try {
 const prisma = await getTenantPrisma()
 // Fetch all transactions (they now have snapshot data)
 const transactions = await prisma.inventoryTransaction.findMany({
 orderBy: {
 transactionDate: 'desc'
 }
 })

 // Analyze missing attributes for each transaction
 const missingData = transactions.map(transaction => {
 const attachments = (transaction.attachments as Record<string, unknown>) || {}
 const missingFields: string[] = []
 const missingDocs: string[] = []
 
 // Document checks - check if each document type exists
 const hasPackingList = attachments.packingList || attachments.packing_list ? 'Yes' : 'No'
 const hasCommercialInvoice = attachments.commercialInvoice || attachments.commercial_invoice ? 'Yes' : 'No'
 const hasBillOfLading = attachments.billOfLading || attachments.bill_of_lading ? 'Yes' : 'No'
 const hasDeliveryNote =
 attachments.movementNote || attachments.movement_note || attachments.deliveryNote || attachments.delivery_note
 ? 'Yes'
 : 'No'
 const hasCubeMaster = attachments.cubeMaster || attachments.cube_master ? 'Yes' : 'No'
 const hasTransactionCertificate = attachments.transactionCertificate || attachments.transaction_certificate ? 'Yes' : 'No'
 const hasCustomDeclaration = attachments.customDeclaration || attachments.custom_declaration ? 'Yes' : 'No'
 const hasProofOfPickup = attachments.proofOfPickup || attachments.proof_of_pickup ? 'Yes' : 'No'
 
 // Configurable document requirements based on transaction type
 const REQUIRED_DOCUMENTS = {
 RECEIVE: [
 { check: hasPackingList === 'No', label: 'Packing List' },
 { check: hasCommercialInvoice === 'No', label: 'Commercial Invoice' }
 ],
 SHIP: [
 { check: hasPackingList === 'No', label: 'Packing List' },
 { check: hasDeliveryNote === 'No', label: 'Movement Note' }
 ],
 ADJUST_IN: [
 { check: hasProofOfPickup === 'No', label: 'Proof of Pickup' }
 ],
 ADJUST_OUT: [
 { check: hasProofOfPickup === 'No', label: 'Proof of Pickup' }
 ]
 }

 // Check for missing documents
 const requiredDocs = REQUIRED_DOCUMENTS[transaction.transactionType as keyof typeof REQUIRED_DOCUMENTS]
 if (requiredDocs) {
 requiredDocs.forEach(doc => {
 if (doc.check) missingDocs.push(doc.label)
 })
 }

 // Check for missing fields based on transaction type and context
 if (transaction.transactionType === 'RECEIVE') {
 if (!transaction.shipName && (transaction.referenceId?.includes('OOCL') || transaction.referenceId?.includes('MSC'))) {
 missingFields.push('Ship Name')
 }
 if (!transaction.trackingNumber) {
 missingFields.push('Tracking Number')
 }
 }
 
 if (transaction.transactionType === 'SHIP') {
 if (!transaction.trackingNumber && transaction.referenceId?.includes('FBA')) {
 missingFields.push('FBA Tracking Number')
 }
 }
 
 const totalMissing = missingFields.length + missingDocs.length
 
 return {
 // Transaction details
 transactionDate: transaction.transactionDate,
 transactionId: transaction.id,
 transactionType: transaction.transactionType,
 isReconciled: transaction.isReconciled ? 'Yes' : 'No',
 warehouse: transaction.warehouseName,
 sku: transaction.skuCode,
 skuDescription: transaction.skuDescription,
 batchLot: transaction.batchLot,
 referenceId: transaction.referenceId || '',
 
 // Quantities
 cartonsIn: transaction.cartonsIn,
 cartonsOut: transaction.cartonsOut,
 storagePalletsIn: transaction.storagePalletsIn,
 shippingPalletsOut: transaction.shippingPalletsOut,
 
 // Shipping information
 shipName: transaction.shipName || '',
 trackingNumber: transaction.trackingNumber || '',
 pickupDate: transaction.pickupDate,
 
 // Document attachment columns (Yes/No)
 hasPackingList,
 hasCommercialInvoice,
 hasBillOfLading,
 hasDeliveryNote,
 hasCubeMaster,
 hasTransactionCertificate,
 hasCustomDeclaration,
 hasProofOfPickup,
 
 // Missing field indicators
 missingShipName: missingFields.includes('Ship Name') ? 'Yes' : 'No',
 missingTrackingNumber: missingFields.includes('Tracking Number') || missingFields.includes('FBA Tracking Number') ? 'Yes' : 'No',
 missingModeOfTransport: missingFields.includes('Mode of Transport') ? 'Yes' : 'No',
 
 // Summary columns
 missingDocuments: missingDocs.join(', '),
 missingFields: missingFields.join(', '),
 totalMissingCount: totalMissing,
 
 // Metadata
 createdBy: transaction.createdByName,
 createdAt: transaction.createdAt
 }
 }).filter(t => t.totalMissingCount > 0)

 // Create Excel workbook
 const wb = XLSX.utils.book_new()

 // Summary sheet
 const summaryData = [
 ['Missing Attributes Report'],
 ['Generated:', formatDateGMT(new Date(), true)],
 [''],
 ['Total Transactions:', transactions.length],
 ['Transactions with Missing Attributes:', missingData.length],
 ['Completion Rate:', `${((transactions.length - missingData.length) / transactions.length * 100).toFixed(1)}%`],
 [''],
 ['Summary by Transaction Type:'],
 ['RECEIVE:', missingData.filter(t => t.transactionType === 'RECEIVE').length],
 ['SHIP:', missingData.filter(t => t.transactionType === 'SHIP').length],
 ['ADJUST_IN:', missingData.filter(t => t.transactionType === 'ADJUST_IN').length],
 ['ADJUST_OUT:', missingData.filter(t => t.transactionType === 'ADJUST_OUT').length],
 ['TRANSFER:', missingData.filter(t => t.transactionType === 'TRANSFER').length]
 ]
 const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
 XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

 // Missing attributes detail sheet with comprehensive columns
 const headers = [
 // Transaction Details
 'Transaction Date',
 'Transaction ID',
 'Type',
 'Reconciled',
 'Warehouse',
 'SKU Code',
 'SKU Description',
 'Batch',
 'Reference ID',
 
 // Quantities
 'Cartons In',
 'Cartons Out',
 'Storage Pallets In',
 'Shipping Pallets Out',
 
 // Shipping Information
 'Ship Name',
 'Tracking Number',
 'Mode of Transport',
 'Pickup Date',
 
 // Document Attachments (Yes/No)
 'Has Packing List',
 'Has Commercial Invoice',
 'Has Bill of Lading',
 'Has Movement Note',
 'Has Cube Master',
 'Has TC (GRS)',
 'Has CDS',
 'Has Proof of Pickup',
 
 // Missing Field Indicators
 'Missing Ship Name',
 'Missing Tracking Number',
 'Missing Mode of Transport',
 
 // Summary
 'Missing Documents',
 'Missing Fields',
 'Total Missing Count',
 
 // Metadata
 'Created By',
 'Created At'
 ]

 const data = [headers]
 missingData.forEach(row => {
 data.push([
 formatDateGMT(row.transactionDate, true),
 row.transactionId,
 row.transactionType,
 row.isReconciled,
 row.warehouse,
 row.sku,
 row.skuDescription,
 row.batchLot,
 row.referenceId,
 
 // Quantities
 String(row.cartonsIn || 0),
 String(row.cartonsOut || 0),
 String(row.storagePalletsIn || 0),
 String(row.shippingPalletsOut || 0),
 
 // Shipping Information
 row.shipName,
 row.trackingNumber,
 row.pickupDate ? formatDateGMT(row.pickupDate) : '',
 
 // Document Attachments
 row.hasPackingList,
 row.hasCommercialInvoice,
 row.hasBillOfLading,
 row.hasDeliveryNote,
 row.hasCubeMaster,
 row.hasTransactionCertificate,
 row.hasCustomDeclaration,
 row.hasProofOfPickup,
 
 // Missing Field Indicators
 row.missingShipName,
 row.missingTrackingNumber,
 row.missingModeOfTransport,
 
 // Summary
 row.missingDocuments,
 row.missingFields,
 String(row.totalMissingCount),
 
 // Metadata
 row.createdBy,
 formatDateGMT(row.createdAt)
 ])
 })

 const detailWs = XLSX.utils.aoa_to_sheet(data)
 
 // Auto-size columns
 const colWidths = headers.map((header, index) => {
 const maxLength = Math.max(
 header.length,
 ...data.slice(1).map(row => String(row[index] || '').length)
 )
 return { wch: Math.min(maxLength + 2, 30) }
 })
 detailWs['!cols'] = colWidths
 
 XLSX.utils.book_append_sheet(wb, detailWs, 'Missing Attributes')

 // Generate buffer
 const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
 const fileName = `missing-attributes-${new Date().toISOString().split('T')[0]}.xlsx`
 
 // Upload to S3 for temporary storage
 const s3Service = getS3Service()
 const s3Key = s3Service.generateKey(
 { 
 type: 'export-temp', 
 userId: session.user.id, 
 exportType: 'missing-attributes' 
 },
 fileName
 )
 
 // Upload with 24 hour expiration
 const expiresAt = new Date()
 expiresAt.setHours(expiresAt.getHours() + 24)
 
 await s3Service.uploadFile(buffer, s3Key, {
 contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 metadata: {
 exportType: 'missing-attributes',
 userId: session.user.id,
 filename: fileName,
 totalTransactions: String(transactions.length),
 transactionsWithMissing: String(missingData.length),
 },
 expiresAt: expiresAt,
 })
 
 // Get presigned URL for download
 const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', {
 responseContentDisposition: `attachment; filename="${fileName}"`,
 expiresIn: 3600, // 1 hour
 })

 // Return URL instead of file directly
 return NextResponse.json({
 success: true,
 downloadUrl: presignedUrl,
 filename: fileName,
 expiresIn: 3600,
 })
 } catch (_error) {
 // console.error('Export missing attributes error:', error)
 return NextResponse.json({ 
 error: 'Failed to export missing attributes',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})
