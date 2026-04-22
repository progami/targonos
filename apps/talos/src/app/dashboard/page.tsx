'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { DashboardOverviewBoard } from '@/components/dashboard/dashboard-overview-board'
import { PageLoading } from '@/components/ui/loading-spinner'
import { LayoutDashboard } from '@/lib/lucide-icons'
import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<DashboardOverviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    if (session !== null) {
      return
    }

    redirectToPortal('/login', `${window.location.origin}${withBasePath('/dashboard')}`)
  }, [session, status])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch(withBasePath('/api/dashboard/overview'), {
        credentials: 'include',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const message =
          payload !== null && typeof payload.error === 'string'
            ? payload.error
            : 'Failed to load dashboard'
        throw new Error(message)
      }

      const payload: DashboardOverviewSnapshot = await response.json()
      setSnapshot(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      void fetchDashboard()
    }
  }, [fetchDashboard, status])

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return (
      <DashboardLayout>
        <PageContainer>
          <PageLoading />
        </PageContainer>
      </DashboardLayout>
    )
  }

  if (status === 'unauthenticated' || session === null) {
    return (
      <DashboardLayout>
        <PageContainer>
          <PageContent>
            <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              Redirecting to login…
            </div>
          </PageContent>
        </PageContainer>
      </DashboardLayout>
    )
  }

  if (snapshot === null) {
    return (
      <DashboardLayout>
        <PageContainer>
          <PageHeaderSection title="Dashboard" description="Operations" icon={LayoutDashboard} />
          <PageContent>
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-[28px] border border-dashed border-slate-300 bg-white/70 text-center dark:border-slate-700 dark:bg-slate-900/70">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Dashboard unavailable
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchDashboard()
                }}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Retry
              </button>
            </div>
          </PageContent>
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title="Dashboard"
          description="Operations"
          icon={LayoutDashboard}
          actions={
            <button
              type="button"
              onClick={() => router.push('/operations/inventory')}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
            >
              Open Inventory Ledger
            </button>
          }
        />
        <PageContent>
          <DashboardOverviewBoard snapshot={snapshot} />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
