'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { PageTabs } from '@/components/ui/page-tabs'
import { PageLoading } from '@/components/ui/loading-spinner'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { FileText, Plus, Truck, XCircle, FileEdit } from '@/lib/lucide-icons'
import { FulfillmentOrdersPanel } from './fulfillment-orders-panel'
import type { LucideIcon } from 'lucide-react'

type FulfillmentOrderStatus = 'DRAFT' | 'SHIPPED' | 'CANCELLED'

type StatusConfig = {
  value: FulfillmentOrderStatus
  label: string
  description: string
  icon: LucideIcon
}

const STATUS_CONFIGS: StatusConfig[] = [
  {
    value: 'DRAFT',
    label: 'Draft',
    description: 'Orders being prepared',
    icon: FileEdit,
  },
  {
    value: 'SHIPPED',
    label: 'Shipped',
    description: 'Outbound orders shipped',
    icon: Truck,
  },
  {
    value: 'CANCELLED',
    label: 'Cancelled',
    description: 'Orders cancelled',
    icon: XCircle,
  },
]

function FulfillmentOrdersPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const statusFromUrl = searchParams.get('status') as FulfillmentOrderStatus | null
  const currentStatus: FulfillmentOrderStatus =
    statusFromUrl && STATUS_CONFIGS.some(s => s.value === statusFromUrl) ? statusFromUrl : 'DRAFT'

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/fulfillment-orders')}`)
      return
    }

    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
    }
  }, [session, status, router])

  const handleStatusChange = (newStatus: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('status', newStatus)
    router.push(`/operations/fulfillment-orders?${params.toString()}`)
  }

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
        title="Fulfillment Orders"
        description="Operations"
        icon={FileText}
        actions={
          <Button asChild className="gap-2">
            <Link href="/operations/fulfillment-orders/new">
              <Plus className="h-4 w-4" />
              New Fulfillment Order
            </Link>
          </Button>
        }
      />
      <PageContent>
        <div className="flex flex-col gap-6">
          <PageTabs
            tabs={statusTabs}
            value={currentStatus}
            onChange={handleStatusChange}
            variant="underline"
          />

          <FulfillmentOrdersPanel statusFilter={currentStatus} />
        </div>
      </PageContent>
    </PageContainer>
  )
}

export default function FulfillmentOrdersPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageLoading />
        </PageContainer>
      }
    >
      <FulfillmentOrdersPageContent />
    </Suspense>
  )
}
