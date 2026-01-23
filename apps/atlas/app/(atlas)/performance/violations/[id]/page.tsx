'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ApiError,
  DisciplinaryActionsApi,
  getApiBase,
  type DisciplinaryAction,
} from '@/lib/api-client'
import type { ActionId } from '@/lib/contracts/action-ids'
import type { WorkflowRecordDTO } from '@/lib/contracts/workflow-record'
import { WorkflowRecordLayout } from '@/components/layouts/WorkflowRecordLayout'
import { Card, CardDivider } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PencilIcon,
  XIcon,
} from '@/components/ui/Icons'
import { cn } from '@/lib/utils'
import {
  DISCIPLINARY_ACTION_TYPE_LABELS,
  DISCIPLINARY_ACTION_TYPE_OPTIONS,
  DISCIPLINARY_STATUS_OPTIONS,
  VALUE_BREACH_LABELS,
  VALUE_BREACH_OPTIONS,
  VIOLATION_REASON_GROUPS,
  VIOLATION_REASON_LABELS,
  VIOLATION_TYPE_LABELS,
  VIOLATION_TYPE_OPTIONS,
} from '@/lib/domain/disciplinary/constants'
import { ensureMe, useMeStore } from '@/lib/store/me'

const severityOptions = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
]

const EditDisciplinarySchema = z.object({
  violationType: z.string().min(1, 'Violation type is required'),
  violationReason: z.string().min(1, 'Violation reason is required'),
  valuesBreached: z.array(z.string()).default([]),
  severity: z.string().min(1, 'Severity is required'),
  incidentDate: z.string().min(1, 'Incident date is required'),
  description: z.string().min(1, 'Description is required'),
  witnesses: z.string().optional().nullable(),
  evidence: z.string().optional().nullable(),
  actionTaken: z.string().min(1, 'Action taken is required'),
  actionDate: z.string().optional().nullable(),
  actionDetails: z.string().optional().nullable(),
  followUpDate: z.string().optional().nullable(),
  followUpNotes: z.string().optional().nullable(),
  status: z.string().min(1, 'Status is required'),
  resolution: z.string().optional().nullable(),
})

type FormData = z.infer<typeof EditDisciplinarySchema>

type NotesDialogState = {
  actionId:
    | 'disciplinary.hrApprove'
    | 'disciplinary.hrReject'
    | 'disciplinary.superAdminApprove'
    | 'disciplinary.superAdminReject'
  title: string
  description: string
  approved: boolean
  required: boolean
}

type AppealDecision = 'UPHELD' | 'MODIFIED' | 'OVERTURNED'

