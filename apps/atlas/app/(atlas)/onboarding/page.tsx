'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmployeesApi, TasksApi, type Employee } from '@/lib/api-client'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ClipboardDocumentCheckIcon } from '@/components/ui/Icons'
import { Label } from '@/components/ui/label'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { NativeSelect } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { ensureMe, useMeStore } from '@/lib/store/me'

type EmployeeOption = { value: string; label: string }

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

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-slate-100 dark:bg-slate-800" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-96 rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  )
}

function WorkflowCard({
  type,
  tasks,
  employees,
  canUse,
  onCreate,
}: {
  type: 'onboarding' | 'offboarding'
  tasks: ChecklistTask[]
  employees: EmployeeOption[]
  canUse: boolean
  onCreate: (employeeId: string, ownerId: string, targetDate: string) => Promise<number>
}) {
  const [employeeId, setEmployeeId] = useState('')
  const [ownerId, setOwnerId] = useState(employees[0]?.value ?? '')
  const [targetDate, setTargetDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdCount, setCreatedCount] = useState<number | null>(null)

  const isOnboarding = type === 'onboarding'
  const title = isOnboarding ? 'Onboarding' : 'Offboarding'
  const accentClass = isOnboarding ? 'bg-cyan-500' : 'bg-rose-500'
  const bulletClass = isOnboarding ? 'bg-cyan-400' : 'bg-rose-400'

  const handleCreate = useCallback(async () => {
    if (!employeeId) return
    setCreating(true)
    setError(null)
    setCreatedCount(null)
    try {
      const count = await onCreate(employeeId, ownerId, targetDate)
      setCreatedCount(count)
      setEmployeeId('')
      setTargetDate('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tasks')
    } finally {
      setCreating(false)
    }
  }, [employeeId, ownerId, targetDate, onCreate])

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl ${accentClass} flex items-center justify-center shadow-md`}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{tasks.length} tasks</p>
        </div>
      </div>

      {/* Task list */}
      <div className="space-y-2 mb-6">
        {tasks.map((t, i) => (
          <div key={i} className="flex gap-3 py-2">
            <div className={`mt-1.5 w-2 h-2 rounded-full ${bulletClass} shrink-0`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="border-t border-slate-100 dark:border-slate-800 pt-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Employee</Label>
            <NativeSelect
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!canUse}
            >
              <option value="">Select...</option>
              {employees.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Owner</Label>
            <NativeSelect
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={!canUse}
            >
              <option value="">Unassigned</option>
              {employees.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target Date</Label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={!canUse}
            />
          </div>
        </div>

        <Button
          onClick={handleCreate}
          loading={creating}
          disabled={!canUse || !employeeId}
          variant={isOnboarding ? 'primary' : 'destructive'}
          className="w-full"
        >
          Create {tasks.length} tasks
        </Button>
      </div>

      {/* Feedback */}
      {error ? (
        <Alert variant="error" className="mt-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {createdCount !== null ? (
        <Alert variant="success" className="mt-4" onDismiss={() => setCreatedCount(null)}>
          Created {createdCount} tasks.{' '}
          <Link href="/hub" className="underline font-medium">View in My Hub</Link>
        </Alert>
      ) : null}
    </div>
  )
}

export default function OnboardingPage() {
  const me = useMeStore((s) => s.me)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canUse = me?.isHR || me?.isSuperAdmin

  const employeeOptions = useMemo<EmployeeOption[]>(() => {
    const options: EmployeeOption[] = []
    const seen = new Set<string>()

    if (me) {
      options.push({ value: me.id, label: `Me (${me.employeeId})` })
      seen.add(me.id)
    }

    for (const emp of employees) {
      if (seen.has(emp.id)) continue
      options.push({ value: emp.id, label: `${emp.firstName} ${emp.lastName} (${emp.employeeId})` })
      seen.add(emp.id)
    }

    return options
  }, [me, employees])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const meData = await ensureMe()
        if (cancelled) return

        if (!meData.isHR && !meData.isSuperAdmin) {
          setEmployees([])
          return
        }

        const list = await EmployeesApi.listManageable()
        if (cancelled) return
        setEmployees(list.items)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const createTasks = useCallback(async (
    workflow: 'onboarding' | 'offboarding',
    employeeId: string,
    ownerId: string,
    targetDate: string
  ): Promise<number> => {
    const templates = workflow === 'onboarding' ? ONBOARDING_TASKS : OFFBOARDING_TASKS
    const prefix = workflow === 'onboarding' ? 'Onboarding' : 'Offboarding'

    const employee = employees.find(e => e.id === employeeId)
    const name = employee ? `${employee.firstName} ${employee.lastName}` : 'Employee'
    const trimmedTargetDate = targetDate.trim()
    const trimmedOwnerId = ownerId.trim()
    const dueDate = trimmedTargetDate ? trimmedTargetDate : null
    const assignedToId = trimmedOwnerId ? trimmedOwnerId : null

    let count = 0
    for (const t of templates) {
      await TasksApi.create({
        title: `${prefix}: ${t.title} — ${name}`,
        description: t.description,
        category: 'GENERAL',
        dueDate,
        assignedToId,
        subjectEmployeeId: employeeId,
      })
      count++
    }
    return count
  }, [employees])

  if (loading) {
    return (
      <>
        <ListPageHeader
          title="Onboarding & Offboarding"
          description="Generate task checklists for employee transitions"
          icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <div className="p-6">
          <LoadingSkeleton />
        </div>
      </>
    )
  }

  return (
    <>
      <ListPageHeader
        title="Onboarding & Offboarding"
        description="Generate task checklists for employee transitions"
        icon={<ClipboardDocumentCheckIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <div className="space-y-6">
      {error ? (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {!canUse ? (
        <Alert variant="info" title="HR access required">
          This page is available to HR and Super Admins.
        </Alert>
      ) : null}

      {/* Workflow Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WorkflowCard
          type="onboarding"
          tasks={ONBOARDING_TASKS}
          employees={employeeOptions}
          canUse={!!canUse}
          onCreate={(empId, ownerId, date) => createTasks('onboarding', empId, ownerId, date)}
        />
        <WorkflowCard
          type="offboarding"
          tasks={OFFBOARDING_TASKS}
          employees={employeeOptions}
          canUse={!!canUse}
          onCreate={(empId, ownerId, date) => createTasks('offboarding', empId, ownerId, date)}
        />
      </div>
      </div>
    </>
  )
}
