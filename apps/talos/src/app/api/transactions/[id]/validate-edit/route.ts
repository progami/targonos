import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'

export const dynamic = 'force-dynamic'

export const GET = withAuthAndParams(async (request, params, session) => {
 try {
 const { id } = params as { id: string }

 const prisma = await getTenantPrisma()
 // Get the transaction
 const transaction = await prisma.inventoryTransaction.findUnique({
 where: { id }
 })

 if (!transaction) {
 return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
 }

 // Check if user has access to this warehouse
 if (session.user.role === 'staff' && session.user.warehouseId) {
 const userWarehouse = await prisma.warehouse.findUnique({
 where: { id: session.user.warehouseId },
 select: { code: true }
 })
 if (userWarehouse && userWarehouse.code !== transaction.warehouseCode) {
 return NextResponse.json({ error: 'Access denied' }, { status: 403 })
 }
 }

 const result: {
 canEdit: boolean;
 canDelete: boolean;
 reason: string | null;
 details: {
 currentInventory?: {
 skuCode: string;
 lotRef: string;
 quantity: number;
 allocated: number;
 available: number;
 };
 dependentTransactions?: Array<{
 id: string;
 transactionType: string;
 transactionDate: Date;
 quantity: number;
 }>;
 };
 } = {
 canEdit: true,
 canDelete: true,
 reason: null as string | null,
 details: {}
 }

 // Calculate current inventory status from transactions
 const allTransactionsForInventory = await prisma.inventoryTransaction.findMany({
 where: {
 skuCode: transaction.skuCode,
 lotRef: transaction.lotRef,
 warehouseCode: transaction.warehouseCode
 },
 orderBy: {
 transactionDate: 'asc'
 }
 })

 // Calculate current inventory
 let totalIn = 0
 let totalOut = 0
 for (const t of allTransactionsForInventory) {
 totalIn += t.cartonsIn
 totalOut += t.cartonsOut
 }
 const currentQuantity = totalIn - totalOut

 result.details.currentInventory = {
 skuCode: transaction.skuCode,
 lotRef: transaction.lotRef,
 quantity: currentQuantity,
 allocated: 0, // We don't track allocations in this simple system
 available: currentQuantity
 }

 // For RECEIVE transactions, check if any items have been shipped
 if (transaction.transactionType === 'RECEIVE') {
 // Find any SHIP or ADJUST_OUT transactions for this SKU/batch/warehouse combo
 const outgoingTransactions = await prisma.inventoryTransaction.findMany({
 where: {
 skuCode: transaction.skuCode,
 lotRef: transaction.lotRef,
 warehouseCode: transaction.warehouseCode,
 transactionType: { in: ['SHIP', 'ADJUST_OUT'] },
 transactionDate: {
 gte: transaction.transactionDate
 }
 },
 orderBy: {
 transactionDate: 'asc'
 }
 })

 if (outgoingTransactions.length > 0) {
 const totalOut = outgoingTransactions.reduce((sum, t) => sum + t.cartonsOut, 0)
 result.canDelete = false // Never allow delete if goods have moved
 result.canEdit = true // Allow editing non-quantity fields (will be enforced in edit endpoint)
 result.reason = `Cannot delete: ${totalOut} cartons from this lot have been shipped/adjusted. You must delete the ${outgoingTransactions.length} dependent transaction(s) first.`
 
 result.details.dependentTransactions = outgoingTransactions.map(t => ({
 id: t.id,
 transactionType: t.transactionType,
 transactionDate: t.transactionDate,
 quantity: t.cartonsOut
 }))
 }
 }

 // For SHIP or ADJUST_OUT transactions, check if deletion would create negative inventory
 if (transaction.transactionType === 'SHIP' || transaction.transactionType === 'ADJUST_OUT') {
 // Get all transactions for this SKU/batch/warehouse in chronological order
 const allTransactions = await prisma.inventoryTransaction.findMany({
 where: {
 skuCode: transaction.skuCode,
 lotRef: transaction.lotRef,
 warehouseCode: transaction.warehouseCode
 },
 orderBy: [
 { transactionDate: 'asc' },
 { createdAt: 'asc' }
 ]
 })

 // Simulate inventory levels without this transaction
 let balance = 0
 let _wouldGoNegative = false
 
 for (const t of allTransactions) {
 // Skip the transaction we're considering deleting
 if (t.id === id) continue
 
 balance += t.cartonsIn - t.cartonsOut
 
 // Check if balance goes negative at any point in time
 if (balance < 0) {
 _wouldGoNegative = true
 result.canDelete = false
 result.reason = `Cannot delete this ${transaction.transactionType.toLowerCase()}. It would create negative inventory in the historical record.`
 break
 }
 }
 }


 return NextResponse.json(result)
 } catch (_error) {
 // console.error('Error validating transaction edit:', _error)
 return NextResponse.json(
 { error: 'Failed to validate transaction' },
 { status: 500 }
 )
 }
})
