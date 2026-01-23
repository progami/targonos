'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ApiError,
  PerformanceReviewsApi,
  type PerformanceReview,
} from '@/lib/api-client'
import type { ActionId } from '@/lib/contracts/action-ids'
import type { WorkflowRecordDTO } from '@/lib/contracts/workflow-record'
import { executeAction } from '@/lib/actions/execute-action'
import { WorkflowRecordLayout } from '@/components/layouts/WorkflowRecordLayout'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { cn } from '@/lib/utils'
import {
  REVIEW_PERIOD_TYPES,
  REVIEW_PERIOD_TYPE_LABELS,
  getAllowedReviewPeriodTypes,
  inferReviewPeriodParts,
} from '@/lib/review-period'
import { UpdatePerformanceReviewSchema } from '@/lib/validations'
import { RatingDisplayRow, RatingInputRow } from '@/components/performance/reviews/RatingRows'
import { ensureMe, useMeStore } from '@/lib/store/me'

type FormData = z.infer<typeof UpdatePerformanceReviewSchema>

const REVIEW_TYPES = [
  { value: 'PROBATION', label: 'Probation (90-day)' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
]

const RATING_FIELDS = [
  { key: 'overallRating', label: 'Overall Rating', description: 'General performance assessment' },
  { key: 'qualityOfWork', label: 'Quality of Work', description: 'Accuracy and thoroughness' },
  { key: 'productivity', label: 'Productivity', description: 'Output and efficiency' },
  { key: 'communication', label: 'Communication', description: 'Written and verbal skills' },
  { key: 'teamwork', label: 'Teamwork', description: 'Collaboration with others' },
  { key: 'initiative', label: 'Initiative', description: 'Self-motivation and proactivity' },
  { key: 'attendance', label: 'Attendance', description: 'Punctuality and reliability' },
] as const

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function PerformanceReviewPage() {
  const params = useParams()
  const id = params.id as string
  const currentYear = new Date().getFullYear()

  const [dto, setDto] = useState<WorkflowRecordDTO | null>(null)
  const [review, setReview] = useState<PerformanceReview | null>(null)
  const me = useMeStore((s) => s.me)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('details')

  const periodYearOptions = Array.from({ length: 8 }, (_, idx) => currentYear - 5 + idx)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting: isSaving },
  } = useForm<FormData>({
    resolver: zodResolver(UpdatePerformanceReviewSchema),
    defaultValues: {
      reviewType: 'ANNUAL',
      periodType: 'ANNUAL',
      periodYear: currentYear,
      overallRating: 6,
      qualityOfWork: 6,
      productivity: 6,
      communication: 6,
      teamwork: 6,
      initiative: 6,
      attendance: 6,
    },
  })

  const reviewType = watch('reviewType') ?? 'ANNUAL'
  const periodType = watch('periodType') ?? 'ANNUAL'
  const ratings = {
    overallRating: watch('overallRating') ?? 6,
    qualityOfWork: watch('qualityOfWork') ?? 6,
    productivity: watch('productivity') ?? 6,
    communication: watch('communication') ?? 6,
    teamwork: watch('teamwork') ?? 6,
    initiative: watch('initiative') ?? 6,
    attendance: watch('attendance') ?? 6,
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorDetails(null)

    try {
      const [workflow, raw] = await Promise.all([
        PerformanceReviewsApi.getWorkflowRecord(id),
        PerformanceReviewsApi.get(id),
        ensureMe().catch(() => null),
      ])
      setDto(workflow)
      setReview(raw)

      // Initialize form with review data
      const inferredPeriod = inferReviewPeriodParts(raw.reviewPeriod)
      const formPeriodType = raw.periodType || inferredPeriod.periodType || 'ANNUAL'
      const formPeriodYear = raw.periodYear ?? inferredPeriod.periodYear ?? currentYear

      reset({
        reviewType: (raw.reviewType || 'ANNUAL') as 'PROBATION' | 'QUARTERLY' | 'ANNUAL',
        periodType: formPeriodType as any,
        periodYear: formPeriodYear,
        reviewDate: raw.reviewDate ? new Date(raw.reviewDate).toISOString().split('T')[0] : '',
        roleTitle: raw.roleTitle || raw.employee?.position || '',
        overallRating: raw.overallRating || 6,
        qualityOfWork: raw.qualityOfWork || 6,
        productivity: raw.productivity || 6,
        communication: raw.communication || 6,
        teamwork: raw.teamwork || 6,
        initiative: raw.initiative || 6,
        attendance: raw.attendance || 6,
        strengths: raw.strengths || '',
        areasToImprove: raw.areasToImprove || '',
        goals: raw.goals || '',
        comments: raw.comments || '',
      })

      // Auto-start if NOT_STARTED
      if (raw.status === 'NOT_STARTED') {
        try {
          const started = await PerformanceReviewsApi.start(id)
          setReview(started)
          setSuccessMessage('Review started. Fill in the ratings and feedback below.')
        } catch (e) {
          console.error('Failed to auto-start review:', e)
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load performance review'
      setError(message)
      setDto(null)
      setReview(null)
    } finally {
      setLoading(false)
    }
  }, [id, currentYear, reset])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const allowedTypes = getAllowedReviewPeriodTypes(reviewType)
    if (!allowedTypes.includes(periodType as any)) {
      setValue('periodType', allowedTypes[0] as any)
    }
  }, [reviewType, periodType, setValue])

  // Permissions
  const isDraft = useMemo(() => {
    return Boolean(review && ['NOT_STARTED', 'IN_PROGRESS', 'DRAFT'].includes(review.status))
  }, [review])

  const isReviewer = useMemo(() => {
    return Boolean(me && review?.assignedReviewerId && me.id === review.assignedReviewerId)
  }, [me, review?.assignedReviewerId])

  const canRespondToHrChanges = useMemo(() => {
    if (!review || !isReviewer) return false
    if (review.status !== 'PENDING_HR_REVIEW' || review.hrApproved !== false) return false

    // Allow edits only until the manager resubmits (submittedAt moves past hrReviewedAt).
    if (!review.hrReviewedAt || !review.submittedAt) return true
    return new Date(review.submittedAt).getTime() <= new Date(review.hrReviewedAt).getTime()
  }, [isReviewer, review])

  const canRespondToAdminChanges = useMemo(() => {
    if (!review || !isReviewer) return false
    if (review.status !== 'PENDING_SUPER_ADMIN' || review.superAdminApproved !== false) return false

    // Allow edits only until the manager resubmits (submittedAt moves past superAdminApprovedAt).
    if (!review.superAdminApprovedAt || !review.submittedAt) return true
    return new Date(review.submittedAt).getTime() <= new Date(review.superAdminApprovedAt).getTime()
  }, [isReviewer, review])

  const isHrOrAdmin = Boolean(me?.isHR || me?.isSuperAdmin)
  const canEditContent = isDraft || canRespondToHrChanges || canRespondToAdminChanges
  const canEditMeta = Boolean(review) && (canEditContent || isHrOrAdmin)

  const detailsHasErrors = Boolean(
    errors.reviewType || errors.periodType || errors.periodYear ||
    errors.reviewDate || errors.roleTitle
  )
  const ratingsHasErrors = Boolean(
    errors.overallRating || errors.qualityOfWork || errors.productivity ||
    errors.communication || errors.teamwork || errors.initiative || errors.attendance
  )

  // Workflow actions
  const onAction = useCallback(
    async (actionId: ActionId, input?: Parameters<typeof executeAction>[2]) => {
      setError(null)
      setErrorDetails(null)
      try {
        await executeAction(actionId, { type: 'PERFORMANCE_REVIEW', id }, input)
        await load()
      } catch (e) {
        if (e instanceof ApiError && Array.isArray(e.body?.details)) {
          setError(e.body?.error || 'Validation failed')
          setErrorDetails(e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim()))
          return
        }
        const message = e instanceof Error ? e.message : 'Failed to complete action'
        setError(message)
      }
    },
    [id, load]
  )

  // Save draft
  async function onSave(data: FormData) {
    if (!review || !canEditMeta) return

    setError(null)
    setSuccessMessage(null)

    try {
      const update: Record<string, unknown> = {}

      if (canEditMeta) {
        update.reviewType = data.reviewType
        update.periodType = data.periodType
        update.periodYear = data.periodYear
        update.reviewDate = data.reviewDate
        update.roleTitle = data.roleTitle
      }

      if (canEditContent) {
        update.overallRating = data.overallRating
        update.qualityOfWork = data.qualityOfWork
        update.productivity = data.productivity
        update.communication = data.communication
        update.teamwork = data.teamwork
        update.initiative = data.initiative
        update.attendance = data.attendance
        update.strengths = data.strengths || null
        update.areasToImprove = data.areasToImprove || null
        update.goals = data.goals || null
        update.comments = data.comments || null
      }

      const updated = await PerformanceReviewsApi.update(id, update)
      setReview(updated)
      setSuccessMessage(canEditContent ? 'Review saved as draft' : 'Review metadata updated')
    } catch (e: any) {
      setError(e.message || 'Failed to save review')
    }
  }

  // Submit for review
  async function handleSubmitForReview() {
    if (!review || !canEditContent) return

    setSubmitting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const formValues = watch()
      await PerformanceReviewsApi.update(id, {
        reviewType: formValues.reviewType,
        periodType: formValues.periodType,
        periodYear: formValues.periodYear,
        reviewDate: formValues.reviewDate,
        roleTitle: formValues.roleTitle,
        overallRating: formValues.overallRating,
        qualityOfWork: formValues.qualityOfWork,
        productivity: formValues.productivity,
        communication: formValues.communication,
        teamwork: formValues.teamwork,
        initiative: formValues.initiative,
        attendance: formValues.attendance,
        strengths: formValues.strengths || null,
        areasToImprove: formValues.areasToImprove || null,
        goals: formValues.goals || null,
        comments: formValues.comments || null,
      })

      await PerformanceReviewsApi.submit(id)
      setSuccessMessage('Submitted to HR')
      await load()
    } catch (e: any) {
      if (e instanceof ApiError && Array.isArray(e.body?.details)) {
        const details = e.body.details.filter((d: unknown) => typeof d === 'string' && d.trim())
        setError(
          details.length
            ? details.join(', ')
            : e.body?.error || e.message || 'Failed to submit review'
        )
        return
      }
      setError(e.message || 'Failed to submit review')
    } finally {
      setSubmitting(false)
    }
  }

  const allowedPeriodTypes = getAllowedReviewPeriodTypes(reviewType)
  const periodTypeOptions = REVIEW_PERIOD_TYPES
    .filter((type) => allowedPeriodTypes.includes(type as any))
    .map((type) => ({ value: type, label: REVIEW_PERIOD_TYPE_LABELS[type] }))

  const submitLabel = useMemo(() => {
    if (!review) return 'Submit for Review'
    if (review.status === 'PENDING_HR_REVIEW') return 'Resubmit to HR'
    if (review.status === 'PENDING_SUPER_ADMIN') return 'Resubmit for Final Approval'
    return 'Submit for Review'
  }, [review])

  // Workflow stages and timeline
  const layoutDto = useMemo(() => {
    if (!dto) return null
    if (!canEditContent) return dto
    return { ...dto, actions: { primary: null, secondary: [], more: [] } }
  }, [canEditContent, dto])

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

  if (!dto || !review) {
    return (
      <Card padding="lg">
        <p className="text-sm font-medium text-foreground">Performance review</p>
        <p className="text-sm text-muted-foreground mt-1">{error ?? 'Not found'}</p>
      </Card>
    )
  }

  return (
    <WorkflowRecordLayout data={layoutDto ?? dto} onAction={onAction}>
        {/* Content - Edit mode or View mode */}
        {canEditMeta ? (
          /* Edit Mode */
          <form onSubmit={handleSubmit(onSave)}>
            <Card padding="lg">
                {!canEditContent && (
                  <div className="mb-6 rounded-lg border border-border bg-muted/40 px-4 py-3">
                    <p className="text-sm text-foreground font-medium">Limited editing</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ratings and feedback are locked once this review enters the approval chain.
                    </p>
                  </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="w-full grid grid-cols-3 mb-6">
                    <TabsTrigger value="details" className="relative">
                      Details
                      {detailsHasErrors && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="ratings" className="relative">
                      Ratings
                      {ratingsHasErrors && (
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                  </TabsList>

                  {/* Details Tab */}
                  <TabsContent value="details" className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="reviewType">Review Type</Label>
                        <NativeSelect
                          {...register('reviewType')}
                          disabled={!canEditMeta}
                          className={cn(errors.reviewType && 'border-destructive')}
                        >
                          {REVIEW_TYPES.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </NativeSelect>
                        {errors.reviewType && (
                          <p className="text-xs text-destructive">{errors.reviewType.message}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="periodType">Period</Label>
                        <NativeSelect
                          {...register('periodType')}
                          disabled={!canEditMeta}
                          className={cn(errors.periodType && 'border-destructive')}
                        >
                          {periodTypeOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </NativeSelect>
                        {errors.periodType && (
                          <p className="text-xs text-destructive">{errors.periodType.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="periodYear">Year</Label>
                        <NativeSelect
                          {...register('periodYear')}
                          disabled={!canEditMeta}
                          className={cn(errors.periodYear && 'border-destructive')}
                        >
                          {periodYearOptions.map((year) => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </NativeSelect>
                        {errors.periodYear && (
                          <p className="text-xs text-destructive">{errors.periodYear.message}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reviewDate">Review Date</Label>
                        <Input
                          {...register('reviewDate')}
                          type="date"
                          disabled={!canEditMeta}
                          className={cn(errors.reviewDate && 'border-destructive')}
                        />
                        {errors.reviewDate && (
                          <p className="text-xs text-destructive">{errors.reviewDate.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="roleTitle">Role</Label>
                      <Input
                        {...register('roleTitle')}
                        placeholder="Employee's role at time of review"
                        disabled={!canEditMeta}
                        className={cn(errors.roleTitle && 'border-destructive')}
                      />
                      {errors.roleTitle && (
                        <p className="text-xs text-destructive">{errors.roleTitle.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Manager / Reviewer</Label>
                      <div className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-foreground">
                        {review.assignedReviewer
                          ? `${review.assignedReviewer.firstName} ${review.assignedReviewer.lastName}`
                          : review.reviewerName || '—'}
                        {review.assignedReviewer?.position && (
                          <span className="text-muted-foreground ml-1">
                            ({review.assignedReviewer.position})
                          </span>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Ratings Tab */}
                  <TabsContent value="ratings">
                    <div className="space-y-1">
                      {RATING_FIELDS.map((field) => (
                        <RatingInputRow
                          key={field.key}
                          label={field.label}
                          description={field.description}
                          value={ratings[field.key]}
                          onChange={(v) => setValue(field.key, v)}
                          disabled={!canEditContent}
                          error={errors[field.key]?.message}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 text-center">
                      {canEditContent
                        ? 'Click stars to rate from 1 (lowest) to 10 (highest)'
                        : 'Ratings are read-only in this workflow stage'}
                    </p>
                  </TabsContent>

                  {/* Feedback Tab */}
                  <TabsContent value="feedback" className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="strengths">Strengths</Label>
                      <Textarea
                        {...register('strengths')}
                        rows={3}
                        placeholder="Key strengths demonstrated during this period..."
                        disabled={!canEditContent}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="areasToImprove">Areas to Improve</Label>
                      <Textarea
                        {...register('areasToImprove')}
                        rows={3}
                        placeholder="Areas that need development or improvement..."
                        disabled={!canEditContent}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="goals">Goals for Next Period</Label>
                      <Textarea
                        {...register('goals')}
                        rows={3}
                        placeholder="Objectives and targets for the upcoming period..."
                        disabled={!canEditContent}
                        className="resize-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="comments">Additional Comments</Label>
                      <Textarea
                        {...register('comments')}
                        rows={3}
                        placeholder="Any other observations or notes..."
                        disabled={!canEditContent}
                        className="resize-none"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Form actions */}
                <div className="pt-6 mt-6 border-t border-border space-y-3">
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

                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground">
                      {canEditContent ? 'Changes are saved as draft until submitted' : 'Limited editing available'}
                    </div>
                    <div className="flex items-center gap-3">
                      <Button type="submit" variant="secondary" loading={isSaving}>
                        {canEditContent ? 'Save Draft' : 'Save Changes'}
                      </Button>
                      {canEditContent && (
                        <Button type="button" onClick={handleSubmitForReview} loading={submitting}>
                          {submitLabel}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
            </Card>
          </form>
        ) : (
          /* View Mode - when user cannot edit */
          <div className="space-y-6">
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

            <Card padding="lg">
                <h3 className="text-sm font-semibold text-foreground mb-4">Review Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Review Type</p>
                    <p className="text-foreground">{review.reviewType?.replaceAll('_', ' ') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Period</p>
                    <p className="text-foreground">{review.reviewPeriod || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Role</p>
                    <p className="text-foreground">{review.roleTitle || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Review Date</p>
                    <p className="text-foreground">{formatDate(review.reviewDate)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Manager</p>
                    <p className="text-foreground">
                      {review.assignedReviewer
                        ? `${review.assignedReviewer.firstName} ${review.assignedReviewer.lastName}${review.assignedReviewer.position ? ` (${review.assignedReviewer.position})` : ''}`
                        : review.reviewerName || '—'}
                    </p>
                  </div>
                </div>
              </Card>

              <Card padding="lg">
                <h3 className="text-sm font-semibold text-foreground mb-4">Ratings</h3>
                <div className="space-y-1">
                  <RatingDisplayRow label="Overall Rating" value={review.overallRating} />
                  <RatingDisplayRow label="Quality of Work" value={review.qualityOfWork} />
                  <RatingDisplayRow label="Productivity" value={review.productivity} />
                  <RatingDisplayRow label="Communication" value={review.communication} />
                  <RatingDisplayRow label="Teamwork" value={review.teamwork} />
                  <RatingDisplayRow label="Initiative" value={review.initiative} />
                  <RatingDisplayRow label="Attendance" value={review.attendance} />
                </div>
              </Card>

              {(review.strengths || review.areasToImprove || review.goals || review.comments) && (
                <Card padding="lg">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Feedback</h3>
                  <div className="space-y-4">
                    {review.strengths && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Strengths</p>
                        <p className="text-sm text-foreground whitespace-pre-line">{review.strengths}</p>
                      </div>
                    )}
                    {review.areasToImprove && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Areas to Improve</p>
                        <p className="text-sm text-foreground whitespace-pre-line">{review.areasToImprove}</p>
                      </div>
                    )}
                    {review.goals && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Goals</p>
                        <p className="text-sm text-foreground whitespace-pre-line">{review.goals}</p>
                      </div>
                    )}
                    {review.comments && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Comments</p>
                        <p className="text-sm text-foreground whitespace-pre-line">{review.comments}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </div>
        )}
      </WorkflowRecordLayout>
  )
}
