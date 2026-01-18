'use client'

import Link from 'next/link'
import { Building } from '@/lib/lucide-icons'

interface WarehouseInventoryProps {
  warehouses: Array<{
    code: string
    name: string
    cartons: number
  }>
}

export function WarehouseInventory({ warehouses }: WarehouseInventoryProps) {
  const totalCartons = warehouses.reduce((sum, w) => sum + w.cartons, 0)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Inventory by Warehouse</h3>
        </div>
        <Link
          href="/operations/inventory"
          className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
        >
          View all
        </Link>
      </div>

      {warehouses.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No inventory data available</p>
      ) : (
        <div className="space-y-3">
          {warehouses.map((warehouse) => {
            const percentage = totalCartons > 0 ? (warehouse.cartons / totalCartons) * 100 : 0
            return (
              <div key={warehouse.code}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{warehouse.name}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {warehouse.cartons.toLocaleString()} cartons
                  </span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 dark:bg-cyan-400 rounded-full transition-all"
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Total */}
      {warehouses.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total</span>
          <span className="text-base font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
            {totalCartons.toLocaleString()} cartons
          </span>
        </div>
      )}
    </div>
  )
}
