'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
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
  | 'DRAFT'
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
    value: 'DRAFT',
    label: 'Draft',
    description: 'Editable draft shared with supplier for review',
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

function OrdersPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get status from URL or default to DRAFT
  const statusFromUrl = searchParams.get('status') as POStageStatus | null
  const currentStatus: POStageStatus =
    statusFromUrl && STATUS_CONFIGS.some(s => s.value === statusFromUrl) ? statusFromUrl : 'DRAFT'

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
      <PageContent>
        <div className="flex flex-col gap-6">
          {/* Status Tabs */}
          <PageTabs
            tabs={statusTabs}
            value={currentStatus}
            onChange={handleStatusChange}
            variant="underline"
          />

          <PurchaseOrdersPanel
            onPosted={() => {}}
            statusFilter={currentStatus}
            typeFilter="PURCHASE"
          />
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
