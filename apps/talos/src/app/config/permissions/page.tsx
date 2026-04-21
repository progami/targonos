'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import PermissionsPanel from './permissions-panel'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { isPortalPlatformAdmin } from '@/lib/tenant/session'

export default function PermissionsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/config/permissions')}`)
      return
    }

    if (!isPortalPlatformAdmin(session)) {
      toast.error('Only super admins can access this page')
      router.push('/dashboard')
    }
  }, [router, session, status])

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent " />
            <span>Loading...</span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!session || !isPortalPlatformAdmin(session)) {
    return null
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection title="Permissions" description="Configuration" />
        <PageContent>
          <PermissionsPanel />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
