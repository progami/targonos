'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Boxes,
  Building2,
  DollarSign,
  Edit,
  Mail,
  MapPin,
  Search,
  Users,
  Phone,
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

  const goToRatesPage = (warehouseId: string) => {
    router.push(`/config/warehouses/${warehouseId}/rates`)
  }

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

  const kindMeta = (kind?: string) => {
    switch (kind) {
      case 'AMAZON_FBA':
        return { label: 'Amazon FBA', badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600' }
      case 'AMAZON_AWD':
        return { label: 'Amazon AWD', badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600' }
      default:
        return { label: '3PL', badgeClass: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600' }
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Warehouse Network</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage warehouses and configure cost rates</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-medium">
              {warehouses.length} warehouses
            </Badge>
            <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-medium">{totals.costRates} rates</Badge>
          </div>
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
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 p-4">
                <div className="h-4 w-24 rounded bg-slate-200" />
                <div className="mt-3 h-5 w-3/4 rounded bg-slate-200" />
                <div className="mt-2 h-4 w-2/3 rounded bg-slate-200" />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="h-10 rounded bg-slate-200" />
                  <div className="h-10 rounded bg-slate-200" />
                  <div className="h-10 rounded bg-slate-200" />
                </div>
                <div className="mt-4 h-9 w-full rounded bg-slate-200" />
              </div>
            ))}
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
          <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredWarehouses.map((warehouse) => (
              <div
                key={warehouse.id}
                role="button"
                tabIndex={0}
                onClick={() => goToRatesPage(warehouse.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    goToRatesPage(warehouse.id)
                  }
                }}
                className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 flex h-full"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600" />
                <div className="p-5 flex h-full flex-col gap-4 w-full">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800">
                          {warehouse.code}
                        </Badge>
                        <Badge className={kindMeta(warehouse.kind).badgeClass}>
                          {kindMeta(warehouse.kind).label}
                        </Badge>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{warehouse.name}</h3>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link href={`/config/warehouses/${warehouse.id}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>

                  <div className="flex-1 flex flex-col gap-3">
                    {warehouse.address && (
                      <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <MapPin className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <span className="max-w-[240px] truncate">{warehouse.address}</span>
                      </p>
                    )}
                    {(warehouse.contactPhone || warehouse.contactEmail) && (
                      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                        {warehouse.contactPhone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                            {warehouse.contactPhone}
                          </span>
                        )}
                        {warehouse.contactEmail && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                            <span className="truncate max-w-[180px]">{warehouse.contactEmail}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {!warehouse.address && !warehouse.contactPhone && !warehouse.contactEmail && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">No address or contacts on file</p>
                    )}
                    {warehouse.rateListAttachment ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Rate list:{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {warehouse.rateListAttachment.fileName}
                        </span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Rate list not uploaded yet</p>
                    )}

                    <div className="flex-1" />

                    <div className="grid grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400">
                      <MetricChip
                        icon={<DollarSign className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />}
                        label="Cost rates"
                        value={warehouse._count.costRates}
                      />
                      <MetricChip
                        icon={<Boxes className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />}
                        label="Inventory"
                        value={warehouse._count.inventoryTransactions}
                      />
                      <MetricChip
                        icon={<Users className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />}
                        label="Team"
                        value={warehouse._count.users}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="flex-1 gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Link href={`/config/warehouses/${warehouse.id}/rates`}>
                        <DollarSign className="h-4 w-4" />
                        View Rates
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

function MetricChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
        {icon}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
    </div>
  )
}
