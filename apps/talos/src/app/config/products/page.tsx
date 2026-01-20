'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Package, Plus } from '@/lib/lucide-icons'
import SkusPanel from './skus-panel'
import { redirectToPortal } from '@/lib/portal'
import { Button } from '@/components/ui/button'
import { ImportButton } from '@/components/ui/import-button'
import { AmazonImportButton } from './amazon-import-button'

const ALLOWED_ROLES = ['admin', 'staff']

function ProductsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const [openSkuModal, setOpenSkuModal] = useState(false)

  const editSkuId = searchParams.get('editSkuId')

  const handleOpenSkuModal = useCallback(() => {
    setOpenSkuModal(true)
  }, [])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      redirectToPortal('/login', `${window.location.origin}${basePath}/config/products`)
      return
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      toast.error('You are not authorised to view products')
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
          title="Products"
          description="Configuration"
          icon={Package}
          actions={
            <div className="flex items-center gap-2">
              <AmazonImportButton onImportComplete={() => window.location.reload()} />
              <ImportButton entityName="skus" onImportComplete={() => window.location.reload()} />
              <Button onClick={handleOpenSkuModal} className="gap-2">
                <Plus className="h-4 w-4" />
                Add SKU
              </Button>
            </div>
          }
        />
        <PageContent>
          <SkusPanel
            externalModalOpen={openSkuModal}
            externalEditSkuId={editSkuId}
            onExternalModalClose={() => {
              setOpenSkuModal(false)
              if (editSkuId) router.replace('/config/products')
            }}
          />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageContent />
    </Suspense>
  )
}
