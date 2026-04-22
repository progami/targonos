'use client'

import { useCallback, useEffect, useState } from 'react'
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
  const [snapshot, setSnapshot] = useState<DashboardOverviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)

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
    setLoadError(null)

    try {
      const response = await fetch(withBasePath('/api/dashboard/overview'), {
        credentials: 'include',
      })

      if (response.status === 401) {
        redirectToPortal('/login', `${window.location.origin}${withBasePath('/dashboard')}`)
        return
      }

      const payload = (await response.json()) as DashboardOverviewSnapshot | { error: string }

      if (!response.ok) {
        if (!('error' in payload) || typeof payload.error !== 'string') {
          throw new Error('Dashboard overview request failed')
        }

        throw new Error(payload.error)
      }

      if (!('summary' in payload) || !('warehouses' in payload)) {
        throw new Error('Dashboard overview payload is invalid')
      }

      setSnapshot(payload)
    } catch (error) {
      const resolvedError = error instanceof Error ? error : new Error('Failed to load dashboard')
      setLoadError(resolvedError)
      toast.error(resolvedError.message)
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

  if (loadError !== null) {
    throw loadError
  }

  if (!loading && snapshot === null) {
    throw new Error('Dashboard overview snapshot is required')
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection title="Dashboard" description="Operations" icon={LayoutDashboard} />
        <PageContent>
          <DashboardOverviewBoard snapshot={snapshot} />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
