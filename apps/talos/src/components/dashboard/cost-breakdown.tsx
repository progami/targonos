'use client'

import Link from 'next/link'
import { DollarSign } from '@/lib/lucide-icons'

interface CostBreakdownProps {
  costs: {
    inbound: number
    outbound: number
    storage: number
    forwarding: number
    other: number
    total: number
  }
  currencySymbol?: string
}

export function CostBreakdown({ costs, currencySymbol = '£' }: CostBreakdownProps) {
  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const costLines = [
    { label: 'Inbound', value: costs.inbound },
    { label: 'Outbound', value: costs.outbound },
    { label: 'Storage', value: costs.storage },
    { label: 'Forwarding', value: costs.forwarding },
  ].filter(line => line.value > 0)

  // Add "Other" if there's any
  if (costs.other > 0) {
    costLines.push({ label: 'Other', value: costs.other })
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cost Breakdown</h3>
        </div>
        <Link
          href="/operations/cost-ledger"
          className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
        >
          View all
        </Link>
      </div>

      <div className="space-y-2">
        {costLines.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No costs recorded this month</p>
        ) : (
          costLines.map((line) => (
            <div key={line.label} className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">{line.label}</span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                {formatCurrency(line.value)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total</span>
        <span className="text-base font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">
          {formatCurrency(costs.total)}
        </span>
      </div>
    </div>
  )
}
