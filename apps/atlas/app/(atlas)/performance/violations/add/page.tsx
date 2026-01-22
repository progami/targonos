'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DisciplinaryActionsApi, EmployeesApi, type Employee } from '@/lib/api-client'
import { ExclamationTriangleIcon } from '@/components/ui/Icons'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { ensureMe, useMeStore } from '@/lib/store/me'
import {
  DISCIPLINARY_ACTION_TYPE_OPTIONS,
  VALUE_BREACH_OPTIONS,
  VIOLATION_REASON_GROUPS,
  VIOLATION_TYPE_OPTIONS,
} from '@/lib/domain/disciplinary/constants'

const SEVERITY_LEVELS = [
  { value: 'MINOR', label: 'Minor' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'CRITICAL', label: 'Critical' },
]

type AuthorizedReporter = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  position: string
}

const ViolationSchema = z.object({
  employeeId: z.string().min(1, 'Employee is required'),
  violationType: z.string().min(1, 'Violation type is required'),
  violationReason: z.string().min(1, 'Violation reason is required'),
  valuesBreached: z.array(z.string()).default([]),
  severity: z.string().min(1, 'Severity is required'),
  incidentDate: z.string().min(1, 'Incident date is required'),
  reportedBy: z.string().min(1, 'Reporter is required'),
  description: z.string().min(1, 'Description is required'),
  witnesses: z.string().optional().nullable(),
  evidence: z.string().optional().nullable(),
  actionTaken: z.string().min(1, 'Action taken is required'),
})

type FormData = z.infer<typeof ViolationSchema>

function AddViolationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedEmployeeId = searchParams.get('employeeId')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [authorizedReporters, setAuthorizedReporters] = useState<AuthorizedReporter[]>([])
  const [loadingReporters, setLoadingReporters] = useState(false)
  const me = useMeStore((s) => s.me)
  const [loading, setLoading] = useState(true)
  const [selectedValues, setSelectedValues] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormData>({
    resolver: zodResolver(ViolationSchema),
    defaultValues: {
      employeeId: preselectedEmployeeId ?? '',
      violationType: '',
      severity: '',
      actionTaken: '',
      valuesBreached: [],
      reportedBy: '',
    },
  })

  const selectedEmployeeId = watch('employeeId')

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [empRes, meData] = await Promise.all([
          EmployeesApi.list({ take: 200 }),
          ensureMe().catch(() => null),
        ])
        setEmployees(empRes.items.filter((e) => e.id !== meData?.id))
      } catch (e: any) {
        setError('root', { message: e.message })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setError])

  // Load authorized reporters when employee is selected
  useEffect(() => {
    async function loadReporters() {
      if (!selectedEmployeeId) {
        setAuthorizedReporters([])
        setValue('reportedBy', '')
        return
      }

      setLoadingReporters(true)
      try {
        const res = await EmployeesApi.getAuthorizedReporters(selectedEmployeeId)
        setAuthorizedReporters(res.items)

        // Auto-select current user if they're in the list
        if (me) {
          const currentUserInList = res.items.find((r) => r.id === me.id)
          if (currentUserInList) {
            setValue('reportedBy', `${currentUserInList.firstName} ${currentUserInList.lastName}`)
          } else {
            setValue('reportedBy', '')
          }
        }
      } catch (e: any) {
        console.error('Failed to load authorized reporters:', e)
        setAuthorizedReporters([])
      } finally {
        setLoadingReporters(false)
      }
    }
    loadReporters()
  }, [selectedEmployeeId, me, setValue])

  const toggleValue = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value]
    setSelectedValues(newValues)
    setValue('valuesBreached', newValues)
  }

  const onSubmit = async (data: FormData) => {
    try {
      const created = await DisciplinaryActionsApi.create({
        ...data,
        witnesses: data.witnesses ?? null,
        evidence: data.evidence ?? null,
      })
      router.push(`/performance/violations/${created.id}`)
    } catch (e: any) {
      setError('root', { message: e.message })
    }
  }

  const canCreate = Boolean(me)

  if (loading) {
    return (
      <>
        <PageHeader
          title="Record Violation"
          description="Performance"
          icon={<ExclamationTriangleIcon className="h-6 w-6 text-white" />}
          backHref="/performance/violations"
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
          title="Record Violation"
          description="Performance"
          icon={<ExclamationTriangleIcon className="h-6 w-6 text-white" />}
          backHref="/performance/violations"
        />
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <Alert variant="error">You do not have permission to create violations.</Alert>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Record Violation"
        description="Performance"
        icon={<ExclamationTriangleIcon className="h-6 w-6 text-white" />}
        backHref="/performance/violations"
      />

      <div className="max-w-2xl mx-auto">
        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {errors.root ? (
              <Alert variant="error" onDismiss={() => setError('root', { message: '' })}>
                {errors.root.message}
              </Alert>
            ) : null}

            {/* Employee & Type */}
            <div>
              <Label htmlFor="employeeId">Employee</Label>
              <NativeSelect
                {...register('employeeId')}
                className={cn('mt-1.5', errors.employeeId && 'border-destructive')}
              >
                <option value="">Select employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName} ({emp.department})
                  </option>
                ))}
              </NativeSelect>
              {errors.employeeId ? (
                <p className="text-xs text-destructive mt-1">{errors.employeeId.message}</p>
              ) : null}
            </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor="violationType">Violation Type</Label>
              <NativeSelect
                {...register('violationType')}
                className={cn('mt-1.5', errors.violationType && 'border-destructive')}
              >
                <option value="">Select type...</option>
                {VIOLATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </NativeSelect>
              {errors.violationType && (
                <p className="text-xs text-destructive mt-1">{errors.violationType.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="severity">Severity</Label>
              <NativeSelect
                {...register('severity')}
                className={cn('mt-1.5', errors.severity && 'border-destructive')}
              >
                <option value="">Select severity...</option>
                {SEVERITY_LEVELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </NativeSelect>
              {errors.severity && (
                <p className="text-xs text-destructive mt-1">{errors.severity.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor="incidentDate">Incident Date</Label>
              <Input
                {...register('incidentDate')}
                type="date"
                className={cn('mt-1.5', errors.incidentDate && 'border-destructive')}
              />
              {errors.incidentDate && (
                <p className="text-xs text-destructive mt-1">{errors.incidentDate.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="reportedBy">Reported By</Label>
              <NativeSelect
                {...register('reportedBy')}
                disabled={!selectedEmployeeId || loadingReporters}
                className={cn('mt-1.5', errors.reportedBy && 'border-destructive')}
              >
                <option value="">
                  {!selectedEmployeeId
                    ? 'Select employee first...'
                    : loadingReporters
                      ? 'Loading reporters...'
                      : 'Select reporter...'}
                </option>
                {authorizedReporters.map((reporter) => (
                  <option key={reporter.id} value={`${reporter.firstName} ${reporter.lastName}`}>
                    {reporter.firstName} {reporter.lastName} ({reporter.position})
                  </option>
                ))}
              </NativeSelect>
              {errors.reportedBy && (
                <p className="text-xs text-destructive mt-1">{errors.reportedBy.message}</p>
              )}
              {selectedEmployeeId && !loadingReporters && authorizedReporters.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No authorized reporters found for this employee
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="violationReason">Violation Reason</Label>
            <NativeSelect
              {...register('violationReason')}
              className={cn('mt-1.5', errors.violationReason && 'border-destructive')}
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
              <p className="text-xs text-destructive mt-1">{errors.violationReason.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Full Description</Label>
            <Textarea
              {...register('description')}
              rows={4}
              placeholder="Describe the incident in detail..."
              className={cn('mt-1.5 resize-none', errors.description && 'border-destructive')}
            />
            {errors.description && (
              <p className="text-xs text-destructive mt-1">{errors.description.message}</p>
            )}
          </div>

          {/* Values Breached */}
          <div>
            <Label>Values Breached (optional)</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {VALUE_BREACH_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedValues.includes(opt.value)}
                    onCheckedChange={() => toggleValue(opt.value)}
                  />
                  <span className="text-sm text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Evidence & Witnesses */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label htmlFor="witnesses">Witnesses (optional)</Label>
              <Input
                {...register('witnesses')}
                placeholder="Names of witnesses"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="actionTaken">Action Taken</Label>
              <NativeSelect
                {...register('actionTaken')}
                className={cn('mt-1.5', errors.actionTaken && 'border-destructive')}
              >
                <option value="">Select action...</option>
                {DISCIPLINARY_ACTION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </NativeSelect>
              {errors.actionTaken && (
                <p className="text-xs text-destructive mt-1">{errors.actionTaken.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="evidence">Evidence (optional)</Label>
            <Textarea
              {...register('evidence')}
              rows={2}
              placeholder="Describe any evidence collected..."
              className="mt-1.5 resize-none"
            />
          </div>

            {/* Actions */}
            <div className="pt-6 border-t border-border flex justify-end gap-3">
              <Button type="button" variant="secondary" href="/performance/violations">
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Create Violation
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}

export default function AddViolationPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader
            title="Record Violation"
            description="Performance"
            icon={<ExclamationTriangleIcon className="h-6 w-6 text-white" />}
            backHref="/performance/violations"
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
      <AddViolationContent />
    </Suspense>
  )
}
