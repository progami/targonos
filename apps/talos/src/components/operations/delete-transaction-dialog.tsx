'use client'

import { AlertTriangle, X, Loader2, Package2, Truck } from '@/lib/lucide-icons'
import { formatDateGMT } from '@/lib/date-utils'

interface DeleteTransactionDialogProps {
 isOpen: boolean
 onClose: () => void
 onConfirm: () => void
 transaction: {
 id: string
 transactionId: string
 transactionType: string
 skuCode: string
 cartonsIn: number
 cartonsOut: number
 lineItems?: Array<{
 cartonsIn: number
 cartonsOut: number
 sku?: { skuCode: string }
 batchLot?: string
 }>
 }
 validation: {
 canDelete: boolean
 canEdit: boolean
 reason: string | null
 details?: {
 dependentTransactions?: Array<{
 id: string
 transactionType: string
 transactionDate: string
 quantity: number
 }>
 currentInventory?: {
 skuCode: string
 batchLot: string
 quantity: number
 allocated: number
 available: number
 }
 }
 }
 isDeleting: boolean
}

export function DeleteTransactionDialog({
 isOpen,
 onClose,
 onConfirm,
 transaction,
 validation,
 isDeleting
}: DeleteTransactionDialogProps) {
 if (!isOpen) return null

 const isReceive = transaction?.transactionType === 'RECEIVE'
 const isShip = transaction?.transactionType === 'SHIP'
 const lineItem = transaction?.lineItems?.[0]
 const quantity = isReceive ? lineItem?.cartonsIn : lineItem?.cartonsOut

 return (
 <div className="fixed inset-0 z-50 overflow-y-auto">
 <div className="flex min-h-full items-center justify-center p-4">
 <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
 
 <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
 {/* Header */}
<div className="bg-red-50 dark:bg-red-900/30 px-6 py-4 border-b border-red-200 dark:border-red-800">
  <div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
  <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
  <div>
  <h2 className="text-lg font-semibold text-foreground">
  Confirm Delete Transaction
  </h2>
  <p className="text-sm text-muted-foreground mt-0.5">
 {isReceive ? 'Inbound' : isShip ? 'Outbound' : 'Adjustment'} • {quantity} cartons
 </p>
 </div>
 </div>
 <button
 onClick={onClose}
 className="text-slate-400 hover:text-slate-500"
 disabled={isDeleting}
 >
 <X className="h-5 w-5" />
 </button>
 </div>
 </div>

 {/* Content */}
 <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
 {/* Quick Summary of what will happen */}
 {validation.canDelete ? (
<div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
  <h3 className="font-medium text-sm text-green-900 dark:text-green-300 mb-2">What will happen:</h3>
  <ul className="space-y-1 text-sm text-green-700 dark:text-green-400">
 {isReceive && (
 <>
 <li>• Remove {quantity} cartons of {lineItem?.sku?.skuCode} (Batch: {lineItem?.batchLot}) from inventory</li>
 <li>• Delete transaction record</li>
 <li>• This action cannot be undone</li>
 </>
 )}
 {isShip && (
 <>
 <li>• Return {quantity} cartons back to available inventory</li>
 <li>• Delete shipment record</li>
 <li>• The inventory will be available for new shipments</li>
 </>
 )}
 </ul>
 </div>
 ) : (
<div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
  <h3 className="font-medium text-sm text-red-900 dark:text-red-300 mb-2">Why you can't delete this:</h3>
  <p className="text-sm text-red-700 dark:text-red-400">{validation.reason}</p>
 </div>
 )}


 {/* Dependent Transactions */}
 {validation.details?.dependentTransactions && validation.details.dependentTransactions.length > 0 && (
<div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
  <h3 className="font-medium text-sm text-amber-900 dark:text-amber-300 mb-3">
  Dependent Transactions ({validation.details.dependentTransactions.length})
  </h3>
  <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
 The following transactions depend on this inventory and must be deleted first:
 </p>
 
 {validation.details.dependentTransactions.length > 5 ? (
 // Summarized view for many transactions
 <div className="space-y-3">
 {/* Summary Stats */}
<div className="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-3">
  <div className="grid grid-cols-2 gap-4 text-sm">
  <div>
  <span className="text-muted-foreground">Total Dependent Transactions:</span>
  <p className="font-semibold text-lg text-foreground">{validation.details.dependentTransactions.length}</p>
  </div>
  <div>
  <span className="text-muted-foreground">Total Quantity Affected:</span>
  <p className="font-semibold text-lg text-foreground">
 {validation.details.dependentTransactions.reduce((sum, t) => sum + t.quantity, 0)} cartons
 </p>
 </div>
 </div>
 </div>

 {/* Transaction Type Breakdown */}
<div className="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-3">
  <p className="text-xs font-medium text-foreground mb-2">By Transaction Type:</p>
 <div className="space-y-1">
 {Object.entries(
 validation.details.dependentTransactions.reduce((acc, t) => {
 acc[t.transactionType] = (acc[t.transactionType] || 0) + 1
 return acc
 }, {} as Record<string, number>)
 ).map(([type, count]) => (
 <div key={type} className="flex justify-between text-sm">
 <span className="flex items-center gap-2">
 {type === 'SHIP' ? (
 <Truck className="h-3 w-3 text-cyan-600" />
 ) : (
 <Package2 className="h-3 w-3 text-slate-600" />
 )}
 {type}
 </span>
 <span className="font-medium">{count} transactions</span>
 </div>
 ))}
 </div>
 </div>

 {/* Show first 3 and last 2 transactions */}
 <div className="space-y-2">
 <p className="text-xs font-medium text-foreground">Recent Transactions:</p>
 {validation.details.dependentTransactions.slice(0, 3).map((dep) => (
<div key={dep.id} className="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-2">
  <div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
  {dep.transactionType === 'SHIP' ? (
  <Truck className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
  ) : (
  <Package2 className="h-3 w-3 text-slate-600 dark:text-slate-400" />
  )}
  <span className="font-medium text-xs text-foreground">ID: {dep.id.slice(0, 8)}...</span>
  </div>
  <span className="text-xs text-muted-foreground">
  {dep.quantity} cartons
  </span>
  </div>
  </div>
  ))}
  
  {validation.details.dependentTransactions.length > 5 && (
  <>
  <div className="text-center text-xs text-muted-foreground py-1">
 ... {validation.details.dependentTransactions.length - 5} more transactions ...
 </div>
 
{validation.details.dependentTransactions.slice(-2).map((dep) => (
  <div key={dep.id} className="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-2">
  <div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
  {dep.transactionType === 'SHIP' ? (
  <Truck className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
  ) : (
  <Package2 className="h-3 w-3 text-slate-600 dark:text-slate-400" />
  )}
  <span className="font-medium text-xs text-foreground">ID: {dep.id.slice(0, 8)}...</span>
  </div>
  <span className="text-xs text-muted-foreground">
  {dep.quantity} cartons
  </span>
  </div>
  </div>
  ))}
 </>
 )}
 </div>

 {/* Export Option */}
<div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800 rounded p-2">
  <p className="text-xs text-cyan-700 dark:text-cyan-300">
 💡 Tip: Export the full list of dependent transactions to CSV for bulk processing
 </p>
 </div>
 </div>
 ) : (
 // Detailed view for few transactions (5 or less)
 <div className="space-y-2">
{validation.details.dependentTransactions.map((dep) => (
  <div key={dep.id} className="bg-white dark:bg-slate-800 rounded border border-amber-200 dark:border-amber-800 p-3">
  <div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
  {dep.transactionType === 'SHIP' ? (
  <Truck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
  ) : (
  <Package2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
  )}
  <span className="font-medium text-sm text-foreground">ID: {dep.id.slice(0, 8)}...</span>
  </div>
  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
  dep.transactionType === 'SHIP' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300'
  }`}>
  {dep.transactionType}
  </span>
  </div>
  <div className="mt-2 text-xs text-muted-foreground grid grid-cols-2 gap-2">
 <span>Date: {formatDateGMT(dep.transactionDate)}</span>
 <span>Quantity: {dep.quantity} cartons</span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}


 </div>

 {/* Footer */}
<div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
  <button
  onClick={onClose}
  disabled={isDeleting}
  className="px-4 py-2 text-sm font-medium text-foreground bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
  >
 Cancel
 </button>
 {validation.canDelete && (
 <button
 onClick={onConfirm}
 disabled={isDeleting}
 className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
 >
 {isDeleting ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin" />
 Deleting...
 </>
 ) : (
 <>
 <AlertTriangle className="h-4 w-4" />
 Delete Transaction
 </>
 )}
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}
