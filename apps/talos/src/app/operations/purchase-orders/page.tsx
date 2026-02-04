'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { usePageState } from '@/lib/store/page-state'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { PageTabs } from '@/components/ui/page-tabs'
import { PageLoading } from '@/components/ui/loading-spinner'
import {
  FileText,
  Plus,
  FileEdit,
  Send,
  Factory,
  Ship,
  Warehouse,
  PackageX,
  XCircle,
} from '@/lib/lucide-icons'
import { PurchaseOrdersPanel } from '../inventory/purchase-orders-panel'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import type { LucideIcon } from 'lucide-react'

// 5-Stage State Machine Status Types
type POStageStatus =
  | 'RFQ'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'REJECTED'
  | 'CANCELLED'

type StatusConfig = {
  value: POStageStatus
  label: string
  description: string
  icon: LucideIcon
}

// Main pipeline stages (5-stage state machine)
const PIPELINE_STAGES: StatusConfig[] = [
  {
    value: 'RFQ',
    label: 'RFQ',
    description: 'Request for quote shared with supplier',
    icon: FileEdit,
  },
  {
    value: 'ISSUED',
    label: 'Issued',
    description: 'Accepted by supplier (signed PI received)',
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
    label: 'In Transit',
    description: 'Goods in transit from manufacturer',
    icon: Ship,
  },
  {
    value: 'WAREHOUSE',
    label: 'At Warehouse',
    description: 'Goods received at warehouse',
    icon: Warehouse,
  },
]

// Terminal statuses
const TERMINAL_STATUSES: StatusConfig[] = [
  {
    value: 'REJECTED',
    label: 'Rejected',
    description: 'Purchase orders declined by the supplier',
    icon: PackageX,
  },
  {
    value: 'CANCELLED',
    label: 'Cancelled',
    description: 'Purchase orders cancelled before completion',
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

  // Get status from URL first, then Zustand state, then default to RFQ
  const statusFromUrl = searchParams.get('status') as POStageStatus | null
  const persistedStatus = pageState.activeTab as POStageStatus | undefined
  const currentStatus: POStageStatus =
    (statusFromUrl && STATUS_CONFIGS.some(s => s.value === statusFromUrl) ? statusFromUrl : null) ??
    (persistedStatus && STATUS_CONFIGS.some(s => s.value === persistedStatus) ? persistedStatus : null) ??
    'RFQ'

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

  const handleStatusChange = (newStatus: string) => {
    // Persist to Zustand
    pageState.setActiveTab(newStatus)
    // Update URL
    const params = new URLSearchParams(searchParams.toString())
    params.set('status', newStatus)
    router.push(`/operations/purchase-orders?${params.toString()}`)
  }

  // Memoize status tabs to use with PageTabs
  const statusTabs = useMemo(
    () =>
      STATUS_CONFIGS.map(config => ({
        value: config.value,
        label: config.label,
        icon: config.icon,
      })),
    []
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
      <PageContent className="overflow-hidden">
        <div className="flex min-h-0 flex-col gap-6">
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
