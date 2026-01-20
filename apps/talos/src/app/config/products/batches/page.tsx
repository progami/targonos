'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Boxes, Loader2 } from '@/lib/lucide-icons'
import { SkuBatchesPanel } from '../sku-batches-modal'

const ALLOWED_ROLES = ['admin', 'staff']

type SkuSummary = {
  id: string
  skuCode: string
  description: string
  unitDimensionsCm: string | null
  amazonReferenceWeightKg: number | string | null
  itemDimensionsCm: string | null
  itemSide1Cm: number | string | null
  itemSide2Cm: number | string | null
  itemSide3Cm: number | string | null
  itemWeightKg: number | string | null
}

export default function ProductBatchesPage() {
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
      <ProductBatchesPageInner />
    </Suspense>
  )
}

function ProductBatchesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const skuId = searchParams.get('skuId')

  const { data: session, status } = useSession()
  const [loadingSku, setLoadingSku] = useState(false)
  const [sku, setSku] = useState<SkuSummary | null>(null)

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
      redirectToPortal('/login', `${window.location.origin}${basePath}/config/products/batches`)
      return
    }

    if (!ALLOWED_ROLES.includes(session.user.role)) {
      toast.error('You are not authorised to view product batches')
      router.push('/dashboard')
    }
  }, [router, session, status])

  useEffect(() => {
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) return

    let cancelled = false

    if (!skuId) {
      setSku(null)
      return () => {
        cancelled = true
      }
    }

    setLoadingSku(true)
    fetch(`/api/skus/${encodeURIComponent(skuId)}`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null)
          throw new Error(payload?.error ?? 'Failed to load SKU')
        }
        return res.json()
      })
      .then(data => {
        if (cancelled) return
        setSku({
          id: data.id,
          skuCode: data.skuCode,
          description: data.description,
          unitDimensionsCm: data.unitDimensionsCm ?? null,
          amazonReferenceWeightKg: data.amazonReferenceWeightKg ?? null,
          itemDimensionsCm: data.itemDimensionsCm ?? null,
          itemSide1Cm: data.itemSide1Cm ?? null,
          itemSide2Cm: data.itemSide2Cm ?? null,
          itemSide3Cm: data.itemSide3Cm ?? null,
          itemWeightKg: data.itemWeightKg ?? null,
        })
      })
      .catch(error => {
        if (cancelled) return
        toast.error(error instanceof Error ? error.message : 'Failed to load SKU')
        setSku(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoadingSku(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, skuId])

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
          title="Batches"
          description="Configuration"
          icon={Boxes}
          backHref="/config/products"
          backLabel="Back"
        />
        <PageContent>
          {!skuId ? (
            <div className="flex h-full items-center justify-center rounded-xl border bg-white dark:bg-slate-800 p-10 text-center">
              <div className="space-y-2">
                <div className="text-base font-semibold text-slate-900">Select a SKU</div>
                <div className="text-sm text-slate-500">
                  Open a SKU from the Products page to view and manage its batches.
                </div>
              </div>
            </div>
          ) : loadingSku ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sku ? (
            <SkuBatchesPanel sku={sku} key={sku.id} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border bg-white dark:bg-slate-800 p-10 text-center">
              <div className="space-y-2">
                <div className="text-base font-semibold text-slate-900">SKU not found</div>
                <div className="text-sm text-slate-500">
                  The SKU associated with this link no longer exists.
                </div>
              </div>
            </div>
          )}
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
