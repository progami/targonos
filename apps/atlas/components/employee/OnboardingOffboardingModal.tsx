'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { CheckCircleIcon } from '@/components/ui/Icons'
import {
  TasksApi,
  EmployeesApi,
  LeavesApi,
  type Employee,
  type LeaveBalance,
  type OffboardPreflightResult,
  type OffboardResult,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ensureMe, useMeStore } from '@/lib/store/me'
import { EXIT_REASON_OPTIONS } from '@/lib/domain/employee/constants'
import { getLeaveTypeLabel } from '@/components/employee/profile/utils'

type ChecklistTask = {
  title: string
  description: string
  actionUrl?: string
}

const ONBOARDING_TASKS: ChecklistTask[] = [
  { title: 'Confirm profile basics', description: 'Verify role, department, and reporting line' },
  { title: 'Collect documents', description: 'Contract, ID, bank details uploaded to profile' },
  { title: 'Provision access', description: 'Portal entitlement and Atlas roles' },
  { title: 'Policies & acknowledgements', description: 'Share and confirm key policies' },
  { title: 'Day-1 readiness', description: 'Calendar, equipment, workspace' },
]

type WorkflowType = 'onboarding' | 'offboarding'

type OnboardingOffboardingModalProps = {
  open: boolean
  onClose: (shouldRefresh?: boolean) => void
  employee: Employee
  workflowType: WorkflowType
}

type OnboardingTaskStatus = 'pending' | 'creating' | 'done'

// Warning category labels for the preflight UI
const WARNING_LABELS: Record<string, { label: string; description: string }> = {
  openTasks: { label: 'Open Tasks', description: 'These tasks are assigned to this employee and will become unassigned.' },
  openCases: { label: 'Open Cases', description: 'This employee is linked to active cases (subject or assigned).' },
  directReports: { label: 'Direct Reports', description: 'These employees report to this person. They will be reassigned to their manager\'s manager.' },
  departmentsLed: { label: 'Department Head', description: 'This employee is head of these departments. The head will be cleared.' },
  projectsLed: { label: 'Project Lead', description: 'This employee leads these active projects.' },
  pendingLeaveRequests: { label: 'Pending Leave Requests', description: 'These leave requests are still pending approval and will remain in the system.' },
  activeReviews: { label: 'Active Reviews', description: 'These performance reviews are in progress.' },
  upcomingEvents: { label: 'Upcoming Events', description: 'These HR calendar events reference this employee.' },
}

