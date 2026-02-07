'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Shield } from '@/lib/lucide-icons'
import PermissionsPanel from './permissions-panel'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'

const SUPER_ADMIN_EMAILS = ['jarrar@targonglobal.com']

function isSuperAdmin(email: string): boolean {
  return SUPER_ADMIN_EMAILS.includes(email?.toLowerCase() ?? '')
}

export default function PermissionsPage() {
  const router = useRouter()
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/config/permissions')}`)
      return
    }

    if (!isSuperAdmin(session.user.email)) {
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

  if (!session || !isSuperAdmin(session.user.email)) {
    return null
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title="User Permissions"
          description="Manage RBAC permissions"
          icon={Shield}
        />
        <PageContent>
          <PermissionsPanel />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
