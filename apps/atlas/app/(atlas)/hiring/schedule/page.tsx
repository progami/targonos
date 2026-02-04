'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { EmployeesApi, HiringInterviewsApi, type Employee, type HiringInterview } from '@/lib/api-client'
import { ensureMe, useMeStore } from '@/lib/store/me'
import { useNavigationHistory } from '@/lib/navigation-history'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { UserPlusIcon } from '@/components/ui/Icons'
import { cn } from '@/lib/utils'

const ScheduleInterviewSchema = z.object({
  candidateFullName: z.string().min(1, 'Candidate name is required').max(200),
  candidateEmail: z.string().email('Valid email is required'),
  candidatePhone: z.string().max(50).optional().nullable(),
  candidateRole: z.string().max(200).optional().nullable(),

  title: z.string().min(1, 'Title is required').max(200),
  interviewType: z.enum(['PHONE_SCREEN', 'TECHNICAL', 'CULTURE', 'FINAL', 'OTHER']).default('OTHER'),
  startAtLocal: z
    .string()
    .min(1, 'Start time is required')
    .refine((val) => !Number.isNaN(Date.parse(val)), { message: 'Invalid start time' }),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  location: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  interviewerEmployeeIds: z.array(z.string()).min(1, 'Select at least one interviewer'),
})

type FormData = z.infer<typeof ScheduleInterviewSchema>

const interviewTypeOptions = [
  { value: 'PHONE_SCREEN', label: 'Phone screen' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'CULTURE', label: 'Culture' },
  { value: 'FINAL', label: 'Final' },
  { value: 'OTHER', label: 'Other' },
]

const durationOptions = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '60 minutes' },
  { value: 90, label: '90 minutes' },
]

function formatDateTime(dateStr: string, timeZone: string) {
  const date = new Date(dateStr)
  return `${date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })} (${timeZone})`
}

type InterviewerOption = Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'email' | 'avatar'>