export function OnboardingOffboardingModal({
  open,
  onClose,
  employee,
  workflowType,
}: OnboardingOffboardingModalProps) {
  const me = useMeStore((s) => s.me)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [ownerId, setOwnerId] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Offboarding-specific state
  const [exitReason, setExitReason] = useState('')
  const [lastWorkingDay, setLastWorkingDay] = useState('')
  const [exitNotes, setExitNotes] = useState('')
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)

  // Offboarding preflight state
  const [preflightData, setPreflightData] = useState<OffboardPreflightResult | null>(null)
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false)
  const [offboardResult, setOffboardResult] = useState<OffboardResult | null>(null)

  // Onboarding progress state
  const [onboardingTaskStatuses, setOnboardingTaskStatuses] = useState<OnboardingTaskStatus[]>([])
  const [createdCount, setCreatedCount] = useState(0)

  // Phase: form → preflight → warnings → executing → done (offboarding)
  //        form → creating → done (onboarding)
  const [phase, setPhase] = useState<'form' | 'preflight' | 'warnings' | 'creating' | 'executing' | 'done'>('form')

  const isOnboarding = workflowType === 'onboarding'
  const title = isOnboarding ? 'Start Onboarding' : 'Start Offboarding'

  // Load employees when modal opens
  useEffect(() => {
    if (!open) return

    // Reset state when opening
    setPhase('form')
    setOnboardingTaskStatuses(ONBOARDING_TASKS.map(() => 'pending'))
    setCreatedCount(0)
    setError(null)
    setExitReason('')
    setLastWorkingDay('')
    setExitNotes('')
    setLeaveBalances([])
    setPreflightData(null)
    setWarningsAcknowledged(false)
    setOffboardResult(null)

    async function loadEmployees() {
      try {
        setLoadingEmployees(true)
        const [meData, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items)
        setOwnerId(meData.id)
      } catch (e) {
        console.error('Failed to load employees:', e)
      } finally {
        setLoadingEmployees(false)
      }
    }
    loadEmployees()

    // Load leave balances for offboarding
    if (!isOnboarding) {
      setLeaveLoading(true)
      LeavesApi.getBalance({ employeeId: employee.id })
        .then((res) => setLeaveBalances(res.balances))
        .catch(() => setLeaveBalances([]))
        .finally(() => setLeaveLoading(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const employeeOptions: { value: string; label: string }[] = []
  if (me) {
    employeeOptions.push({ value: me.id, label: `Me (${me.employeeId})` })
  }
  for (const e of employees) {
    if (e.id !== me?.id) {
      employeeOptions.push({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` })
    }
  }

  // --- Onboarding: create tasks one by one (existing logic) ---
  const createOnboardingTasks = useCallback(async () => {
    setPhase('creating')
    setError(null)
    setOnboardingTaskStatuses(ONBOARDING_TASKS.map(() => 'pending'))

    const employeeName = `${employee.firstName} ${employee.lastName}`
    const dueDate = targetDate.trim() || null
    const assignedToId = ownerId.trim() || null

    let count = 0
    for (let i = 0; i < ONBOARDING_TASKS.length; i++) {
      const t = ONBOARDING_TASKS[i]

      setOnboardingTaskStatuses((prev) => {
        const next = [...prev]
        next[i] = 'creating'
        return next
      })

      try {
        await TasksApi.create({
          title: `Onboarding: ${t.title} — ${employeeName}`,
          description: t.description,
          actionUrl: t.actionUrl,
          category: 'GENERAL',
          dueDate,
          assignedToId,
          subjectEmployeeId: employee.id,
        })
        count++
        setCreatedCount(count)

        setOnboardingTaskStatuses((prev) => {
          const next = [...prev]
          next[i] = 'done'
          return next
        })

        await new Promise((r) => setTimeout(r, 150))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create task')
        setPhase('form')
        return
      }
    }

    setPhase('done')
  }, [employee, ownerId, targetDate])

  // --- Offboarding: preflight check ---
  const startPreflightChecks = useCallback(async () => {
    setPhase('preflight')
    setError(null)
    try {
      const data = await EmployeesApi.offboardPreflight(employee.id)
      setPreflightData(data)
      if (data.hasWarnings) {
        setPhase('warnings')
      } else {
        // No warnings — skip directly to execution
        setPhase('executing')
        try {
          const result = await EmployeesApi.offboard(employee.id, {
            exitReason: exitReason || undefined,
            lastWorkingDay: lastWorkingDay || undefined,
            exitNotes: exitNotes || undefined,
            taskOwnerId: ownerId || undefined,
            taskDueDate: targetDate || lastWorkingDay || undefined,
          })
          setOffboardResult(result)
          setPhase('done')
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to complete offboarding')
          setPhase('form')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run pre-flight checks')
      setPhase('form')
    }
  }, [employee.id, exitReason, lastWorkingDay, exitNotes, ownerId, targetDate])

  // --- Offboarding: execute after warnings acknowledged ---
  const executeOffboard = useCallback(async () => {
    setPhase('executing')
    setError(null)
    try {
      const result = await EmployeesApi.offboard(employee.id, {
        exitReason: exitReason || undefined,
        lastWorkingDay: lastWorkingDay || undefined,
        exitNotes: exitNotes || undefined,
        taskOwnerId: ownerId || undefined,
        taskDueDate: targetDate || lastWorkingDay || undefined,
      })
      setOffboardResult(result)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete offboarding')
      setPhase('warnings')
    }
  }, [employee.id, exitReason, lastWorkingDay, exitNotes, ownerId, targetDate])

  const handleClose = (shouldRefresh?: boolean) => {
    setOwnerId('')
    setTargetDate('')
    setExitReason('')
    setLastWorkingDay('')
    setExitNotes('')
    setError(null)
    setPhase('form')
    setPreflightData(null)
    setWarningsAcknowledged(false)
    setOffboardResult(null)
    onClose(shouldRefresh)
  }

  const getDescription = () => {
    if (phase === 'done' && !isOnboarding && offboardResult) {
      return `${employee.firstName} ${employee.lastName} has been offboarded`
    }
    if (phase === 'done' && isOnboarding) {
      return `${createdCount} tasks created for ${employee.firstName} ${employee.lastName}`
    }
    if (phase === 'warnings') {
      return `Review warnings before offboarding ${employee.firstName} ${employee.lastName}`
    }
    if (phase === 'preflight' || phase === 'executing') {
      return `Processing ${employee.firstName} ${employee.lastName}...`
    }
    if (isOnboarding) {
      return `Create ${ONBOARDING_TASKS.length} onboarding tasks for ${employee.firstName} ${employee.lastName}`
    }
    return `Offboard ${employee.firstName} ${employee.lastName} — this will change their status, create tasks, and revoke SSO access`
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle
            className={cn(
              isOnboarding ? 'text-cyan-600 dark:text-cyan-400' : 'text-rose-600 dark:text-rose-400'
            )}
          >
            {title}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="error" className="mt-2" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* ===== FORM PHASE ===== */}
        {phase === 'form' && (
          <div className="space-y-4 mt-4">
            {/* Employee display */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold',
                  isOnboarding ? 'bg-cyan-500' : 'bg-rose-500'
                )}
              >
                {employee.firstName[0]}
                {employee.lastName[0]}
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {employee.position} • {employee.department}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Task Owner</Label>
                <NativeSelect
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  disabled={loadingEmployees}
                >
                  <option value="">{loadingEmployees ? 'Loading...' : 'Unassigned'}</option>
                  {employeeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Target Date</Label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                />
              </div>
            </div>

            {/* Offboarding-specific fields */}
            {!isOnboarding && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Exit Reason</Label>
                    <NativeSelect
                      value={exitReason}
                      onChange={(e) => setExitReason(e.target.value)}
                    >
                      <option value="">Select reason...</option>
                      {EXIT_REASON_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Last Working Day</Label>
                    <Input
                      type="date"
                      value={lastWorkingDay}
                      onChange={(e) => setLastWorkingDay(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Exit Notes</Label>
                  <Input
                    value={exitNotes}
                    onChange={(e) => setExitNotes(e.target.value)}
                    placeholder="Optional notes about the separation..."
                  />
                </div>

                {/* Leave Balance Summary */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Leave Balance Summary</Label>
                  {leaveLoading ? (
                    <p className="text-xs text-slate-400">Loading balances...</p>
                  ) : leaveBalances.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {leaveBalances
                        .filter((b) => b.leaveType !== 'UNPAID')
                        .map((b) => (
                          <div
                            key={b.leaveType}
                            className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm"
                          >
                            <span className="text-slate-600 dark:text-slate-300">
                              {getLeaveTypeLabel(b.leaveType)}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {b.allocated - b.used}/{b.allocated}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No leave balances found</p>
                  )}
                </div>
              </>
            )}

            {/* Task preview — onboarding only */}
            {isOnboarding && (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Tasks to create</Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {ONBOARDING_TASKS.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 py-1">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-cyan-400" />
                      <span className="text-sm text-slate-600 dark:text-slate-300">{t.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => handleClose()}>
                Cancel
              </Button>
              {isOnboarding ? (
                <Button onClick={createOnboardingTasks} variant="primary">
                  Create {ONBOARDING_TASKS.length} Tasks
                </Button>
              ) : (
                <Button onClick={startPreflightChecks} variant="destructive">
                  Continue to Offboarding
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {/* ===== PREFLIGHT LOADING PHASE (offboarding) ===== */}
        {phase === 'preflight' && (
          <div className="flex flex-col items-center py-10 mt-4">
            <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm text-slate-600 dark:text-slate-300">Running pre-flight checks...</p>
          </div>
        )}

        {/* ===== WARNINGS PHASE (offboarding) ===== */}
        {phase === 'warnings' && preflightData && (
          <div className="space-y-4 mt-4">
            <Alert variant="warning">
              The following items are linked to this employee. Review them before proceeding.
            </Alert>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(Object.entries(preflightData.warnings) as [string, unknown[]][])
                .filter(([, items]) => items.length > 0)
                .map(([key, items]) => {
                  const meta = WARNING_LABELS[key]
                  return (
                    <div key={key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {meta?.label ?? key}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {items.length}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {meta?.description}
                      </p>
                      <div className="space-y-1">
                        {items.slice(0, 5).map((item: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                            <span className="truncate">
                              {item.title || item.name || (item.firstName ? `${item.firstName} ${item.lastName}` : item.leaveType) || `Item ${i + 1}`}
                            </span>
                          </div>
                        ))}
                        {items.length > 5 && (
                          <p className="text-xs text-slate-400 ml-3">+ {items.length - 5} more</p>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Acknowledge checkbox */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={warningsAcknowledged}
                onChange={(e) => setWarningsAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                I have reviewed these warnings and want to proceed with offboarding
              </span>
            </label>

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={() => setPhase('form')}>
                Back
              </Button>
              <Button
                onClick={executeOffboard}
                variant="destructive"
                disabled={!warningsAcknowledged}
              >
                Proceed with Offboarding
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ===== CREATING PHASE (onboarding — task by task) ===== */}
        {phase === 'creating' && isOnboarding && (
          <div className="space-y-3 mt-4">
            {ONBOARDING_TASKS.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
                  onboardingTaskStatuses[i] === 'done'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : onboardingTaskStatuses[i] === 'creating'
                      ? 'bg-cyan-50 dark:bg-cyan-900/20'
                      : 'bg-slate-50 dark:bg-slate-800'
                )}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {onboardingTaskStatuses[i] === 'done' ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : onboardingTaskStatuses[i] === 'creating' ? (
                    <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm',
                    onboardingTaskStatuses[i] === 'done'
                      ? 'text-green-700 dark:text-green-400'
                      : onboardingTaskStatuses[i] === 'creating'
                        ? 'text-cyan-700 dark:text-cyan-400'
                        : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ===== EXECUTING PHASE (offboarding — single server call) ===== */}
        {phase === 'executing' && (
          <div className="flex flex-col items-center py-10 mt-4">
            <div className="w-10 h-10 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Offboarding in progress...</p>
            <div className="mt-4 space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p>Setting employee status to Resigned</p>
              <p>Creating offboarding tasks</p>
              <p>Reassigning direct reports</p>
              <p>Revoking SSO access</p>
            </div>
          </div>
        )}

        {/* ===== DONE PHASE ===== */}
        {phase === 'done' && (
          <div className="space-y-4 mt-4">
            <div className="flex flex-col items-center py-6">
              <div
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center mb-4',
                  isOnboarding ? 'bg-cyan-100 dark:bg-cyan-900/30' : 'bg-rose-100 dark:bg-rose-900/30'
                )}
              >
                <CheckCircleIcon
                  className={cn(
                    'w-10 h-10',
                    isOnboarding ? 'text-cyan-500' : 'text-rose-500'
                  )}
                />
              </div>

              {isOnboarding ? (
                <>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">All done!</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                    Created {createdCount} onboarding tasks for{' '}
                    <span className="font-medium">{employee.firstName}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Employee Offboarded
                  </p>
                  <div className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1 space-y-1">
                    <p>
                      <span className="font-medium">{employee.firstName} {employee.lastName}</span> has been set to Resigned
                    </p>
                    {offboardResult && (
                      <>
                        <p>{offboardResult.tasksCreated} offboarding tasks created</p>
                        <p>
                          {offboardResult.ssoRevoked
                            ? 'SSO access revoked'
                            : 'SSO access not revoked — see warning below'}
                        </p>
                      </>
                    )}
                  </div>

                  {offboardResult?.ssoWarning && (
                    <Alert variant="warning" className="mt-3 text-left">
                      {offboardResult.ssoWarning}
                    </Alert>
                  )}
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => handleClose(!isOnboarding)}>
                Close
              </Button>
              <Link href="/hub">
                <Button variant={isOnboarding ? 'primary' : 'destructive'}>
                  View in Inbox
                </Button>
              </Link>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
