'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { Plus, Users } from '@/lib/lucide-icons'
import { redirectToPortal } from '@/lib/portal'
import { Button } from '@/components/ui/button'
import { ImportButton } from '@/components/ui/import-button'
import SuppliersPanel from './suppliers-panel'
import { withBasePath } from '@/lib/utils/base-path'

const ALLOWED_ROLES = ['admin', 'staff']

function SuppliersPageContent() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [openSupplierModal, setOpenSupplierModal] = useState(false)

  const handleOpenSupplierModal = useCallback(() => {
    setOpenSupplierModal(true)
  }, [])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/config/suppliers')}`)
      return
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      toast.error('You are not authorised to view suppliers')
      router.push('/dashboard')
    }
  }, [router, session, status])

  if (status === 'loading') {
    return (
      <DashboardLayout>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent " />
            <span>Loading…</span>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return null
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title="Suppliers"
          description="Configuration"
          icon={Users}
          actions={
            <div className="flex items-center gap-2">
              <ImportButton entityName="suppliers" onImportComplete={() => window.location.reload()} />
              <Button onClick={handleOpenSupplierModal} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Supplier
              </Button>
            </div>
          }
        />
        <PageContent>
          <SuppliersPanel
            externalModalOpen={openSupplierModal}
            onExternalModalClose={() => setOpenSupplierModal(false)}
          />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent " />
              <span>Loading…</span>
            </div>
          </div>
        </DashboardLayout>
      }
    >
      <SuppliersPageContent />
    </Suspense>
  )
}
