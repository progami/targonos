'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/hooks/usePortalSession'
import { useRouter } from 'next/navigation'
import { Package, Calendar } from '@/lib/lucide-icons'
import {
  PageContainer,
  PageHeaderSection,
  PageContent,
} from '@/components/layout/page-container'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading, ContentLoading } from '@/components/ui/loading-spinner'
import { StorageLedgerHeader } from '@/components/finance/storage-ledger/StorageLedgerHeader'
import { StorageLedgerStats } from '@/components/finance/storage-ledger/StorageLedgerStats'
import {
  StorageLedgerTable,
  type StorageLedgerColumnFilters,
} from '@/components/finance/storage-ledger/StorageLedgerTable'
import { useStorageLedger } from '@/hooks/useStorageLedger'
import { format } from 'date-fns'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'

export default function StorageLedgerPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/storage-ledger')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }
  }, [session, status, router])

  if (status === 'loading') {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <StorageLedgerContent />
    </PageContainer>
  )
}

function StorageLedgerContent() {
  const [aggregationView, setAggregationView] = useState<'weekly' | 'monthly'>(
    'weekly',
  )
  const [filters, setFilters] = useState<StorageLedgerColumnFilters>(
    createDefaultFilters,
  )
  const [dateRange] = useState({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })

  const { entries, summary, loading, error, exportData, refetch } =
    useStorageLedger({
      startDate: dateRange.start,
      endDate: dateRange.end,
      includeCosts: true,
    })

  const filteredEntries = useMemo(
    () => filterEntries(entries, filters),
    [entries, filters],
  )

  const headerActions = (
    <StorageLedgerHeader
      aggregationView={aggregationView}
      onAggregationChange={setAggregationView}
      onExport={exportData}
      onRefresh={refetch}
    />
  )

  return (
    <>
      <PageHeaderSection
        title="Storage Ledger"
        description="Operations"
        icon={Calendar}
        actions={headerActions}
      />
      <PageContent className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
        {loading ? (
          <ContentLoading size="lg" />
        ) : error ? (
          <EmptyState icon={Package} title="Error Loading Data" description={error} />
        ) : (
          <div className="space-y-6">
            {summary && <StorageLedgerStats summary={summary} />}
            <StorageLedgerTable
              entries={filteredEntries}
              aggregationView={aggregationView}
              filters={filters}
              onFilterChange={setFilters}
            />
          </div>
        )}
      </PageContent>
    </>
  )
}

function createDefaultFilters(): StorageLedgerColumnFilters {
  return {
    warehouseCodes: [],
    skuCodes: [],
    weekEnding: '',
    description: '',
    batch: '',
    status: [],
    palletDaysMin: '',
    palletDaysMax: '',
    rateMin: '',
    rateMax: '',
    totalCostMin: '',
    totalCostMax: '',
  }
}

function filterEntries(
  entries: ReturnType<typeof useStorageLedger>['entries'],
  filters: StorageLedgerColumnFilters,
) {
  const parseNumber = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? null : parsed
  }

  const palletDaysMin = parseNumber(filters.palletDaysMin)
  const palletDaysMax = parseNumber(filters.palletDaysMax)
  const rateMin = parseNumber(filters.rateMin)
  const rateMax = parseNumber(filters.rateMax)
  const totalCostMin = parseNumber(filters.totalCostMin)
  const totalCostMax = parseNumber(filters.totalCostMax)

  return entries.filter(entry => {
    if (
      filters.warehouseCodes.length > 0 &&
      !filters.warehouseCodes.includes(entry.warehouseCode)
    ) {
      return false
    }

    if (filters.skuCodes.length > 0 && !filters.skuCodes.includes(entry.skuCode)) {
      return false
    }

    if (filters.weekEnding) {
      const weekLabel = format(new Date(entry.weekEndingDate), 'PP').toLowerCase()
      if (!weekLabel.includes(filters.weekEnding.toLowerCase())) {
        return false
      }
    }

    if (filters.description) {
      const description = entry.skuDescription?.toLowerCase() ?? ''
      if (!description.includes(filters.description.toLowerCase())) {
        return false
      }
    }

    if (filters.batch) {
      if (!entry.batchLot.toLowerCase().includes(filters.batch.toLowerCase())) {
        return false
      }
    }

    if (filters.status.length > 0) {
      const status = entry.isCostCalculated ? 'CALCULATED' : 'PENDING'
      if (!filters.status.includes(status)) {
        return false
      }
    }

    if (palletDaysMin !== null && entry.palletDays < palletDaysMin) {
      return false
    }
    if (palletDaysMax !== null && entry.palletDays > palletDaysMax) {
      return false
    }

    const rate = entry.storageRatePerPalletDay
      ? Number(entry.storageRatePerPalletDay)
      : null
    if (rateMin !== null && (rate ?? 0) < rateMin) {
      return false
    }
    if (rateMax !== null && (rate ?? 0) > rateMax) {
      return false
    }

    const totalCost = entry.totalStorageCost ? Number(entry.totalStorageCost) : null
    if (totalCostMin !== null && (totalCost ?? 0) < totalCostMin) {
      return false
    }
    if (totalCostMax !== null && (totalCost ?? 0) > totalCostMax) {
      return false
    }

    return true
  })
}

