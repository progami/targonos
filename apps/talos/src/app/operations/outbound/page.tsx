'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { PageLoading } from '@/components/ui/loading-spinner'
import { buildAppCallbackUrl, redirectToPortal } from '@/lib/portal'
import { Truck } from '@/lib/lucide-icons'
import { OutboundPanel } from './outbound-panel'

function OutboundOrdersPageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', buildAppCallbackUrl('/operations/outbound'))
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
        title="Outbound"
        description="Operations"
        icon={Truck}
      />
      <PageContent>
        <div className="flex flex-col gap-4">
          <OutboundPanel />
        </div>
      </PageContent>
    </PageContainer>
  )
}

export default function OutboundOrdersPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageLoading />
        </PageContainer>
      }
    >
      <OutboundOrdersPageContent />
    </Suspense>
  )
}
