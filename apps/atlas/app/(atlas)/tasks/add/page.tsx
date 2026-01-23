'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { TasksApi, EmployeesApi, type Employee } from '@/lib/api-client'
import { CheckCircleIcon } from '@/components/ui/Icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useNavigationHistory } from '@/lib/navigation-history'
import { ensureMe, useMeStore } from '@/lib/store/me'

const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(['GENERAL', 'CASE', 'POLICY']).default('GENERAL'),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  subjectEmployeeId: z.string().optional().nullable(),
})

type FormData = z.infer<typeof CreateTaskSchema>

const categoryOptions = [
  { value: 'GENERAL', label: 'General' },
  { value: 'POLICY', label: 'Policy' },
]

export default function AddTaskPage() {
  const router = useRouter()
  const { goBack } = useNavigationHistory()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const me = useMeStore((s) => s.me)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(CreateTaskSchema),
    defaultValues: {
      category: 'GENERAL',
    },
  })

  useEffect(() => {
    async function loadEmployees() {
      try {
        const [meData, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items || [])
        setValue('assignedToId', meData.id)
      } catch (e) {
        console.error('Failed to load employees:', e)
      } finally {
        setLoadingEmployees(false)
      }
    }
    loadEmployees()
  }, [setValue])

  const onSubmit = async (data: FormData) => {
    setSubmitError(null)
    try {
      const created = await TasksApi.create({
        title: data.title,
        description: data.description,
        category: data.category,
        dueDate: data.dueDate,
        assignedToId: data.assignedToId,
        subjectEmployeeId: data.subjectEmployeeId,
      })
      router.push(`/tasks/${created.id}`)
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to create task')
    }
  }

  const employeeOptions: { value: string; label: string }[] = []
  if (me) {
    employeeOptions.push({ value: me.id, label: `Me (${me.employeeId})` })
  }
  for (const e of employees) {
    employeeOptions.push({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` })
  }

  return (
    <>
      <PageHeader
        title="New Task"
        description="Work"
        icon={<CheckCircleIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <div className="max-w-3xl">
        <Card padding="lg">
          {submitError && (
            <Alert variant="error" className="mb-6" onDismiss={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input
                {...register('title')}
                placeholder="e.g., Collect signed NDA"
                className={cn(errors.title && 'border-destructive')}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <NativeSelect {...register('category')}>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input {...register('dueDate')} type="date" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedToId">Assigned To</Label>
                <NativeSelect {...register('assignedToId')}>
                  <option value="">{loadingEmployees ? 'Loading...' : 'Unassigned'}</option>
                  {employeeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subjectEmployeeId">Subject Employee</Label>
                <NativeSelect {...register('subjectEmployeeId')}>
                  <option value="">{loadingEmployees ? 'Loading...' : 'None'}</option>
                  {employeeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                {...register('description')}
                rows={4}
                placeholder="Add more detail..."
                className="resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="secondary" onClick={goBack}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Create Task'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}