function buildApiUrl(path: string): string {
  const base = getApiBase().replace(/\/$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

async function postJson(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = payload?.error || payload?.message || `${res.status} ${res.statusText}`
    throw new ApiError(msg, res.status, payload)
  }

  return payload
}

function toLabel(map: Record<string, string>, value: string): string {
  return map[value] ?? value.replaceAll('_', ' ')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function ViolationWorkflowPage() {
  const params = useParams()
  const id = params.id as string

  const [dto, setDto] = useState<WorkflowRecordDTO | null>(null)
  const [record, setRecord] = useState<DisciplinaryAction | null>(null)
  const me = useMeStore((s) => s.me)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  const [notesDialog, setNotesDialog] = useState<NotesDialogState | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [notesError, setNotesError] = useState<string | null>(null)

  const [appealOpen, setAppealOpen] = useState(false)
  const [appealDraft, setAppealDraft] = useState('')
  const [appealError, setAppealError] = useState<string | null>(null)

  const [appealDecisionOpen, setAppealDecisionOpen] = useState(false)
  const [appealDecision, setAppealDecision] = useState<AppealDecision>('UPHELD')
  const [appealDecisionDraft, setAppealDecisionDraft] = useState('')
  const [appealDecisionError, setAppealDecisionError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting: isSaving },
  } = useForm<FormData>({
    resolver: zodResolver(EditDisciplinarySchema),
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const [workflow, raw] = await Promise.all([
        DisciplinaryActionsApi.getWorkflowRecord(id),
        DisciplinaryActionsApi.get(id),
        ensureMe().catch(() => null),
      ])

      setDto(workflow)
      setRecord(raw)
      setSelectedValues(raw.valuesBreached ?? [])

      // Initialize form
      reset({
        violationType: raw.violationType,
        violationReason: raw.violationReason,
        valuesBreached: raw.valuesBreached ?? [],
        severity: raw.severity,
        incidentDate: raw.incidentDate?.split('T')[0] ?? '',
        description: raw.description,
        witnesses: raw.witnesses,
        evidence: raw.evidence,
        actionTaken: raw.actionTaken,
        actionDate: raw.actionDate?.split('T')[0] ?? '',
        actionDetails: raw.actionDetails,
        followUpDate: raw.followUpDate?.split('T')[0] ?? '',
        followUpNotes: raw.followUpNotes,
        status: raw.status,
        resolution: raw.resolution,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load violation'
      setError(message)
      setErrorDetails(null)
      setDto(null)
      setRecord(null)
    } finally {
      setLoading(false)
    }
  }, [id, reset])

  useEffect(() => {
    void load()
  }, [load])

  const canEdit = useMemo(() => {
    if (!me || !record) return false
    return Boolean(me.isHR || me.isSuperAdmin || (record.createdById && record.createdById === me.id))
  }, [me, record])

  const toggleValue = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    setSelectedValues(newValues)
    setValue('valuesBreached', newValues)
  }

  const onSave = async (data: FormData) => {
    if (!record || !canEdit) return

    setError(null)
    setSuccessMessage(null)

    try {
      const updated = await DisciplinaryActionsApi.update(id, {
        ...data,
        witnesses: data.witnesses ?? null,
        evidence: data.evidence ?? null,
        actionDate: data.actionDate ?? null,
        actionDetails: data.actionDetails ?? null,
        followUpDate: data.followUpDate ?? null,
        followUpNotes: data.followUpNotes ?? null,
        resolution: data.resolution ?? null,
      })
      setRecord(updated)
      setIsEditing(false)
      setSuccessMessage('Violation record updated')
    } catch (e: any) {
      setError(e.message || 'Failed to save violation')
    }
  }

  const cancelEdit = () => {
    if (!record) return
    setSelectedValues(record.valuesBreached ?? [])
    reset({
      violationType: record.violationType,
      violationReason: record.violationReason,
      valuesBreached: record.valuesBreached ?? [],
      severity: record.severity,
      incidentDate: record.incidentDate?.split('T')[0] ?? '',
      description: record.description,
      witnesses: record.witnesses,
      evidence: record.evidence,
      actionTaken: record.actionTaken,
      actionDate: record.actionDate?.split('T')[0] ?? '',
      actionDetails: record.actionDetails,
      followUpDate: record.followUpDate?.split('T')[0] ?? '',
      followUpNotes: record.followUpNotes,
      status: record.status,
      resolution: record.resolution,
    })
    setIsEditing(false)
    setError(null)
  }

  const onAction = useCallback(
    async (actionId: ActionId) => {
      setError(null)
      setErrorDetails(null)

      if (!record) return

      const fail = (e: unknown) => {
        if (e instanceof ApiError && Array.isArray(e.body?.details)) {
          setError(e.body?.error || 'Validation failed')
          setErrorDetails(
            e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim())
          )
          return
        }

        const message = e instanceof Error ? e.message : 'Failed to complete action'
        setError(message)
      }

      try {
        if (actionId === 'disciplinary.acknowledge') {
          setSubmitting(true)
          await postJson(`/api/disciplinary-actions/${encodeURIComponent(id)}/acknowledge`)
          await load()
          return
        }

        if (actionId === 'disciplinary.appeal') {
          setAppealError(null)
          setAppealDraft(record.appealReason ?? '')
          setAppealOpen(true)
          return
        }

        if (actionId === 'disciplinary.appeal.hrDecide') {
          setAppealDecisionError(null)
          setAppealDecision('UPHELD')
          setAppealDecisionDraft('')
          setAppealDecisionOpen(true)
          return
        }

        if (
          actionId === 'disciplinary.hrApprove' ||
          actionId === 'disciplinary.hrReject' ||
          actionId === 'disciplinary.superAdminApprove' ||
          actionId === 'disciplinary.superAdminReject'
        ) {
          const isHr = actionId.startsWith('disciplinary.hr')
          const approved = actionId.endsWith('Approve')
          const required = !approved

          setNotesError(null)
          setNotesDraft('')
          setNotesDialog({
            actionId,
            approved,
            required,
            title: approved
              ? isHr
                ? 'Approve as HR'
                : 'Final approval'
              : isHr
                ? 'Request changes (HR)'
                : 'Request changes (Admin)',
            description: approved
              ? 'Optionally leave short notes for the record.'
              : 'Write what needs to be fixed before you can approve.',
          })
          return
        }
      } catch (e) {
        fail(e)
      } finally {
        setSubmitting(false)
      }
    },
    [id, load, record]
  )

  const submitNotes = useCallback(async () => {
    if (!notesDialog) return

    const notes = notesDraft.trim()
    if (notesDialog.required && !notes) {
      setNotesError('Notes are required.')
      return
    }

    setNotesError(null)
    setSubmitting(true)
    setError(null)
    setErrorDetails(null)

    try {
      const endpoint =
        notesDialog.actionId === 'disciplinary.hrApprove' ||
        notesDialog.actionId === 'disciplinary.hrReject'
          ? 'hr-review'
          : 'super-admin-review'

      await postJson(`/api/disciplinary-actions/${encodeURIComponent(id)}/${endpoint}`, {
        approved: notesDialog.approved,
        notes: notes ? notes : null,
      })

      setNotesDialog(null)
      setNotesDraft('')
      await load()
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.body?.details)) {
        setError(e.body?.error || 'Validation failed')
        setErrorDetails(
          e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim())
        )
        return
      }

      const message = e instanceof Error ? e.message : 'Failed to submit action'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [id, load, notesDialog, notesDraft])

  const submitAppeal = useCallback(async () => {
    const text = appealDraft.trim()
    if (text.length < 10) {
      setAppealError('Appeal text must be at least 10 characters.')
      return
    }

    setAppealError(null)
    setSubmitting(true)
    setError(null)
    setErrorDetails(null)

    try {
      await postJson(`/api/disciplinary-actions/${encodeURIComponent(id)}/appeal`, {
        appealReason: text,
      })
      setAppealOpen(false)
      await load()
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.body?.details)) {
        setAppealError(e.body?.error || 'Validation failed')
        return
      }

      const message = e instanceof Error ? e.message : 'Failed to submit appeal'
      setAppealError(message)
    } finally {
      setSubmitting(false)
    }
  }, [appealDraft, id, load])

  const decideAppeal = useCallback(async () => {
    const text = appealDecisionDraft.trim()
    if (!text) {
      setAppealDecisionError('Decision text is required.')
      return
    }

    setAppealDecisionError(null)
    setSubmitting(true)
    setError(null)
    setErrorDetails(null)

    try {
      await postJson(`/api/disciplinary-actions/${encodeURIComponent(id)}/appeal`, {
        hrDecision: true,
        appealStatus: appealDecision,
        appealResolution: text,
      })
      setAppealDecisionOpen(false)
      await load()
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.body?.details)) {
        setAppealDecisionError(e.body?.error || 'Validation failed')
        return
      }

      const message = e instanceof Error ? e.message : 'Failed to decide appeal'
      setAppealDecisionError(message)
    } finally {
      setSubmitting(false)
    }
  }, [appealDecision, appealDecisionDraft, id, load])

  const layoutDto = useMemo(() => {
    if (!dto) return null
    if (!isEditing) return dto
    return { ...dto, actions: { primary: null, secondary: [], more: [] } }
  }, [dto, isEditing])

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

  if (!dto || !record) {
    return (
      <Card padding="lg">
        <p className="text-sm font-medium text-foreground">Violation</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Not found'}</p>
      </Card>
    )
  }

  return (
    <>
      <WorkflowRecordLayout
        data={layoutDto ?? dto}
        onAction={onAction}
        headerActions={
          canEdit && !isEditing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsEditing(true)}
              icon={<PencilIcon className="h-4 w-4" />}
            >
              Edit
            </Button>
          ) : null
        }
      >
        {/* Inline feedback messages */}
        {(error || successMessage) && !isEditing && (
          <div className="mb-6 space-y-3">
            {error && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
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
            {successMessage && (
              <div className="flex items-center gap-2 text-sm text-success-600 bg-success-500/10 rounded-md px-3 py-2">
                <span>✓</span>
                <span>{successMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Edit Mode or View Mode */}
            {isEditing ? (
              /* Edit Mode */
              <form onSubmit={handleSubmit(onSave)}>
                <Card padding="lg">
                  <div className="flex items-center justify-between pb-6 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Edit Violation Record</h3>
                    <Button type="button" variant="ghost" size="icon" onClick={cancelEdit}>
                      <XIcon className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="pt-6 space-y-6">
                    {/* Incident Details */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Incident Details
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Violation Type <span className="text-destructive">*</span></Label>
                          <NativeSelect
                            {...register('violationType')}
                            className={cn(errors.violationType && 'border-destructive')}
                          >
                            <option value="">Select type...</option>
                            {VIOLATION_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </NativeSelect>
                          {errors.violationType && (
                            <p className="text-xs text-destructive">{errors.violationType.message}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Severity <span className="text-destructive">*</span></Label>
                          <NativeSelect
                            {...register('severity')}
                            className={cn(errors.severity && 'border-destructive')}
                          >
                            {severityOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </NativeSelect>
                          {errors.severity && (
                            <p className="text-xs text-destructive">{errors.severity.message}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Incident Date <span className="text-destructive">*</span></Label>
                          <Input
                            {...register('incidentDate')}
                            type="date"
                            className={cn(errors.incidentDate && 'border-destructive')}
                          />
                          {errors.incidentDate && (
                            <p className="text-xs text-destructive">{errors.incidentDate.message}</p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label>Status <span className="text-destructive">*</span></Label>
                          <NativeSelect
                            {...register('status')}
                            className={cn(errors.status && 'border-destructive')}
                          >
                            <option value="">Select status...</option>
                            {DISCIPLINARY_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </NativeSelect>
                          {errors.status && (
                            <p className="text-xs text-destructive">{errors.status.message}</p>
                          )}
                        </div>

                        <div className="sm:col-span-2 space-y-2">
                          <Label>Violation Reason <span className="text-destructive">*</span></Label>
                          <NativeSelect
                            {...register('violationReason')}
                            className={cn(errors.violationReason && 'border-destructive')}
                          >
                            <option value="">Select reason...</option>
                            {VIOLATION_REASON_GROUPS.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </NativeSelect>
                          {errors.violationReason && (
                            <p className="text-xs text-destructive">{errors.violationReason.message}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <CardDivider />

                    {/* Description */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Description
                      </h4>
                      <div className="space-y-2">
                        <Textarea
                          {...register('description')}
                          rows={4}
                          placeholder="Full description of the incident..."
                          className={cn('resize-none', errors.description && 'border-destructive')}
                        />
                        {errors.description && (
                          <p className="text-xs text-destructive">{errors.description.message}</p>
                        )}
                      </div>
                    </div>

                    <CardDivider />

                    {/* Values Breached */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Values Breached
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {VALUE_BREACH_OPTIONS.map((opt) => (
                          <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                            <Checkbox
                              checked={selectedValues.includes(opt.value)}
                              onCheckedChange={() => toggleValue(opt.value)}
                            />
                            <span className="text-sm text-foreground">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <CardDivider />

                    {/* Evidence & Witnesses */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Evidence & Witnesses
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Witnesses</Label>
                          <Input {...register('witnesses')} placeholder="Names of witnesses..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Evidence</Label>
                          <Input {...register('evidence')} placeholder="Evidence details..." />
                        </div>
                      </div>
                    </div>

                    <CardDivider />

                    {/* Action Taken */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Action Taken
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Action <span className="text-destructive">*</span></Label>
                          <NativeSelect
                            {...register('actionTaken')}
                            className={cn(errors.actionTaken && 'border-destructive')}
                          >
                            <option value="">Select action...</option>
                            {DISCIPLINARY_ACTION_TYPE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </NativeSelect>
                          {errors.actionTaken && (
                            <p className="text-xs text-destructive">{errors.actionTaken.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Action Date</Label>
                          <Input {...register('actionDate')} type="date" />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label>Action Details</Label>
                          <Textarea {...register('actionDetails')} rows={3} className="resize-none" />
                        </div>
                      </div>
                    </div>

                    <CardDivider />

                    {/* Follow-up & Resolution */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Follow-up & Resolution
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Follow-up Date</Label>
                          <Input {...register('followUpDate')} type="date" />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label>Follow-up Notes</Label>
                          <Textarea {...register('followUpNotes')} rows={3} className="resize-none" />
                        </div>
                        <div className="sm:col-span-2 space-y-2">
                          <Label>Resolution</Label>
                          <Textarea {...register('resolution')} rows={3} className="resize-none" />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-6 border-t border-border space-y-3">
                      {/* Inline feedback messages */}
                      {error && (
                        <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
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
                      {successMessage && (
                        <div className="flex items-center gap-2 text-sm text-success-600 bg-success-500/10 rounded-md px-3 py-2">
                          <span>✓</span>
                          <span>{successMessage}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-3">
                        <Button type="button" variant="secondary" onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button type="submit" loading={isSaving}>
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              </form>
            ) : (
              /* View Mode */
              <div className="space-y-6">
                {/* Violation Details Card */}
                <Card padding="lg">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Violation Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Type</p>
                      <p className="text-foreground">
                        {toLabel(VIOLATION_TYPE_LABELS as Record<string, string>, record.violationType)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Reason</p>
                      <p className="text-foreground">
                        {toLabel(VIOLATION_REASON_LABELS as Record<string, string>, record.violationReason)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Reported by</p>
                      <p className="text-foreground">
                        {record.createdBy
                          ? `${record.createdBy.firstName} ${record.createdBy.lastName}`
                          : record.reportedBy}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Reported date</p>
                      <p className="text-foreground">{formatDate(record.reportedDate)}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Description</p>
                      <p className="text-foreground whitespace-pre-line">{record.description}</p>
                    </div>
                  </div>
                </Card>

                {/* Values Breached */}
                {record.valuesBreached?.length ? (
                  <Card padding="lg">
                    <h3 className="text-sm font-semibold text-foreground">Values Breached</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Used for escalation rules and coaching focus.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {record.valuesBreached.map((value) => (
                        <span
                          key={value}
                          className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-semibold text-destructive"
                        >
                          {toLabel(VALUE_BREACH_LABELS as Record<string, string>, value)}
                        </span>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {/* Evidence & Witnesses */}
                {(record.witnesses || record.evidence) ? (
                  <Card padding="lg">
                    <h3 className="text-sm font-semibold text-foreground mb-4">Evidence & Witnesses</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                        <p className="text-xs font-medium text-muted-foreground">Witnesses</p>
                        <p className="mt-2 text-sm text-foreground whitespace-pre-line">
                          {record.witnesses || '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                        <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                        <p className="mt-2 text-sm text-foreground whitespace-pre-line">
                          {record.evidence || '—'}
                        </p>
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            )}
      </WorkflowRecordLayout>

      {/* Notes Dialog */}
      <Dialog
        open={Boolean(notesDialog)}
        onOpenChange={(open) => {
          if (submitting) return
          if (!open) {
            setNotesDialog(null)
            setNotesDraft('')
            setNotesError(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{notesDialog?.title ?? 'Update'}</DialogTitle>
            <DialogDescription>{notesDialog?.description ?? ''}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes {notesDialog?.required ? <span className="text-destructive">*</span> : null}
            </Label>
            <Textarea
              id="notes"
              value={notesDraft}
              onChange={(e) => {
                setNotesDraft(e.target.value)
                setNotesError(null)
              }}
              placeholder={notesDialog?.approved ? 'Optional...' : 'Be specific: what needs updating?'}
              className={cn(notesError && 'border-destructive')}
              rows={5}
            />
            {notesError ? <p className="text-xs text-destructive">{notesError}</p> : null}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              disabled={submitting}
              onClick={() => {
                setNotesDialog(null)
                setNotesDraft('')
                setNotesError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              variant={notesDialog?.approved ? 'primary' : 'danger'}
              onClick={() => {
                void submitNotes()
              }}
            >
              {notesDialog?.approved ? 'Confirm' : 'Send back'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appeal Dialog */}
      <Dialog
        open={appealOpen}
        onOpenChange={(open) => {
          if (submitting) return
          setAppealOpen(open)
          if (!open) {
            setAppealDraft('')
            setAppealError(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {record?.status === 'APPEAL_PENDING_HR' ? 'Update Appeal' : 'Submit Appeal'}
            </DialogTitle>
            <DialogDescription>
              Keep it factual. Include context, dates, and what outcome you're requesting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="appealText">
              Appeal text <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="appealText"
              value={appealDraft}
              onChange={(e) => {
                setAppealDraft(e.target.value)
                setAppealError(null)
              }}
              placeholder="Write your appeal..."
              className={cn(appealError && 'border-destructive')}
              rows={7}
            />
            {appealError ? <p className="text-xs text-destructive">{appealError}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="secondary" disabled={submitting} onClick={() => setAppealOpen(false)}>
              Cancel
            </Button>
            <Button disabled={submitting} onClick={() => void submitAppeal()}>
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appeal Decision Dialog */}
      <Dialog
        open={appealDecisionOpen}
        onOpenChange={(open) => {
          if (submitting) return
          setAppealDecisionOpen(open)
          if (!open) {
            setAppealDecision('UPHELD')
            setAppealDecisionDraft('')
            setAppealDecisionError(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Decide Appeal (HR)</DialogTitle>
            <DialogDescription>
              If you uphold or modify the decision, the record returns to acknowledgement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="appealDecision">Decision</Label>
              <NativeSelect
                id="appealDecision"
                value={appealDecision}
                onChange={(e) => setAppealDecision(e.target.value as AppealDecision)}
              >
                <option value="UPHELD">Upheld (violation stands)</option>
                <option value="MODIFIED">Modified (adjust action/severity)</option>
                <option value="OVERTURNED">Overturned (dismiss violation)</option>
              </NativeSelect>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appealDecisionText">
                Decision text <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="appealDecisionText"
                value={appealDecisionDraft}
                onChange={(e) => {
                  setAppealDecisionDraft(e.target.value)
                  setAppealDecisionError(null)
                }}
                placeholder="Explain the decision..."
                className={cn(appealDecisionError && 'border-destructive')}
                rows={6}
              />
              {appealDecisionError ? (
                <p className="text-xs text-destructive">{appealDecisionError}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" disabled={submitting} onClick={() => setAppealDecisionOpen(false)}>
              Cancel
            </Button>
            <Button disabled={submitting} onClick={() => void decideAppeal()}>
              Confirm Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Working indicator */}
      {submitting ? (
        <div className="fixed inset-x-0 bottom-4 flex justify-center pointer-events-none">
          <div className="rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow">
            Working...
          </div>
        </div>
      ) : null}
    </>
  )
}
