'use client'

import Link from 'next/link'
import { ChevronRight, FileText, Truck } from '@/lib/lucide-icons'

interface OrderPipelineProps {
  pipeline: {
    draft: number
    issued: number
    manufacturing: number
    inTransit: number
    atWarehouse: number
  }
  pendingFulfillmentOrders: number
}

const stages = [
  { key: 'draft', label: 'RFQ', filter: 'RFQ' },
  { key: 'issued', label: 'Issued', filter: 'ISSUED' },
  { key: 'manufacturing', label: 'Manufacturing', filter: 'MANUFACTURING' },
  { key: 'inTransit', label: 'In Transit', filter: 'OCEAN' },
  { key: 'atWarehouse', label: 'At Warehouse', filter: 'WAREHOUSE' },
] as const

export function OrderPipeline({ pipeline, pendingFulfillmentOrders }: OrderPipelineProps) {
  const totalPOs = Object.values(pipeline).reduce((sum, count) => sum + count, 0)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Order Pipeline</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">({totalPOs} active POs)</span>
      </div>

      {/* Pipeline stages */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {stages.map((stage, index) => {
          const count = pipeline[stage.key]
          return (
            <div key={stage.key} className="flex items-center">
              <Link
                href={`/operations/purchase-orders?status=${stage.filter}`}
                className="flex flex-col items-center px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors min-w-[80px]"
              >
                <span className={`text-lg font-bold ${count > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`}>
                  {count}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  {stage.label}
                </span>
              </Link>
              {index < stages.length - 1 && (
                <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>

      {/* Pending FOs */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        <Link
          href="/operations/fulfillment-orders?status=DRAFT"
          className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Pending Fulfillment Orders</span>
          </div>
          <span className={`text-sm font-semibold ${pendingFulfillmentOrders > 0 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-slate-500'}`}>
            {pendingFulfillmentOrders}
          </span>
        </Link>
      </div>
    </div>
  )
}
