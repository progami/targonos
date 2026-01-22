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
import { TasksApi, EmployeesApi, type Employee } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ensureMe, useMeStore } from '@/lib/store/me'

type ChecklistTask = {
  title: string
  description: string
}

const ONBOARDING_TASKS: ChecklistTask[] = [
  { title: 'Confirm profile basics', description: 'Verify role, department, and reporting line' },
  { title: 'Collect documents', description: 'Contract, ID, bank details uploaded to profile' },
  { title: 'Provision access', description: 'Portal entitlement and Atlas roles' },
  { title: 'Policies & acknowledgements', description: 'Share and confirm key policies' },
  { title: 'Day-1 readiness', description: 'Calendar, equipment, workspace' },
]

const OFFBOARDING_TASKS: ChecklistTask[] = [
  { title: 'Confirm last day & handover', description: 'Manager sign-off and handover plan' },
  { title: 'Reassign open work', description: 'Transfer tasks and responsibilities' },
  { title: 'Disable access', description: 'Remove Portal and Atlas access' },
  { title: 'Recover assets', description: 'Laptop, badge, keys returned' },
  { title: 'Archive & close', description: 'Final documents and status update' },
]

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

  // Progress state
  const [phase, setPhase] = useState<'form' | 'creating' | 'done'>('form')
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([])
  const [createdCount, setCreatedCount] = useState(0)

  const isOnboarding = workflowType === 'onboarding'
  const tasks = isOnboarding ? ONBOARDING_TASKS : OFFBOARDING_TASKS
  const title = isOnboarding ? 'Start Onboarding' : 'Start Offboarding'
  const accentColor = isOnboarding ? 'cyan' : 'rose'

  // Load employees when modal opens
  useEffect(() => {
    if (!open) return

    // Reset state when opening
    setPhase('form')
    setTaskStatuses(tasks.map(() => 'pending'))
    setCreatedCount(0)
    setError(null)

    async function loadEmployees() {
      try {
        setLoadingEmployees(true)
        const [meData, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items)
        // Default owner to current user
        setOwnerId(meData.id)
      } catch (e) {
        console.error('Failed to load employees:', e)
      } finally {
        setLoadingEmployees(false)
      }
    }
    loadEmployees()
  }, [open, tasks])

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
    const dueDate = targetDate.trim() || null
    const assignedToId = ownerId.trim() || null

    let count = 0
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i]

      // Mark current task as creating
      setTaskStatuses((prev) => {
        const next = [...prev]
        next[i] = 'creating'
        return next
      })

      try {
        await TasksApi.create({
          title: `${prefix}: ${t.title} — ${employeeName}`,
          description: t.description,
          category: 'GENERAL',
          dueDate,
          assignedToId,
          subjectEmployeeId: employee.id,
        })
        count++
        setCreatedCount(count)

        // Mark task as done
        setTaskStatuses((prev) => {
          const next = [...prev]
          next[i] = 'done'
          return next
        })

        // Small delay for visual effect
        await new Promise((r) => setTimeout(r, 150))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create task')
        setPhase('form')
        return
      }
    }

    setPhase('done')
  }, [employee, isOnboarding, ownerId, targetDate, tasks])

  const handleClose = () => {
    setOwnerId('')
    setTargetDate('')
    setError(null)
    setPhase('form')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
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
                    <span className="text-sm text-slate-600 dark:text-slate-300">{t.title}</span>
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
