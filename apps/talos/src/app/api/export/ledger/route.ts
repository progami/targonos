import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma, TransactionType } from '@targon/prisma-talos'
import * as XLSX from 'xlsx'
import { generateExportConfig, applyExportConfig } from '@/lib/dynamic-export'
import { inventoryTransactionConfig } from '@/lib/export-configurations'
import { getS3Service } from '@/services/s3.service'
import { formatDateGMT } from '@/lib/date-utils'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow up to 60 seconds for large exports

export const GET = withAuth(async (request, session) => {
 try {
 const prisma = await getTenantPrisma()
 const searchParams = request.nextUrl.searchParams
 const viewMode = searchParams.get('viewMode') || 'live'
 const date = searchParams.get('date')
 const warehouse = searchParams.get('warehouse')
 const transactionType = searchParams.get('transactionType')
 const startDate = searchParams.get('startDate')
 const endDate = searchParams.get('endDate')
 const skuCode = searchParams.get('skuCode')
 const batchLot = searchParams.get('batchLot')
 const fullExport = searchParams.get('full') === 'true'

 // Build where clause
 const where: Prisma.InventoryTransactionWhereInput = {}

 const warehouseIdFilter = (() => {
 if (session.user.role === 'staff' && session.user.warehouseId) {
 return session.user.warehouseId
 }
 return warehouse
 })()

 const warehouseCode = await (async () => {
 if (!warehouseIdFilter) return undefined

 const warehouseRecord = await prisma.warehouse.findUnique({
 where: { id: warehouseIdFilter }
 })

 if (warehouseRecord) {
 return warehouseRecord.code
 }

 // Fallback: assume caller passed a warehouse code directly
 return warehouseIdFilter
 })()

 const applyWarehouseFilter = (code: string | undefined) => {
 if (code) {
 where.warehouseCode = code
 }
 }

 if (!fullExport) {
 applyWarehouseFilter(warehouseCode)

 if (transactionType && ['RECEIVE', 'SHIP', 'ADJUST_IN', 'ADJUST_OUT', 'TRANSFER'].includes(transactionType)) {
 where.transactionType = transactionType as TransactionType
 }

 if (skuCode) {
 where.skuCode = {
 contains: skuCode,
 mode: 'insensitive'
 }
 }

 if (batchLot) {
 where.batchLot = {
 contains: batchLot,
 mode: 'insensitive'
 }
 }

 // Date filtering
 if (viewMode === 'point-in-time' && date) {
 const pointInTime = new Date(date)
 pointInTime.setHours(23, 59, 59, 999)
 where.transactionDate = { lte: pointInTime }
 } else if (startDate || endDate) {
 where.transactionDate = {}
 if (startDate) {
 where.transactionDate.gte = new Date(startDate)
 }
 if (endDate) {
 const endDateTime = new Date(endDate)
 endDateTime.setHours(23, 59, 59, 999)
 where.transactionDate.lte = endDateTime
 }
 }
 } else {
 // For full export, only apply warehouse restriction for staff users
 if (session.user.role === 'staff') {
 applyWarehouseFilter(warehouseCode)
 }
 }

 // Fetch transactions
 const transactions = await prisma.inventoryTransaction.findMany({
 where,
 orderBy: [
 { transactionDate: 'asc' },
 { createdAt: 'asc' }
 ]
 })

 // Create workbook
 const wb = XLSX.utils.book_new()

 // Use dynamic export configuration
 const fieldConfigs = generateExportConfig('InventoryTransaction', inventoryTransactionConfig)
 const ledgerData = applyExportConfig(transactions, fieldConfigs)

 let ledgerSheet
 
 if (ledgerData.length > 0) {
 // Normal case - data exists
 ledgerSheet = XLSX.utils.json_to_sheet(ledgerData)
 
 // Auto-size columns
 const colWidths = Object.keys(ledgerData[0] || {}).map(key => ({
 wch: Math.max(
 key.length,
 ...ledgerData.slice(0, 100).map(row => String(row[key] || '').length)
 ) + 2
 }))
 ledgerSheet['!cols'] = colWidths
 } else {
 // Empty data - create headers manually
 const headers = fieldConfigs.map(config => config.columnName || config.fieldName)
 const headerRow = headers.reduce((acc, header, index) => {
 const col = XLSX.utils.encode_col(index)
 acc[`${col}1`] = { t: 's', v: header }
 return acc
 }, {} as Record<string, unknown>)
 
 ledgerSheet = {
 ...headerRow,
 '!ref': `A1:${XLSX.utils.encode_col(headers.length - 1)}1`,
 '!cols': headers.map(header => ({ wch: Math.max(header.length + 2, 15) }))
 }
 }
 
 XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Inventory Ledger')

 // If point-in-time, add inventory summary sheet
 if (viewMode === 'point-in-time' && date) {
 // Calculate inventory balances
 type BalanceSnapshot = {
 warehouseName: string
 warehouseCode: string
 skuCode: string
 skuDescription: string
 batchLot: string
 currentCartons: number
 lastActivity: Date
 }

 const balances = new Map<string, BalanceSnapshot>()
 
 for (const transaction of transactions) {
 const key = `${transaction.warehouseCode}-${transaction.skuCode}-${transaction.batchLot}`
 const current = balances.get(key) || {
 warehouseName: transaction.warehouseName,
 warehouseCode: transaction.warehouseCode,
 skuCode: transaction.skuCode,
 skuDescription: transaction.skuDescription,
 batchLot: transaction.batchLot,
 currentCartons: 0,
 lastActivity: transaction.transactionDate
 }

 current.currentCartons += transaction.cartonsIn - transaction.cartonsOut
 current.lastActivity = transaction.transactionDate
 balances.set(key, current)
 }

 // Convert to array and filter out zero balances
 const summaryData = Array.from(balances.values())
 .filter(item => item.currentCartons > 0)
 .sort((a, b) => {
 if (a.warehouseName !== b.warehouseName) return a.warehouseName.localeCompare(b.warehouseName)
 if (a.skuCode !== b.skuCode) return a.skuCode.localeCompare(b.skuCode)
 return a.batchLot.localeCompare(b.batchLot)
 })
 .map(item => ({
 'Warehouse': item.warehouseName,
 'SKU Code': item.skuCode,
 'Description': item.skuDescription,
 'Batch': item.batchLot,
 'Cartons': item.currentCartons,
 'Last Activity': formatDateGMT(item.lastActivity)
 }))

 const summarySheet = XLSX.utils.json_to_sheet(summaryData)
 XLSX.utils.book_append_sheet(wb, summarySheet, `Inventory as of ${formatDateGMT(date)}`)
 }

 // Generate buffer
 const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
 
 // Create filename
 const dateStr = new Date().toISOString().split('T')[0]
 const filename = viewMode === 'point-in-time' 
 ? `inventory_ledger_as_of_${date}.xlsx`
 : fullExport 
 ? `inventory_ledger_full_export_${dateStr}.xlsx`
 : `inventory_ledger_${dateStr}.xlsx`

 // Upload to S3 for temporary storage
 const s3Service = getS3Service()
 const s3Key = s3Service.generateKey(
 { 
 type: 'export-temp', 
 userId: session.user.id, 
 exportType: 'inventory-ledger' 
 },
 filename
 )
 
 // Upload with 24 hour expiration
 const expiresAt = new Date()
 expiresAt.setHours(expiresAt.getHours() + 24)
 
 await s3Service.uploadFile(buf, s3Key, {
 contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 metadata: {
 exportType: 'inventory-ledger',
 userId: session.user.id,
 filename: filename,
 viewMode: viewMode,
 },
 expiresAt: expiresAt,
 })
 
 // Get presigned URL for download
 const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', {
 responseContentDisposition: `attachment; filename="${filename}"`,
 expiresIn: 3600, // 1 hour
 })

 // Return URL instead of file directly
 return NextResponse.json({
 success: true,
 downloadUrl: presignedUrl,
 filename: filename,
 expiresIn: 3600,
 })
 } catch (_error) {
 // console.error('Export error:', error)
 return NextResponse.json({ 
 error: 'Failed to export ledger data',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})
