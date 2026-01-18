import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma, TransactionType } from '@targon/prisma-talos'
import { parseLocalDate } from '@/lib/utils/date-helpers'
import { aggregateInventoryTransactions } from '@targon/ledger'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (request, session) => {
 try {

 const prisma = await getTenantPrisma()
 const searchParams = request.nextUrl.searchParams
 const date = searchParams.get('date')
 const warehouse = searchParams.get('warehouse')
 const transactionType = searchParams.get('transactionType')
 const startDate = searchParams.get('startDate')
 const endDate = searchParams.get('endDate')
 const limit = searchParams.get('limit')
 const offset = searchParams.get('offset')

 // Build where clause for ledger filters
 const where: Prisma.InventoryTransactionWhereInput = {}

 let warehouseCodeFilter: string | undefined

 if (session.user.role === 'staff' && session.user.warehouseId) {
 const staffWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true },
 })
 warehouseCodeFilter = staffWarehouse?.code
 } else if (warehouse) {
 const warehouseById = await prisma.warehouse.findUnique({
 where: { id: warehouse },
 select: { code: true },
 })
 warehouseCodeFilter = warehouseById?.code ?? warehouse
 }

 if (warehouseCodeFilter) {
 where.warehouseCode = warehouseCodeFilter
 }

 if (
 transactionType &&
 ['RECEIVE', 'SHIP', 'ADJUST_IN', 'ADJUST_OUT', 'TRANSFER'].includes(transactionType)
 ) {
 where.transactionType = transactionType as TransactionType
 }

 // Date filtering
 if (date) {
 // Point-in-time view - get all transactions up to this date
 const pointInTime = parseLocalDate(date)
 pointInTime.setHours(23, 59, 59, 999)
 where.transactionDate = { lte: pointInTime }
 } else {
 // Live view with optional date range
 if (startDate || endDate) {
 where.transactionDate = {}
 if (startDate) {
 where.transactionDate.gte = parseLocalDate(startDate)
 }
 if (endDate) {
 const endDateTime = parseLocalDate(endDate)
 endDateTime.setHours(23, 59, 59, 999)
 where.transactionDate.lte = endDateTime
 }
 }
 }
 
 const take = limit ? parseInt(limit, 10) : 50
 const skipValue = offset ? parseInt(offset, 10) : 0

 const transactions = await prisma.inventoryTransaction.findMany({
 where,
 include: {
 costLedger: true
 },
 orderBy: [
 { transactionDate: 'desc' as const },
 { createdAt: 'desc' as const }
 ],
 take,
 skip: skipValue,
 })

 // If point-in-time view, calculate running balances and inventory summary
 if (date) {
 // For point-in-time, we need ALL transactions up to that date (no pagination)
 const allTransactions = await prisma.inventoryTransaction.findMany({
 where,
 include: {
 costLedger: true
 },
 orderBy: [
 { transactionDate: 'asc' },
 { createdAt: 'asc' }
 ]
 })

 // Group transactions by warehouse + sku + batch
 const balances = new Map<string, number>()
 const skuInfo = new Map<string, {
 warehouse: string
 warehouseCode: string
 skuCode: string
 description: string
 batchLot: string
 }>()
 
 // Calculate running balances
 const transactionsWithBalance = allTransactions.map(transaction => {
 const key = `${transaction.warehouseCode}-${transaction.skuCode}-${transaction.batchLot}`
 const currentBalance = balances.get(key) || 0
 const newBalance = currentBalance + transaction.cartonsIn - transaction.cartonsOut
 balances.set(key, newBalance)
 
 // Store SKU info for summary
 skuInfo.set(key, {
 warehouse: transaction.warehouseName,
 warehouseCode: transaction.warehouseCode,
 skuCode: transaction.skuCode,
 description: transaction.skuDescription,
 batchLot: transaction.batchLot
 })
 
 // Process attachments efficiently
 const processedAttachments = processAttachments(transaction.attachments)
 
 return {
 ...transaction,
 pickupDate: transaction.pickupDate,
 isReconciled: transaction.isReconciled,
 runningBalance: newBalance,
 notes: processedAttachments.notes,
 attachments: processedAttachments.docs,
 // Add nested objects for backward compatibility
 warehouse: {
 id: '',
 code: transaction.warehouseCode,
 name: transaction.warehouseName
 },
 sku: {
 id: '',
 skuCode: transaction.skuCode,
 description: transaction.skuDescription,
 unitsPerCarton: transaction.unitsPerCarton
 },
 createdBy: {
 id: transaction.createdById,
 fullName: transaction.createdByName
 }
 }
 })

 // Create inventory summary
 const aggregated = aggregateInventoryTransactions(allTransactions, { includeZeroStock: true })

 const inventorySummary = aggregated.balances
 .filter(balance => balance.currentCartons > 0)
 .map(balance => ({
 warehouse: balance.warehouseName,
 warehouseCode: balance.warehouseCode,
 skuCode: balance.skuCode,
 description: balance.skuDescription,
 batchLot: balance.batchLot,
 currentCartons: balance.currentCartons,
 currentPallets: balance.currentPallets,
 }))
 .sort((a, b) => {
 if (a.warehouse !== b.warehouse) return a.warehouse.localeCompare(b.warehouse)
 if (a.skuCode !== b.skuCode) return a.skuCode.localeCompare(b.skuCode)
 return a.batchLot.localeCompare(b.batchLot)
 })

 return NextResponse.json({
 transactions: transactionsWithBalance,
 inventorySummary
 })
 }

 // Live view - process attachments for each transaction
 const transactionsWithAttachments = transactions.map(transaction => {
 const processedAttachments = processAttachments(transaction.attachments)
 
 return {
 ...transaction,
 notes: processedAttachments.notes,
 attachments: processedAttachments.docs,
 // Add nested objects for backward compatibility
 warehouse: {
 id: '',
 code: transaction.warehouseCode,
 name: transaction.warehouseName
 },
 sku: {
 id: '',
 skuCode: transaction.skuCode,
 description: transaction.skuDescription,
 unitsPerCarton: transaction.unitsPerCarton
 },
 createdBy: {
 id: transaction.createdById,
 fullName: transaction.createdByName
 }
 }
 })
 
 return NextResponse.json({
 transactions: transactionsWithAttachments
 })
 } catch (_error) {
 // console.error('Ledger error:', error)
 return NextResponse.json({ 
 error: 'Failed to fetch ledger data',
 details: _error instanceof Error ? _error.message : 'Unknown error'
 }, { status: 500 })
 }
})

// Helper function to process attachments efficiently
type ProcessedAttachmentResult = {
 notes: string | null
 docs: Record<string, unknown>
}

function processAttachments(attachments: unknown): ProcessedAttachmentResult {
 if (!attachments) {
 return { notes: null, docs: {} }
 }

 if (Array.isArray(attachments)) {
 const docs: Record<string, unknown> = {}
 let notes: string | null = null

 for (const entry of attachments) {
 if (!entry || typeof entry !== 'object') {
 continue
 }

 const record = entry as Record<string, unknown>
 const type = typeof record.type === 'string' ? record.type : undefined

 if (type === 'notes' && typeof record.content === 'string') {
 notes = record.content
 } else if (type) {
 docs[type] = record
 }
 }

 return { notes, docs }
 }

 if (typeof attachments === 'object') {
 const record = attachments as Record<string, unknown>
 const notes = typeof record.notes === 'string' ? record.notes : null
 
 const docs: Record<string, unknown> = {}
 for (const [key, value] of Object.entries(record)) {
 if (key === 'notes') {
 continue
 }
 docs[key] = value
 }
 
 return { notes, docs }
 }

 return { notes: null, docs: {} }
}
