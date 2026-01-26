'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Edit,
  Search,
} from '@/lib/lucide-icons'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const PAGE_KEY = '/config/warehouses'

interface Warehouse {
  id: string
  code: string
  name: string
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  contactEmail?: string | null
  contactPhone?: string | null
  kind?: string
  rateListAttachment?: {
    fileName: string
    size: number
    contentType: string
    uploadedAt: string
    uploadedBy?: string | null
  } | null
  _count: {
    users: number
    costRates: number
    inventoryTransactions: number
  }
}

export default function WarehousesPanel() {
  const router = useRouter()
  const pageState = usePageState(PAGE_KEY)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch

  const loadWarehouses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchWithCSRF('/api/warehouses')
      if (!response.ok) throw new Error('Failed to load warehouses')

      const payload = await response.json()
      const data: Warehouse[] = Array.isArray(payload) ? payload : []
      const normalized = data.map((warehouse) => ({
        ...warehouse,
        name: warehouse.name || 'Unnamed warehouse',
        code: warehouse.code || '—',
        address: warehouse.address ?? '',
        contactEmail: warehouse.contactEmail ?? '',
        contactPhone: warehouse.contactPhone ?? '',
        kind: warehouse.kind ?? 'THIRD_PARTY',
        rateListAttachment: warehouse.rateListAttachment ?? null,
        _count: {
          users: warehouse._count?.users ?? 0,
          costRates: warehouse._count?.costRates ?? 0,
          inventoryTransactions: warehouse._count?.inventoryTransactions ?? 0,
        },
      }))
      setWarehouses(normalized)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load warehouses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadWarehouses()
  }, [loadWarehouses])

  const filteredWarehouses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return warehouses.filter((warehouse) => {
      if (!term) return true

      const haystack = [
        warehouse.name,
        warehouse.code,
        warehouse.address,
        warehouse.contactEmail,
        warehouse.contactPhone,
        warehouse.kind,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [warehouses, searchTerm])

  const totals = useMemo(() => {
    const costRates = warehouses.reduce((sum, w) => sum + w._count.costRates, 0)
    return { costRates }
  }, [warehouses])

  const getKindLabel = (kind?: string) => {
    switch (kind) {
      case 'AMAZON_FBA':
        return 'Amazon FBA'
      case 'AMAZON_AWD':
        return 'Amazon AWD'
      default:
        return '3PL'
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Warehouse Network</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage warehouses and configure cost rates</p>
          </div>
          <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-medium">
            {warehouses.length} warehouses · {totals.costRates} rates
          </Badge>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search warehouses..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600" />
          </div>
        ) : filteredWarehouses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Building2 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">No warehouses to show</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Contact an administrator to configure warehouses.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="w-[12%] px-4 py-3 text-left font-semibold">Code</th>
                  <th className="w-[22%] px-4 py-3 text-left font-semibold">Name</th>
                  <th className="w-[10%] px-4 py-3 text-left font-semibold">Type</th>
                  <th className="w-[26%] px-4 py-3 text-left font-semibold">Address</th>
                  <th className="w-[14%] px-4 py-3 text-left font-semibold">Phone</th>
                  <th className="w-[8%] px-4 py-3 text-right font-semibold">Rates</th>
                  <th className="w-[8%] px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredWarehouses.map(warehouse => (
                  <tr key={warehouse.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/config/warehouses/${warehouse.id}/rates`}
                        className="hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors"
                      >
                        {warehouse.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 truncate" title={warehouse.name}>
                      {warehouse.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {getKindLabel(warehouse.kind)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 truncate" title={warehouse.address || undefined}>
                      {warehouse.address || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {warehouse.contactPhone || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700 dark:text-slate-300">
                      {warehouse._count.costRates}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <Link href={`/config/warehouses/${warehouse.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
