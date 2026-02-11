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
import { TasksApi, EmployeesApi, LeavesApi, type Employee, type LeaveBalance } from '@/lib/api-client'
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

function getOffboardingTasks(employee: Employee): ChecklistTask[] {
  const email = employee.email
  const encodedEmail = encodeURIComponent(email)
  const employeeName = `${employee.firstName} ${employee.lastName}`

  return [
    {
      title: 'Confirm last day & handover',
      description: `Manager sign-off on ${employeeName}'s last working day and handover plan. Ensure all responsibilities are documented and transitioned.`,
    },
    {
      title: 'Reassign open work',
      description: `Transfer ${employeeName}'s tasks, projects, and responsibilities to remaining team members.`,
    },
    {
      title: 'Suspend Google Workspace account',
      description: `Suspend ${employeeName}'s Google account (${email}) in Google Admin Console. Do NOT delete — suspend first to preserve data.`,
      actionUrl: `https://admin.google.com/ac/users/${encodedEmail}`,
    },
    {
      title: 'Revoke Portal & Atlas access',
      description: `Remove ${employeeName}'s SSO entitlements in the Portal admin. Ensure they can no longer authenticate to Atlas or other internal apps.`,
      actionUrl: `/sso/admin`,
    },
    {
      title: 'Recover assets',
      description: `Collect all company property from ${employeeName}: laptop, badge, keys, parking pass, and any other equipment.`,
    },
    {
      title: 'Archive & close',
      description: `Upload final documents (separation agreement, NDA, clearance form) to ${employeeName}'s profile and confirm all offboarding steps are complete.`,
      actionUrl: `/atlas/employees/${employee.id}`,
    },
  ]
}

type WorkflowType = 'onboarding' | 'offboarding'

type OnboardingOffboardingModalProps = {
  open: boolean
  onClose: () => void
  employee: Employee
  workflowType: WorkflowType
}

type TaskStatus = 'pending' | 'creating' | 'done'

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

  // Progress state
  const [phase, setPhase] = useState<'form' | 'creating' | 'done'>('form')
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([])
  const [createdCount, setCreatedCount] = useState(0)

  const isOnboarding = workflowType === 'onboarding'
  const tasks = isOnboarding ? ONBOARDING_TASKS : getOffboardingTasks(employee)
  const title = isOnboarding ? 'Start Onboarding' : 'Start Offboarding'

  // Load employees when modal opens
  useEffect(() => {
    if (!open) return

    // Reset state when opening
    setPhase('form')
    setTaskStatuses(tasks.map(() => 'pending'))
    setCreatedCount(0)
    setError(null)
    setExitReason('')
    setLastWorkingDay('')
    setExitNotes('')
    setLeaveBalances([])

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

  const createTasks = useCallback(async () => {
    setPhase('creating')
    setError(null)
    setTaskStatuses(tasks.map(() => 'pending'))

    const prefix = isOnboarding ? 'Onboarding' : 'Offboarding'
    const employeeName = `${employee.firstName} ${employee.lastName}`
    const dueDate = targetDate.trim() || lastWorkingDay.trim() || null
    const assignedToId = ownerId.trim() || null

    let count = 0
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]

      setTaskStatuses((prev) => {
        const next = [...prev]
        next[i] = 'creating'
        return next
      })

      try {
        await TasksApi.create({
          title: `${prefix}: ${t.title} — ${employeeName}`,
          description: t.description,
          actionUrl: t.actionUrl,
          category: 'GENERAL',
          dueDate,
          assignedToId,
          subjectEmployeeId: employee.id,
        })
        count++
        setCreatedCount(count)

        setTaskStatuses((prev) => {
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

    // Save offboarding metadata to the employee record
    if (!isOnboarding && (exitReason || lastWorkingDay || exitNotes)) {
      try {
        await EmployeesApi.update(employee.id, {
          ...(exitReason ? { exitReason } : {}),
          ...(lastWorkingDay ? { lastWorkingDay } : {}),
          ...(exitNotes ? { exitNotes } : {}),
        })
      } catch {
        // Non-blocking — tasks were already created
      }
    }

    setPhase('done')
  }, [employee, exitNotes, exitReason, isOnboarding, lastWorkingDay, ownerId, targetDate, tasks])

  const handleClose = () => {
    setOwnerId('')
    setTargetDate('')
    setExitReason('')
    setLastWorkingDay('')
    setExitNotes('')
    setError(null)
    setPhase('form')
    onClose()
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
          <DialogDescription>
            {phase === 'done'
              ? `${createdCount} tasks created for ${employee.firstName} ${employee.lastName}`
              : `Create ${tasks.length} ${workflowType} tasks for ${employee.firstName} ${employee.lastName}`}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="error" className="mt-2" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Form Phase */}
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

            {/* Task preview */}
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Tasks to create</Label>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {tasks.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <div
                      className={cn(
                        'mt-1.5 w-1.5 h-1.5 rounded-full shrink-0',
                        isOnboarding ? 'bg-cyan-400' : 'bg-rose-400'
                      )}
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{t.title}</span>
                      {t.actionUrl && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                          link
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={createTasks}
                variant={isOnboarding ? 'primary' : 'destructive'}
              >
                Create {tasks.length} Tasks
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Creating Phase */}
        {phase === 'creating' && (
          <div className="space-y-3 mt-4">
            {tasks.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 py-2 px-3 rounded-lg transition-colors',
                  taskStatuses[i] === 'done'
                    ? 'bg-green-50 dark:bg-green-900/20'
                    : taskStatuses[i] === 'creating'
                      ? isOnboarding
                        ? 'bg-cyan-50 dark:bg-cyan-900/20'
                        : 'bg-rose-50 dark:bg-rose-900/20'
                      : 'bg-slate-50 dark:bg-slate-800'
                )}
              >
                <div className="w-5 h-5 flex items-center justify-center shrink-0">
                  {taskStatuses[i] === 'done' ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : taskStatuses[i] === 'creating' ? (
                    <div
                      className={cn(
                        'w-4 h-4 border-2 border-t-transparent rounded-full animate-spin',
                        isOnboarding ? 'border-cyan-500' : 'border-rose-500'
                      )}
                    />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm',
                    taskStatuses[i] === 'done'
                      ? 'text-green-700 dark:text-green-400'
                      : taskStatuses[i] === 'creating'
                        ? isOnboarding
                          ? 'text-cyan-700 dark:text-cyan-400'
                          : 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Done Phase */}
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
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                All done!
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">
                Created {createdCount} {workflowType} tasks for{' '}
                <span className="font-medium">{employee.firstName}</span>
              </p>
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={handleClose}>
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