export default function ScheduleInterviewPage() {
  const searchParams = useSearchParams()
  const { goBack } = useNavigationHistory()
  const me = useMeStore((s) => s.me)

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [selectedInterviewerIds, setSelectedInterviewerIds] = useState<string[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdInterview, setCreatedInterview] = useState<HiringInterview | null>(null)

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(ScheduleInterviewSchema),
    defaultValues: {
      title: 'Interview',
      interviewType: 'OTHER',
      durationMinutes: 60,
      interviewerEmployeeIds: [],
    },
  })

  useEffect(() => {
    async function loadEmployees() {
      try {
        const [meData, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items)
        setSelectedInterviewerIds([meData.id])
      } catch (e) {
        console.error('Failed to load employees:', e)
        setEmployees([])
      } finally {
        setLoadingEmployees(false)
      }
    }
    loadEmployees()
  }, [])

  useEffect(() => {
    setValue('interviewerEmployeeIds', selectedInterviewerIds, { shouldValidate: true })
  }, [selectedInterviewerIds, setValue])

  useEffect(() => {
    const fullName = searchParams.get('fullName')
    const email = searchParams.get('email')
    const role = searchParams.get('role')

    if (fullName) setValue('candidateFullName', fullName)
    if (email) setValue('candidateEmail', email)
    if (role) setValue('candidateRole', role)
  }, [searchParams, setValue])

  const interviewerOptions = useMemo<InterviewerOption[]>(() => {
    const options: InterviewerOption[] = []
    if (me) options.push(me)
    for (const e of employees) options.push(e)
    return options
  }, [me, employees])

  const filteredInterviewers = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase()
    if (!q) return interviewerOptions
    return interviewerOptions.filter((e) => {
      const label = `${e.firstName} ${e.lastName} ${e.email} ${e.employeeId}`.toLowerCase()
      return label.includes(q)
    })
  }, [employeeQuery, interviewerOptions])

  const toggleInterviewer = (employeeId: string) => {
    setSelectedInterviewerIds((prev) => {
      if (prev.includes(employeeId)) return prev.filter((id) => id !== employeeId)
      return [...prev, employeeId]
    })
  }

  const onSubmit = async (data: FormData) => {
    setSubmitError(null)
    setCreatedInterview(null)

    try {
      const startAt = new Date(data.startAtLocal).toISOString()

      const created = await HiringInterviewsApi.schedule({
        candidateFullName: data.candidateFullName,
        candidateEmail: data.candidateEmail,
        candidatePhone: data.candidatePhone ?? null,
        candidateRole: data.candidateRole ?? null,
        title: data.title,
        interviewType: data.interviewType,
        startAt,
        durationMinutes: data.durationMinutes,
        timeZone,
        location: data.location ?? null,
        notes: data.notes ?? null,
        interviewerEmployeeIds: data.interviewerEmployeeIds,
      })

      setCreatedInterview(created)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to schedule interview'
      setSubmitError(message)
    }
  }

  if (createdInterview) {
    const meetingLink = createdInterview.meetingLink ?? null
    const calendarLink = createdInterview.googleHtmlLink ?? null
    const showCalendarOnly = meetingLink && calendarLink && meetingLink === calendarLink

    return (
      <>
        <PageHeader title="Interview Scheduled" description="Hiring" icon={<UserPlusIcon className="h-6 w-6 text-white" />} showBack />

        <div className="max-w-3xl space-y-6">
          <Card padding="lg">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Candidate</p>
                <p className="text-lg font-semibold text-foreground">{createdInterview.candidate.fullName}</p>
                {createdInterview.candidate.role ? (
                  <p className="text-sm text-muted-foreground">{createdInterview.candidate.role}</p>
                ) : null}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">When</p>
                <p className="text-sm text-foreground">{formatDateTime(createdInterview.startAt, createdInterview.timeZone)}</p>
              </div>

              {(meetingLink || calendarLink) ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {!showCalendarOnly && meetingLink ? (
                    <Button asChild>
                      <a href={meetingLink} target="_blank" rel="noreferrer">
                        Join Meet
                      </a>
                    </Button>
                  ) : null}
                  {calendarLink ? (
                    <Button asChild variant="secondary">
                      <a href={calendarLink} target="_blank" rel="noreferrer">
                        Open in Calendar
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button variant="secondary" href="/hiring">
                  Back to Hiring
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Schedule Interview" description="Hiring" icon={<UserPlusIcon className="h-6 w-6 text-white" />} showBack />

      <div className="max-w-3xl">
        <Card padding="lg">
          {submitError ? (
            <Alert variant="error" className="mb-6" onDismiss={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Candidate</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="candidateFullName">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register('candidateFullName')}
                    placeholder="e.g., Hamza Bukhari"
                    className={cn(errors.candidateFullName && 'border-destructive')}
                  />
                  {errors.candidateFullName ? (
                    <p className="text-xs text-destructive">{errors.candidateFullName.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidateEmail">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    {...register('candidateEmail')}
                    type="email"
                    placeholder="candidate@email.com"
                    className={cn(errors.candidateEmail && 'border-destructive')}
                  />
                  {errors.candidateEmail ? (
                    <p className="text-xs text-destructive">{errors.candidateEmail.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidateRole">Role</Label>
                  <Input {...register('candidateRole')} placeholder="e.g., Frontend Engineer" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="candidatePhone">Phone</Label>
                  <Input {...register('candidatePhone')} placeholder="Optional" />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-border">
              <h2 className="text-sm font-semibold text-foreground">Interview</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="title">
                    Title <span className="text-destructive">*</span>
                  </Label>
                  <Input {...register('title')} placeholder="e.g., Technical Interview" className={cn(errors.title && 'border-destructive')} />
                  {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="interviewType">Type</Label>
                  <NativeSelect {...register('interviewType')}>
                    {interviewTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="durationMinutes">Duration</Label>
                  <NativeSelect {...register('durationMinutes')}>
                    {durationOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startAtLocal">
                    Start time <span className="text-destructive">*</span>
                  </Label>
                  <Input {...register('startAtLocal')} type="datetime-local" className={cn(errors.startAtLocal && 'border-destructive')} />
                  {errors.startAtLocal ? (
                    <p className="text-xs text-destructive">{errors.startAtLocal.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Timezone: {timeZone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input {...register('location')} placeholder="Optional (Google Meet is auto-created)" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea {...register('notes')} rows={4} placeholder="Optional" className="resize-none" />
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-border">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Interviewers</h2>
                <p className="text-xs text-muted-foreground">These employees will be invited on Google Calendar.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeQuery">Search</Label>
                <Input
                  id="employeeQuery"
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  placeholder={loadingEmployees ? 'Loading employees...' : 'Type a name or email'}
                  disabled={loadingEmployees}
                />
              </div>

              <div className={cn('rounded-lg border border-border p-3 max-h-64 overflow-auto bg-muted/20', errors.interviewerEmployeeIds && 'border-destructive')}>
                {filteredInterviewers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No matches.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredInterviewers.map((e) => {
                      const checked = selectedInterviewerIds.includes(e.id)
                      const label = `${e.firstName} ${e.lastName}`.trim()
                      const sub = `${e.email}${e.employeeId ? ` • ${e.employeeId}` : ''}`
                      const displayLabel = label.length > 0 ? label : e.email

                      return (
                        <label key={e.id} className="flex items-start gap-3 cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={() => toggleInterviewer(e.id)} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{displayLabel}</p>
                            <p className="text-xs text-muted-foreground truncate">{sub}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              {errors.interviewerEmployeeIds ? <p className="text-xs text-destructive">{errors.interviewerEmployeeIds.message}</p> : null}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" onClick={goBack}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting} disabled={loadingEmployees}>
                {isSubmitting ? 'Scheduling...' : 'Schedule Interview'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}

