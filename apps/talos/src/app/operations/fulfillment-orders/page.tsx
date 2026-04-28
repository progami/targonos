'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { PageLoading } from '@/components/ui/loading-spinner'
import { buildAppCallbackUrl, redirectToPortal } from '@/lib/portal'
import { Truck } from '@/lib/lucide-icons'
import { AmazonShipmentsPanel } from './amazon-shipments-panel'

function FulfillmentOrdersPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', buildAppCallbackUrl('/operations/fulfillment-orders'))
      return
    }

    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
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
      <PageHeaderSection
        title="Amazon Shipments"
        description="Operations"
        icon={Truck}
      />
      <PageContent>
        <div className="flex flex-col gap-4">
          <AmazonShipmentsPanel />
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
