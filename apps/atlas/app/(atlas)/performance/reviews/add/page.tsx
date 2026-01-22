'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PerformanceReviewsApi, EmployeesApi, type Employee } from '@/lib/api-client'
import { ClipboardDocumentCheckIcon } from '@/components/ui/Icons'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { REVIEW_PERIOD_TYPES, REVIEW_PERIOD_TYPE_LABELS, getAllowedReviewPeriodTypes } from '@/lib/review-period'
import { CreatePerformanceReviewSchema } from '@/lib/validations'
import { RatingInputRow } from '@/components/performance/reviews/RatingRows'
import { PageHeader } from '@/components/ui/PageHeader'
import { ensureMe, useMeStore } from '@/lib/store/me'

type FormData = z.infer<typeof CreatePerformanceReviewSchema>

const REVIEW_TYPES = [
  { value: 'PROBATION', label: 'Probation (90-day)' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
]

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
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

function AddReviewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedEmployeeId = searchParams.get('employeeId')
  const currentYear = new Date().getFullYear()

  const [employees, setEmployees] = useState<Employee[]>([])
  const me = useMeStore((s) => s.me)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('details')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(CreatePerformanceReviewSchema),
    defaultValues: {
      employeeId: preselectedEmployeeId || '',
      reviewType: 'ANNUAL',
      periodType: 'ANNUAL',
      periodYear: currentYear,
      reviewDate: new Date().toISOString().split('T')[0],
      roleTitle: '',
      assignedReviewerId: '',
      overallRating: 6,
      qualityOfWork: 6,
      productivity: 6,
      communication: 6,
      teamwork: 6,
      initiative: 6,
      attendance: 6,
      status: 'DRAFT',
    },
  })

  const reviewType = watch('reviewType')
  const periodType = watch('periodType')
  const selectedEmployeeId = watch('employeeId')
  const ratings = {
    overallRating: watch('overallRating') ?? 6,
    qualityOfWork: watch('qualityOfWork') ?? 6,
    productivity: watch('productivity') ?? 6,
    communication: watch('communication') ?? 6,
    teamwork: watch('teamwork') ?? 6,
    initiative: watch('initiative') ?? 6,
    attendance: watch('attendance') ?? 6,
  }

  const periodYearOptions = Array.from({ length: 8 }, (_, idx) => currentYear - 5 + idx)

  useEffect(() => {
    async function load() {
      try {
        const [, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items || [])
      } catch (e: any) {
        setError('root', { message: e.message })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setError])

  useEffect(() => {
    async function hydrateRoleAndManager() {
      if (!selectedEmployeeId) return
      try {
        const e = await EmployeesApi.get(selectedEmployeeId)
        setValue('roleTitle', e.position || '')
        setValue('assignedReviewerId', e.reportsToId || '')
      } catch (err) {
        console.error('Failed to load employee details:', err)
      }
    }
    hydrateRoleAndManager()
  }, [selectedEmployeeId, setValue])

  useEffect(() => {
    const allowedTypes = getAllowedReviewPeriodTypes(reviewType)
    if (!allowedTypes.includes(periodType as any)) {
      setValue('periodType', allowedTypes[0] as any)
    }
  }, [reviewType, periodType, setValue])

  const onSubmit = async (data: FormData) => {
    try {
      await PerformanceReviewsApi.create(data)
      router.push('/performance/reviews')
    } catch (e: any) {
      setError('root', { message: e.message || 'Failed to create review' })
    }
  }

  const allowedPeriodTypes = getAllowedReviewPeriodTypes(reviewType)
  const periodTypeOptions = REVIEW_PERIOD_TYPES
    .filter((type) => allowedPeriodTypes.includes(type as any))
    .map((type) => ({ value: type, label: REVIEW_PERIOD_TYPE_LABELS[type] }))

  const canCreate = Boolean(me?.isHR || me?.isSuperAdmin || employees.length > 0)

  // Check for errors in each tab to show indicators
  const detailsHasErrors = Boolean(
    errors.employeeId || errors.reviewType || errors.periodType ||
    errors.periodYear || errors.reviewDate || errors.assignedReviewerId ||
    errors.roleTitle || errors.status
  )
  const ratingsHasErrors = Boolean(
    errors.overallRating || errors.qualityOfWork || errors.productivity ||
    errors.communication || errors.teamwork || errors.initiative || errors.attendance
  )

  if (loading) {
    return (
      <>
        <PageHeader
          title="New Performance Review"
          description="Performance"
          icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
          backHref="/performance/reviews"
        />
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-muted rounded w-1/3" />
              <div className="h-4 bg-muted rounded w-2/3" />
              <div className="h-32 bg-muted rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (!canCreate) {
    return (
      <>
        <PageHeader
          title="New Performance Review"
          description="Performance"
          icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
          backHref="/performance/reviews"
        />
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <Alert variant="error">You do not have permission to create reviews.</Alert>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="New Performance Review"
        description="Performance"
        icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
        backHref="/performance/reviews"
      />

      <div className="max-w-2xl mx-auto">
        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)}>
            {errors.root ? (
              <Alert
                variant="error"
                className="mb-6"
                onDismiss={() => setError('root', { message: '' })}
              >
                {errors.root.message}
              </Alert>
            ) : null}

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
                <TabsTrigger value="feedback">
                  Feedback
                </TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-6">
                <div>
                  <Label htmlFor="employeeId">Employee</Label>
                  <NativeSelect
                    {...register('employeeId')}
                    className={cn('mt-1.5', errors.employeeId && 'border-destructive')}
                  >
                    <option value="">Select employee...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.employeeId})
                      </option>
                    ))}
                  </NativeSelect>
                  {errors.employeeId ? (
                    <p className="text-xs text-destructive mt-1">{errors.employeeId.message}</p>
                  ) : null}
                </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reviewType">Review Type</Label>
                  <NativeSelect
                    {...register('reviewType')}
                    className={cn('mt-1.5', errors.reviewType && 'border-destructive')}
                  >
                    {REVIEW_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                  {errors.reviewType && (
                    <p className="text-xs text-destructive mt-1">{errors.reviewType.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <NativeSelect
                    {...register('status')}
                    className={cn('mt-1.5', errors.status && 'border-destructive')}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                  {errors.status && (
                    <p className="text-xs text-destructive mt-1">{errors.status.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="periodType">Review Period</Label>
                  <NativeSelect
                    {...register('periodType')}
                    className={cn('mt-1.5', errors.periodType && 'border-destructive')}
                  >
                    {periodTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                  {errors.periodType && (
                    <p className="text-xs text-destructive mt-1">{errors.periodType.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="periodYear">Year</Label>
                  <NativeSelect
                    {...register('periodYear')}
                    className={cn('mt-1.5', errors.periodYear && 'border-destructive')}
                  >
                    {periodYearOptions.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </NativeSelect>
                  {errors.periodYear && (
                    <p className="text-xs text-destructive mt-1">{errors.periodYear.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reviewDate">Review Date</Label>
                  <Input
                    {...register('reviewDate')}
                    type="date"
                    className={cn('mt-1.5', errors.reviewDate && 'border-destructive')}
                  />
                  {errors.reviewDate && (
                    <p className="text-xs text-destructive mt-1">{errors.reviewDate.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="roleTitle">Role</Label>
                  <Input
                    {...register('roleTitle')}
                    placeholder="Employee's role"
                    className={cn('mt-1.5', errors.roleTitle && 'border-destructive')}
                  />
                  {errors.roleTitle && (
                    <p className="text-xs text-destructive mt-1">{errors.roleTitle.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="assignedReviewerId">Manager / Reviewer</Label>
                <NativeSelect
                  {...register('assignedReviewerId')}
                  className={cn('mt-1.5', errors.assignedReviewerId && 'border-destructive')}
                >
                  <option value="">Select manager...</option>
                  {me && <option value={me.id}>Me ({me.employeeId})</option>}
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </option>
                  ))}
                </NativeSelect>
                {errors.assignedReviewerId && (
                  <p className="text-xs text-destructive mt-1">{errors.assignedReviewerId.message}</p>
                )}
              </div>
            </TabsContent>

              {/* Ratings Tab */}
              <TabsContent value="ratings">
                <div className="rounded-lg border border-border">
                  {RATING_FIELDS.map((field) => (
                    <RatingInputRow
                      key={field.key}
                      label={field.label}
                      description={field.description}
                      value={ratings[field.key]}
                      onChange={(v) => setValue(field.key, v)}
                      error={errors[field.key]?.message}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  Click stars to rate from 1 (lowest) to 10 (highest)
                </p>
              </TabsContent>

              {/* Feedback Tab */}
              <TabsContent value="feedback" className="space-y-4">
                <div>
                  <Label htmlFor="strengths">Strengths</Label>
                  <Textarea
                    {...register('strengths')}
                    rows={3}
                    placeholder="Key strengths demonstrated..."
                    className="mt-1.5 resize-none"
                  />
                </div>
                <div>
                  <Label htmlFor="areasToImprove">Areas to Improve</Label>
                  <Textarea
                    {...register('areasToImprove')}
                    rows={3}
                    placeholder="Areas that need development..."
                    className="mt-1.5 resize-none"
                  />
                </div>
                <div>
                  <Label htmlFor="goals">Goals for Next Period</Label>
                  <Textarea
                    {...register('goals')}
                    rows={3}
                    placeholder="Objectives and targets..."
                    className="mt-1.5 resize-none"
                  />
                </div>
                <div>
                  <Label htmlFor="comments">Additional Comments</Label>
                  <Textarea
                    {...register('comments')}
                    rows={3}
                    placeholder="Any other observations..."
                    className="mt-1.5 resize-none"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="pt-6 mt-6 border-t border-border flex justify-end gap-3">
              <Button type="button" variant="secondary" href="/performance/reviews">
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Save Review
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}

export default function AddReviewPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader
            title="New Performance Review"
            description="Performance"
            icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
            backHref="/performance/reviews"
          />
          <div className="max-w-2xl mx-auto">
            <Card padding="lg">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-muted rounded w-1/3" />
                <div className="h-4 bg-muted rounded w-2/3" />
                <div className="h-32 bg-muted rounded" />
              </div>
            </Card>
          </div>
        </>
      }
    >
      <AddReviewContent />
    </Suspense>
  )
}
