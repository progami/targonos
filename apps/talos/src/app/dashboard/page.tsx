'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { DashboardOverviewBoard } from '@/components/dashboard/dashboard-overview-board'
import { PageLoading } from '@/components/ui/loading-spinner'
import type { DashboardOverviewSnapshot } from '@/lib/dashboard/dashboard-overview'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'

function RedirectingToLoginMessage() {
  return (
    <PageContainer>
      <PageContent>
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Redirecting to login…
        </div>
      </PageContent>
    </PageContainer>
  )
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const [snapshot, setSnapshot] = useState<DashboardOverviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [redirectingToLogin, setRedirectingToLogin] = useState(false)

  useEffect(() => {
    if (status === 'loading') {
      return
    }

    if (session !== null) {
      return
    }

    setRedirectingToLogin(true)
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
        setRedirectingToLogin(true)
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
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  if (redirectingToLogin) {
    return <RedirectingToLoginMessage />
  }

  if (status === 'unauthenticated') {
    return <RedirectingToLoginMessage />
  }

  if (session === null) {
    return <RedirectingToLoginMessage />
  }

  if (loadError !== null) {
    throw loadError
  }

  if (!loading && snapshot === null) {
    throw new Error('Dashboard overview snapshot is required')
  }

  return (
    <PageContainer>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-6 lg:px-8">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
      </header>
      <PageContent>
        <DashboardOverviewBoard snapshot={snapshot} />
      </PageContent>
    </PageContainer>
  )
}
