"use client"

import { useMemo } from 'react'
import { format } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Filter } from '@/lib/lucide-icons'
import { cn } from '@/lib/utils'
import type { StorageEntry } from '@/hooks/useStorageLedger'
export interface StorageLedgerColumnFilters {
 warehouseCodes: string[]
 skuCodes: string[]
 weekEnding: string
 description: string
 batch: string
 status: Array<'CALCULATED' | 'PENDING'>
 palletDaysMin: string
 palletDaysMax: string
 rateMin: string
 rateMax: string
 totalCostMin: string
 totalCostMax: string
}

interface StorageLedgerTableProps {
 entries: StorageEntry[]
 aggregationView: 'weekly' | 'monthly'
 filters: StorageLedgerColumnFilters
 onFilterChange: (filters: StorageLedgerColumnFilters) => void
}

const baseFilterInputClass = 'w-full rounded-md border border-muted px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary'

export function StorageLedgerTable({
 entries,
 aggregationView: _aggregationView,
 filters,
 onFilterChange,
}: StorageLedgerTableProps) {
  const uniqueWarehouses = useMemo(() => {
    const set = new Set<string>()
    entries.forEach(entry => {
      set.add(entry.warehouseCode)
    })
    return Array.from(set.values())
      .map((value) => ({ value, label: value }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [entries])

 const uniqueSkus = useMemo(() => {
 const set = new Set<string>()
 entries.forEach(entry => {
 set.add(entry.skuCode)
 })
 return Array.from(set.values()).sort().map(value => ({ value, label: value }))
 }, [entries])

 const uniqueStatuses = useMemo(() => [
 { value: 'CALCULATED', label: 'Calculated' },
 { value: 'PENDING', label: 'Pending' },
 ], [])

 const updateFilters = (partial: Partial<StorageLedgerColumnFilters>) => {
 onFilterChange({ ...filters, ...partial })
 }

 const toggleSelection = (key: 'warehouseCodes' | 'skuCodes' | 'status', value: string) => {
 const current = filters[key]
 const exists = current.includes(value as never)
 const next = exists
 ? current.filter(item => item !== value)
 : [...current, value] as typeof current
 onFilterChange({ ...filters, [key]: next })
 }

 const renderNumericFilter = (
 label: string,
 minKey: keyof StorageLedgerColumnFilters,
 maxKey: keyof StorageLedgerColumnFilters,
 ) => (
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label={`Filter ${label}`}
 className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted/30 hover:text-primary"
 >
 <Filter className="h-3.5 w-3.5" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="end" className="w-56 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-foreground">{label} range</span>
 <button
 type="button"
 className="text-xs font-medium text-primary hover:underline"
 onClick={() => updateFilters({ [minKey]: '', [maxKey]: '' } as Partial<StorageLedgerColumnFilters>)}
 >
 Clear
 </button>
 </div>
 <div className="flex gap-2">
 <input
 type="number"
 inputMode="numeric"
 value={filters[minKey] as string}
 onChange={(event) => updateFilters({ [minKey]: event.target.value } as Partial<StorageLedgerColumnFilters>)}
 placeholder="Min"
 className={`${baseFilterInputClass} text-right`}
 />
 <input
 type="number"
 inputMode="numeric"
 value={filters[maxKey] as string}
 onChange={(event) => updateFilters({ [maxKey]: event.target.value } as Partial<StorageLedgerColumnFilters>)}
 placeholder="Max"
 className={`${baseFilterInputClass} text-right`}
 />
 </div>
 </PopoverContent>
 </Popover>
 )

 const renderTextFilter = (label: string, key: keyof StorageLedgerColumnFilters) => (
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label={`Filter ${label}`}
 className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted/30 hover:text-primary"
 >
 <Filter className="h-3.5 w-3.5" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="start" className="w-64 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-foreground">{label} filter</span>
 <button
 type="button"
 className="text-xs font-medium text-primary hover:underline"
 onClick={() => updateFilters({ [key]: '' } as Partial<StorageLedgerColumnFilters>)}
 >
 Clear
 </button>
 </div>
 <input
 type="text"
 value={filters[key] as string}
 onChange={(event) => updateFilters({ [key]: event.target.value } as Partial<StorageLedgerColumnFilters>)}
 placeholder={`Search ${label.toLowerCase()}`}
 className={baseFilterInputClass}
 />
 </PopoverContent>
 </Popover>
 )


 return (
 <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft">
 <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Filter className="h-4 w-4" />
 <span>
 Showing {entries.length} storage {entries.length === 1 ? 'entry' : 'entries'}
 </span>
 </div>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full table-auto text-sm">
 <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
 <tr>
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>Week Ending</span>
 {renderTextFilter('Week ending', 'weekEnding')}
 </div>
 </th>
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>Warehouse</span>
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label="Filter warehouses"
 className={cn(
 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
 filters.warehouseCodes.length > 0
 ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
 : 'hover:bg-muted/30 hover:text-primary'
 )}
 >
 <Filter className="h-3.5 w-3.5" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="start" className="w-64 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-foreground">Warehouse filter</span>
 <button
 type="button"
 className="text-xs font-medium text-primary hover:underline"
 onClick={() => updateFilters({ warehouseCodes: [] })}
 >
 Clear
 </button>
 </div>
 <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
 {uniqueWarehouses.map(option => (
 <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
 <input
 type="checkbox"
 checked={filters.warehouseCodes.includes(option.value)}
 onChange={() => toggleSelection('warehouseCodes', option.value)}
 className="h-4 w-4 rounded border-muted text-primary focus:ring-primary"
 />
 <span>{option.label}</span>
 </label>
 ))}
 </div>
        </PopoverContent>
      </Popover>
    </div>
  </th>
          
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>SKU</span>
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label="Filter SKUs"
 className={cn(
 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
 filters.skuCodes.length > 0
 ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
 : 'hover:bg-muted/30 hover:text-primary'
 )}
 >
 <Filter className="h-3.5 w-3.5" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="start" className="w-64 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-foreground">SKU filter</span>
 <button
 type="button"
 className="text-xs font-medium text-primary hover:underline"
 onClick={() => updateFilters({ skuCodes: [] })}
 >
 Clear
 </button>
 </div>
 <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
 {uniqueSkus.map(option => (
 <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
 <input
 type="checkbox"
 checked={filters.skuCodes.includes(option.value)}
 onChange={() => toggleSelection('skuCodes', option.value)}
 className="h-4 w-4 rounded border-muted text-primary focus:ring-primary"
 />
 <span>{option.label}</span>
 </label>
 ))}
 </div>
 </PopoverContent>
 </Popover>
 </div>
 </th>
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>Description</span>
 {renderTextFilter('Description', 'description')}
 </div>
 </th>
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>Batch</span>
 {renderTextFilter('Batch', 'batch')}
 </div>
 </th>
 <th className="px-3 py-2 text-right font-semibold">
 <div className="flex items-center justify-end gap-1">
 <span>Pallet Days</span>
 {renderNumericFilter('Pallet days', 'palletDaysMin', 'palletDaysMax')}
 </div>
 </th>
 <th className="px-3 py-2 text-right font-semibold">
 <div className="flex items-center justify-end gap-1">
 <span>Rate</span>
 {renderNumericFilter('Rate', 'rateMin', 'rateMax')}
 </div>
 </th>
 <th className="px-3 py-2 text-right font-semibold">
 <div className="flex items-center justify-end gap-1">
 <span>Total Cost</span>
 {renderNumericFilter('Total cost', 'totalCostMin', 'totalCostMax')}
 </div>
 </th>
 <th className="px-3 py-2 text-left font-semibold">
 <div className="flex items-center justify-between gap-1">
 <span>Status</span>
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label="Filter statuses"
 className={cn(
 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
 filters.status.length > 0
 ? 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
 : 'hover:bg-muted/30 hover:text-primary'
 )}
 >
 <Filter className="h-3.5 w-3.5" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="start" className="w-48 space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-foreground">Status filter</span>
 <button
 type="button"
 className="text-xs font-medium text-primary hover:underline"
 onClick={() => updateFilters({ status: [] })}
 >
 Clear
 </button>
 </div>
 <div className="space-y-2">
 {uniqueStatuses.map(option => (
 <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
 <input
 type="checkbox"
 checked={filters.status.includes(option.value as 'CALCULATED' | 'PENDING')}
 onChange={() => toggleSelection('status', option.value)}
 className="h-4 w-4 rounded border-muted text-primary focus:ring-primary"
 />
 <span>{option.label}</span>
 </label>
 ))}
 </div>
 </PopoverContent>
 </Popover>
 </div>
 </th>
 </tr>
 </thead>
 <tbody>
 {entries.length === 0 && (
 <tr>
          <td
            colSpan={9}
            className="px-4 py-10 text-center text-muted-foreground"
          >
 No storage entries found. Adjust filters to see results.
 </td>
 </tr>
 )}

      {entries.map(entry => (
        <tr key={entry.id} className="odd:bg-muted/20">
          <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">
            {format(new Date(entry.weekEndingDate), 'PP')}
          </td>
          <td className="px-3 py-2 text-sm font-medium text-foreground whitespace-nowrap">
            {entry.warehouseCode}
          </td>
 <td className="px-3 py-2 text-sm font-medium text-foreground whitespace-nowrap">
 {entry.skuCode}
 </td>
 <td className="px-3 py-2 text-sm text-muted-foreground max-w-xs truncate" title={entry.skuDescription}>
 {entry.skuDescription}
 </td>
 <td className="px-3 py-2 text-sm text-muted-foreground font-mono whitespace-nowrap">
 {entry.batchLot}
 </td>
 <td className="px-3 py-2 text-sm font-semibold text-foreground text-right whitespace-nowrap">
 {entry.palletDays.toLocaleString()}
 </td>
 <td className="px-3 py-2 text-sm text-right text-foreground whitespace-nowrap">
 {entry.storageRatePerPalletDay
 ? `$${Number(entry.storageRatePerPalletDay).toFixed(4)}`
 : <span className="text-muted-foreground">—</span>
 }
 </td>
 <td className="px-3 py-2 text-sm text-right font-semibold text-foreground whitespace-nowrap">
 {entry.totalStorageCost
 ? `$${Number(entry.totalStorageCost).toFixed(2)}`
 : <span className="text-muted-foreground">—</span>
 }
 </td>
 <td className="px-3 py-2 text-sm">
              <Badge variant={entry.isCostCalculated ? 'success' : 'warning'}>
                {entry.isCostCalculated ? 'Calculated' : 'Pending'}
              </Badge>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )
}
