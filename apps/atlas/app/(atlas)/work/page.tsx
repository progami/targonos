'use client'

import { useCallback, useEffect, useState } from 'react'
import { WorkItemsApi } from '@/lib/api-client'
import { Alert } from '@/components/ui/alert'
import { InboxDashboard } from '@/components/inbox'
import { CreateRequestModal } from '@/components/inbox/CreateRequestModal'
import type { WorkItemsResponse, WorkItemDTO, CompletedWorkItemsResponse } from '@/lib/contracts/work-items'
import type { ActionId } from '@/lib/contracts/action-ids'
import { executeAction } from '@/lib/actions/execute-action'
import { usePageStateStore } from '@/lib/store/page-state'

export type InboxTab = 'pending' | 'completed'

export default function WorkQueuePage() {
  const storedTab = usePageStateStore((s) => s.pages['/work']?.activeTab)
  const activeTab: InboxTab = storedTab === 'completed' ? 'completed' : 'pending'
  const setActiveTab = usePageStateStore((s) => s.setActiveTab)

  const custom = usePageStateStore((s) => s.pages['/work']?.custom)
  const selectedId = typeof custom?.selectedId === 'string' ? custom.selectedId : null
  const completedSelectedId =
    typeof custom?.completedSelectedId === 'string' ? custom.completedSelectedId : null
  const setCustom = usePageStateStore((s) => s.setCustom)

  const [data, setData] = useState<WorkItemsResponse | null>(null)
  const [completedData, setCompletedData] = useState<CompletedWorkItemsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [completedLoading, setCompletedLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  const updateSelectedId = useCallback(
    (nextId: string | null) => setCustom('/work', 'selectedId', nextId),
    [setCustom]
  )
  const updateCompletedSelectedId = useCallback(
    (nextId: string | null) => setCustom('/work', 'completedSelectedId', nextId),
    [setCustom]
  )

  const loadPending = useCallback(async (options?: { force?: boolean }) => {
    try {
      const force = options?.force ?? false
      setLoading(true)
      setError(null)
      const next = await WorkItemsApi.list({ force })
      setData(next)
      const current = usePageStateStore.getState().pages['/work']?.custom
      const prev = typeof current?.selectedId === 'string' ? current.selectedId : null
      if (prev && next.items.some((i) => i.id === prev)) {
        updateSelectedId(prev)
      } else if (next.items.length > 0) {
        updateSelectedId(next.items[0].id)
      } else {
        updateSelectedId(null)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load work items'
      console.error('Failed to load work items', e)
      setError(message)
      setData({ items: [], meta: { totalCount: 0, actionRequiredCount: 0, overdueCount: 0 } })
    } finally {
      setLoading(false)
    }
  }, [updateSelectedId])

  const loadCompleted = useCallback(async (options?: { force?: boolean }) => {
    try {
      const force = options?.force ?? false
      setCompletedLoading(true)
      setError(null)
      const next = await WorkItemsApi.listCompleted({ force })
      setCompletedData(next)
      const current = usePageStateStore.getState().pages['/work']?.custom
      const prev = typeof current?.completedSelectedId === 'string' ? current.completedSelectedId : null
      if (prev && next.items.some((i) => i.id === prev)) {
        updateCompletedSelectedId(prev)
      } else if (next.items.length > 0) {
        updateCompletedSelectedId(next.items[0].id)
      } else {
        updateCompletedSelectedId(null)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load completed items'
      console.error('Failed to load completed items', e)
      setError(message)
      setCompletedData({ items: [], meta: { totalCount: 0 } })
    } finally {
      setCompletedLoading(false)
    }
  }, [updateCompletedSelectedId])

  useEffect(() => {
    loadPending()
  }, [loadPending])

  // Keep completed items fresh when entering completed tab
  useEffect(() => {
    if (activeTab === 'completed') {
      loadCompleted({ force: true })
    }
  }, [activeTab, loadCompleted])

  const handleTabChange = useCallback((tab: InboxTab) => {
    setActiveTab('/work', tab)
    setError(null)
  }, [setActiveTab])

  const handleAction = useCallback(async (actionId: ActionId, item: WorkItemDTO) => {
    setError(null)
    try {
      await executeAction(actionId, item.entity)
      WorkItemsApi.invalidate()
      await loadPending({ force: true })
      await loadCompleted({ force: true })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to complete action'
      setError(message)
    }
  }, [loadPending, loadCompleted])

  const handleRequestCreated = useCallback(() => {
    setCreateModalOpen(false)
    loadPending({ force: true })
  }, [loadPending])

  return (
    <div className="h-[calc(100vh-theme(spacing.32))] flex flex-col -mt-4">
      <CreateRequestModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleRequestCreated}
      />

      {error ? (
        <Alert variant="error" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <div className="flex-1 min-h-0">
        <InboxDashboard
          activeTab={activeTab}
          onTabChange={handleTabChange}
          data={data}
          completedData={completedData}
          loading={loading}
          completedLoading={completedLoading}
          error={null}
          selectedId={activeTab === 'pending' ? selectedId : completedSelectedId}
          onSelect={activeTab === 'pending' ? updateSelectedId : updateCompletedSelectedId}
          onAction={handleAction}
          onNewRequest={() => setCreateModalOpen(true)}
        />
      </div>
    </div>
  )
}
