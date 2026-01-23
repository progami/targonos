'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ApiError, LeavesApi, type LeaveRequest } from '@/lib/api-client'
import type { ActionId } from '@/lib/contracts/action-ids'
import type { WorkflowRecordDTO } from '@/lib/contracts/workflow-record'
import { executeAction } from '@/lib/actions/execute-action'
import { WorkflowRecordLayout } from '@/components/layouts/WorkflowRecordLayout'
import { Card } from '@/components/ui/card'
import { LEAVE_TYPE_LABELS } from '@/lib/domain/leave/constants'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function LeaveWorkflowPage() {
  const params = useParams()
  const id = params.id as string

  const [dto, setDto] = useState<WorkflowRecordDTO | null>(null)
  const [leave, setLeave] = useState<LeaveRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const [workflow, raw] = await Promise.all([
        LeavesApi.getWorkflowRecord(id),
        LeavesApi.get(id),
      ])
      setDto(workflow)
      setLeave(raw)
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.body?.details)) {
        setError(e.body?.error || 'Failed to load leave request')
        setErrorDetails(e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim()))
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load leave request')
      }

      setDto(null)
      setLeave(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const onAction = useCallback(
    async (actionId: ActionId, input?: Parameters<typeof executeAction>[2]) => {
      setError(null)
      setErrorDetails(null)

      try {
        await executeAction(actionId, { type: 'LEAVE_REQUEST', id }, input)
        await load()
      } catch (e) {
        if (e instanceof ApiError && Array.isArray(e.body?.details)) {
          setError(e.body?.error || 'Validation failed')
          setErrorDetails(e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim()))
          return
        }

        setError(e instanceof Error ? e.message : 'Failed to complete action')
      }
    },
    [id, load]
  )

  if (loading) {
    return (
      <Card padding="lg">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-40 bg-muted rounded" />
        </div>
      </Card>
    )
  }

  if (!dto) {
    return (
      <Card padding="lg">
        <p className="text-sm font-medium text-foreground">Leave request</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Not found'}</p>
      </Card>
    )
  }

  return (
    <WorkflowRecordLayout data={dto} onAction={onAction}>
      {/* Inline feedback messages */}
      {error && (
        <div className="mb-6 flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          <span className="shrink-0">✕</span>
          <div>
            <span>{error}</span>
            {errorDetails && errorDetails.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-xs">
                {errorDetails.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {leave ? (
        <Card padding="lg">
          <h3 className="text-sm font-semibold text-foreground mb-4">Leave details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Leave type</p>
              <p className="text-foreground">
                {LEAVE_TYPE_LABELS[leave.leaveType as keyof typeof LEAVE_TYPE_LABELS] ??
                  leave.leaveType.replaceAll('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Requested</p>
              <p className="text-foreground">{formatDate(leave.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Start date</p>
              <p className="text-foreground">{formatDate(leave.startDate)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">End date</p>
              <p className="text-foreground">{formatDate(leave.endDate)}</p>
            </div>
            {leave.reason ? (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Reason</p>
                <p className="text-foreground whitespace-pre-line">{leave.reason}</p>
              </div>
            ) : null}
          </div>

          {/* Rejection info if rejected */}
          {leave.status === 'REJECTED' && leave.reviewedBy ? (
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-sm font-semibold text-foreground mb-2">Rejection</h4>
              <p className="text-sm text-foreground">
                {leave.reviewedBy.firstName} {leave.reviewedBy.lastName}
                {leave.reviewedAt ? <span className="text-muted-foreground"> • {formatDate(leave.reviewedAt)}</span> : null}
              </p>
              {leave.reviewNotes ? (
                <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                  {leave.reviewNotes}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </WorkflowRecordLayout>
  )
}
