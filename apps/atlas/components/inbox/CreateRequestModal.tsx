'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { TasksApi, EmployeesApi, type Employee } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ensureMe, useMeStore } from '@/lib/store/me'

const CreateRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().min(1, 'Please select an employee'),
})

type FormData = z.infer<typeof CreateRequestSchema>

type CreateRequestModalProps = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateRequestModal({ open, onClose, onCreated }: CreateRequestModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const me = useMeStore((s) => s.me)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(CreateRequestSchema),
    defaultValues: {
      assignedToId: '',
    },
  })

  useEffect(() => {
    if (!open) return

    async function loadEmployees() {
      try {
        setLoadingEmployees(true)
        const [, data] = await Promise.all([ensureMe(), EmployeesApi.listManageable()])
        setEmployees(data.items || [])
      } catch (e) {
        console.error('Failed to load employees:', e)
      } finally {
        setLoadingEmployees(false)
      }
    }
    loadEmployees()
  }, [open])

  const onSubmit = async (data: FormData) => {
    setSubmitError(null)
    try {
      await TasksApi.create({
        title: data.title,
        description: data.description,
        category: 'GENERAL',
        dueDate: data.dueDate,
        assignedToId: data.assignedToId,
      })
      reset()
      onCreated()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create request'
      setSubmitError(message)
    }
  }

  const handleClose = () => {
    reset()
    setSubmitError(null)
    onClose()
  }

  const employeeOptions: { value: string; label: string }[] = []
  if (me) {
    employeeOptions.push({ value: me.id, label: `Me (${me.employeeId})` })
  }
  for (const e of employees) {
    if (e.id !== me?.id) {
      employeeOptions.push({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Request</DialogTitle>
          <DialogDescription>
            Create a task for an employee to complete.
          </DialogDescription>
        </DialogHeader>

        {submitError && (
          <Alert variant="error" className="mt-2" onDismiss={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="assignedToId">
              Assign To <span className="text-destructive">*</span>
            </Label>
            <NativeSelect
              {...register('assignedToId')}
              className={cn(errors.assignedToId && 'border-destructive')}
            >
              <option value="">{loadingEmployees ? 'Loading...' : 'Select employee'}</option>
              {employeeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </NativeSelect>
            {errors.assignedToId && (
              <p className="text-xs text-destructive">{errors.assignedToId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register('title')}
              placeholder="e.g., Please upload your passport"
              className={cn(errors.title && 'border-destructive')}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              {...register('description')}
              rows={3}
              placeholder="Add more detail..."
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input {...register('dueDate')} type="date" />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
