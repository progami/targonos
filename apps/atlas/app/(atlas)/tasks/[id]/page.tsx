'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EmployeesApi, TasksApi, type Employee, type Task } from '@/lib/api-client';
import { CheckCircleIcon, TrashIcon } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField, FormSection, SelectField, TextareaField } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/ui/badge';
import { ensureMe, useMeStore } from '@/lib/store/me';

const TaskFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']),
  category: z.enum(['GENERAL', 'POLICY']),
  dueDate: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  subjectEmployeeId: z.string().optional().nullable(),
});

type TaskFormData = z.infer<typeof TaskFormSchema>;

const statusOptions = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const categoryOptions = [
  { value: 'GENERAL', label: 'General' },
  { value: 'POLICY', label: 'Policy' },
];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = (params as Record<string, string | string[] | undefined> | null)?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [task, setTask] = useState<Task | null>(null);
  const me = useMeStore((s) => s.me);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(TaskFormSchema),
    defaultValues: {
      title: '',
      description: '',
      status: 'OPEN',
      category: 'GENERAL',
      dueDate: '',
      assignedToId: '',
      subjectEmployeeId: '',
    },
  });

  const formStatus = watch('status');

  const canEdit = useMemo(() => {
    if (!me || !task) return false;
    if (me.isSuperAdmin) return true;
    if (me.isHR) return true;
    return task.createdById === me.id;
  }, [me, task]);

  const canUpdateStatus = useMemo(() => {
    if (!me || !task) return false;
    if (me.isSuperAdmin) return true;
    if (me.isHR) return true;
    if (task.createdById === me.id) return true;
    return task.assignedToId === me.id;
  }, [me, task]);

  const employeeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const seen = new Set<string>();

    if (me) {
      options.push({ value: me.id, label: `Me (${me.employeeId})` });
      seen.add(me.id);
    }

    for (const e of employees) {
      if (seen.has(e.id)) continue;
      options.push({ value: e.id, label: `${e.firstName} ${e.lastName} (${e.employeeId})` });
      seen.add(e.id);
    }

    if (task?.assignedTo && !seen.has(task.assignedTo.id)) {
      options.push({
        value: task.assignedTo.id,
        label: `${task.assignedTo.firstName} ${task.assignedTo.lastName}`,
      });
      seen.add(task.assignedTo.id);
    }

    if (task?.subjectEmployee && !seen.has(task.subjectEmployee.id)) {
      options.push({
        value: task.subjectEmployee.id,
        label: `${task.subjectEmployee.firstName} ${task.subjectEmployee.lastName}`,
      });
      seen.add(task.subjectEmployee.id);
    }

    return options;
  }, [employees, me, task]);

  useEffect(() => {
    async function load() {
      if (!id) {
        setError('Invalid task id');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const [taskData, meData] = await Promise.all([TasksApi.get(id), ensureMe()]);
        setTask(taskData);

        // Reset form with loaded data
        reset({
          title: taskData.title,
          description: taskData.description ?? '',
          status: taskData.status as 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED',
          category: taskData.category as 'GENERAL' | 'POLICY',
          dueDate: taskData.dueDate ? taskData.dueDate.slice(0, 10) : '',
          assignedToId: taskData.assignedToId ?? '',
          subjectEmployeeId: taskData.subjectEmployeeId ?? '',
        });

        const canEditNow = meData.isSuperAdmin || meData.isHR || taskData.createdById === meData.id;
        if (canEditNow) {
          setLoadingEmployees(true);
          try {
            const list = await EmployeesApi.listManageable();
            setEmployees(list.items || []);
          } finally {
            setLoadingEmployees(false);
          }
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load task');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, reset]);

  async function save(data: TaskFormData) {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await TasksApi.update(task.id, {
        title: canEdit ? data.title : undefined,
        description: canEdit ? (data.description ? data.description : null) : undefined,
        status: canUpdateStatus ? data.status : undefined,
        category: canEdit ? data.category : undefined,
        dueDate: canEdit ? (data.dueDate ? data.dueDate : null) : undefined,
        assignedToId: canEdit ? (data.assignedToId ? data.assignedToId : null) : undefined,
        subjectEmployeeId: canEdit ? (data.subjectEmployeeId ? data.subjectEmployeeId : null) : undefined,
      });
      setTask(updated);
      reset({
        title: updated.title,
        description: updated.description ?? '',
        status: updated.status as 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED',
        category: updated.category as 'GENERAL' | 'POLICY',
        dueDate: updated.dueDate ? updated.dueDate.slice(0, 10) : '',
        assignedToId: updated.assignedToId ?? '',
        subjectEmployeeId: updated.subjectEmployeeId ?? '',
      });
    } catch (e: any) {
      setError(e.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  }

  async function quickStatusChange(newStatus: 'IN_PROGRESS' | 'DONE') {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await TasksApi.update(task.id, { status: newStatus });
      setTask(updated);
      setValue('status', newStatus);
    } catch (e: any) {
      setError(e.message || 'Failed to update task');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask() {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await TasksApi.delete(task.id);
      router.push('/tasks');
    } catch (e: any) {
      setError(e.message || 'Failed to delete task');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Task"
          description="Work"
          icon={<CheckCircleIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <Card padding="lg">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-1/3" />
          </div>
        </Card>
      </>
    );
  }

  if (!task) {
    return (
      <>
        <PageHeader
          title="Task"
          description="Work"
          icon={<CheckCircleIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <Card padding="lg">
          <p className="text-sm text-muted-foreground">Task not found.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={task.title}
        description="Work"
        icon={<CheckCircleIcon className="h-6 w-6 text-white" />}
        showBack
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => quickStatusChange('IN_PROGRESS')}
              disabled={!canUpdateStatus || saving}
            >
              Start
            </Button>
            <Button onClick={() => quickStatusChange('DONE')} disabled={!canUpdateStatus || saving}>
              Mark Done
            </Button>
            <Button
              variant="danger"
              icon={<TrashIcon className="h-4 w-4" />}
              onClick={deleteTask}
              disabled={!canEdit || saving}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="space-y-6 max-w-4xl">
        {error && (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card padding="md">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Status
              </p>
              <StatusBadge status={task.status} />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Due</p>
              <p className="text-sm text-foreground">{formatDate(task.dueDate ?? null)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Assigned
              </p>
              <p className="text-sm text-foreground">
                {task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Completed
              </p>
              <p className="text-sm text-foreground">{formatDate(task.completedAt ?? null)}</p>
            </div>
          </div>

          {task.subjectEmployee && (
            <div className="mt-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Subject
                </p>
                <p className="text-sm text-foreground">
                  {task.subjectEmployee.firstName} {task.subjectEmployee.lastName}
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <form onSubmit={handleSubmit(save)} className="space-y-8">
            <FormSection
              title="Edit Task"
              description={canEdit ? 'Update details and status.' : 'You can update status only.'}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <FormField
                    label="Title"
                    disabled={!canEdit}
                    error={errors.title?.message}
                    {...register('title')}
                  />
                </div>

                {canEdit && (
                  <>
                    <SelectField
                      label="Assigned To"
                      options={employeeOptions}
                      placeholder={loadingEmployees ? 'Loading employees...' : 'Unassigned'}
                      disabled={saving || !canEdit}
                      error={errors.assignedToId?.message}
                      {...register('assignedToId')}
                    />

                    <SelectField
                      label="Subject Employee (optional)"
                      options={employeeOptions}
                      placeholder={loadingEmployees ? 'Loading employees...' : 'None'}
                      disabled={saving || !canEdit}
                      error={errors.subjectEmployeeId?.message}
                      {...register('subjectEmployeeId')}
                    />
                  </>
                )}

                <SelectField
                  label="Status"
                  options={statusOptions}
                  disabled={!canUpdateStatus}
                  error={errors.status?.message}
                  {...register('status')}
                />

                <SelectField
                  label="Category"
                  options={categoryOptions}
                  disabled={!canEdit}
                  error={errors.category?.message}
                  {...register('category')}
                />

                <FormField
                  label="Due Date"
                  type="date"
                  disabled={!canEdit}
                  error={errors.dueDate?.message}
                  {...register('dueDate')}
                />

                <div className="sm:col-span-2">
                  <TextareaField
                    label="Description"
                    rows={4}
                    disabled={!canEdit}
                    error={errors.description?.message}
                    {...register('description')}
                  />
                </div>
              </div>
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
              <Button type="submit" loading={saving} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
