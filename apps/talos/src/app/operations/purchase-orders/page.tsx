'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { usePageState } from '@/lib/store/page-state'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { PageTabs } from '@/components/ui/page-tabs'
import { PageLoading } from '@/components/ui/loading-spinner'
import { Input } from '@/components/ui/input'
import {
  Eye,
  FileText,
  Plus,
  Search,
  Send,
  Factory,
  Ship,
  Warehouse,
  XCircle,
  X,
} from '@/lib/lucide-icons'
import { PurchaseOrdersPanel } from '../inventory/purchase-orders-panel'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import type { LucideIcon } from 'lucide-react'

// 5-Stage State Machine Status Types
type POStageStatus =
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'CLOSED'

type StatusConfig = {
  value: POStageStatus
  label: string
  description: string
  icon: LucideIcon
}

// Main pipeline stages (5-stage state machine)
const PIPELINE_STAGES: StatusConfig[] = [
  {
    value: 'ISSUED',
    label: 'Issued',
    description: 'Purchase order created and issued to supplier',
    icon: Send,
  },
  {
    value: 'MANUFACTURING',
    label: 'Manufacturing',
    description: 'Goods in production at manufacturer',
    icon: Factory,
  },
  {
    value: 'OCEAN',
    label: 'Transit',
    description: 'Goods moving from manufacturer',
    icon: Ship,
  },
  {
    value: 'WAREHOUSE',
    label: 'Warehouse',
    description: 'Goods received in warehouse',
    icon: Warehouse,
  },
]

// Terminal statuses
const TERMINAL_STATUSES: StatusConfig[] = [
  {
    value: 'CLOSED',
    label: 'Closed',
    description: 'Purchase orders closed before completion',
    icon: XCircle,
  },
]

const STATUS_CONFIGS = [...PIPELINE_STAGES, ...TERMINAL_STATUSES]

const PAGE_KEY = '/operations/purchase-orders'

function OrdersPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pageState = usePageState(PAGE_KEY)

  // Get status from URL first, then Zustand state, then default to ISSUED
  const statusFromUrl = searchParams.get('status') as POStageStatus | null
  const persistedStatus = pageState.activeTab as POStageStatus | undefined
  const currentStatus: POStageStatus =
    (statusFromUrl && STATUS_CONFIGS.some(s => s.value === statusFromUrl) ? statusFromUrl : null) ??
    (persistedStatus && STATUS_CONFIGS.some(s => s.value === persistedStatus) ? persistedStatus : null) ??
    'ISSUED'

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/purchase-orders')}`)
      return
    }

    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
    }
  }, [session, status, router])

  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [globalSearch, setGlobalSearch] = useState('')
  const [lifecycleTrigger, setLifecycleTrigger] = useState(0)

  const handleStatusChange = (newStatus: string) => {
    // Persist to Zustand
    pageState.setActiveTab(newStatus)
    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    params.set('status', newStatus)
    router.push(`/operations/purchase-orders?${params.toString()}`)
  }

  const handleCountsLoaded = useCallback((counts: Record<string, number>) => {
    setStageCounts(counts)
  }, [])

  // Memoize status tabs to use with PageTabs
  const statusTabs = useMemo(
    () =>
      STATUS_CONFIGS.map(config => ({
        value: config.value,
        label: config.label,
        icon: config.icon,
        count: stageCounts[config.value],
      })),
    [stageCounts]
  )

  if (status === 'loading') {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title="Purchase Orders"
        description="Operations"
        icon={FileText}
        actions={
          <Button asChild className="gap-2">
            <Link href="/operations/purchase-orders/new">
              <Plus className="h-4 w-4" />
              New Purchase Order
            </Link>
          </Button>
        }
      />
      <PageContent className="flex flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {/* Global search */}
          <div className="flex items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                placeholder="Search by PO#, CI#, GRN#, supplier…"
                className="h-9 pl-9 pr-8 text-sm"
              />
              {globalSearch.trim().length > 0 && (
                <button
                  type="button"
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {globalSearch.trim().length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                onClick={() => setLifecycleTrigger(prev => prev + 1)}
              >
                <Eye className="h-4 w-4" />
                View Lifecycle
              </Button>
            )}
          </div>

          {/* Status Tabs */}
          <PageTabs
            tabs={statusTabs}
            value={currentStatus}
            onChange={handleStatusChange}
            variant="underline"
          />

          <div className="flex min-h-0 flex-1 flex-col">
            <PurchaseOrdersPanel
              onPosted={() => {}}
              statusFilter={currentStatus}
              typeFilter="PURCHASE"
              onCountsLoaded={handleCountsLoaded}
              globalSearch={globalSearch.trim() || undefined}
              lifecycleTrigger={lifecycleTrigger}
            />
          </div>
        </div>
      </PageContent>
    </PageContainer>
  )
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageLoading />
        </PageContainer>
      }
    >
      <OrdersPageContent />
    </Suspense>
  )
}
