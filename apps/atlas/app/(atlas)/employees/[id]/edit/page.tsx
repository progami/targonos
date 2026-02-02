'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { EmployeesApi, DepartmentsApi, type Employee, type Department } from '@/lib/api-client'
import { UsersIcon, LockClosedIcon } from '@/components/ui/Icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card, CardDivider } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useNavigationHistory } from '@/lib/navigation-history'
import { EMPLOYEE_REGION_OPTIONS, EMPLOYEE_STATUS_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from '@/lib/domain/employee/constants'

const UNASSIGNED_DEPARTMENT_NAME = 'Unassigned'

// Simplified schema for small team
const EditEmployeeSchema = z.object({
  phone: z.string().optional().nullable(),
  position: z.string().min(1, 'Position is required'),
  department: z.string().min(1, 'Department is required'),
  employmentType: z.string().min(1, 'Employment type is required'),
  status: z.string().min(1, 'Status is required'),
  joinDate: z.string().min(1, 'Join date is required'),
  region: z.string().min(1, 'Region is required'),
  reportsToId: z.string().optional().nullable(),
})

type FormData = z.infer<typeof EditEmployeeSchema>

type FieldPermissions = Record<string, { canEdit: boolean; reason?: string }>

function LockedBadge({ reason }: { reason?: string }) {
  const label = reason?.includes('Google') ? 'Google' : 'Locked'
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-2" title={reason}>
      <LockClosedIcon className="h-3 w-3" />
      {label}
    </span>
  )
}

export default function EditEmployeePage() {
  const router = useRouter()
  const { goBack } = useNavigationHistory()
  const params = useParams()
  const id = params.id as string

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [fieldPermissions, setFieldPermissions] = useState<FieldPermissions>({})
  const [editableFields, setEditableFields] = useState<string[]>([])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(EditEmployeeSchema),
  })

  useEffect(() => {
    async function load() {
      try {
        const [data, employeesRes, deptsRes, permsRes] = await Promise.all([
          EmployeesApi.get(id),
          EmployeesApi.list({ take: 200 }),
          DepartmentsApi.list(),
          EmployeesApi.getPermissions(id),
        ])
        setEmployee(data)
        setAllEmployees(employeesRes.items)
        setDepartments(deptsRes.items)
        setFieldPermissions(permsRes.fieldPermissions)
        setEditableFields(permsRes.editableFields)

        // Set form defaults
        reset({
          phone: (data as any).phone || '',
          position: data.position,
          department: data.department || '',
          employmentType: data.employmentType,
          status: data.status,
          joinDate: data.joinDate?.split('T')[0] || '',
          region: (data as any).region || 'PAKISTAN',
          reportsToId: data.reportsToId || '',
        })
      } catch (e: any) {
        setSubmitError(e.message || 'Failed to load employee')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, reset])

  const canEdit = (field: string) => fieldPermissions[field]?.canEdit ?? false
  const getReason = (field: string) => fieldPermissions[field]?.reason

  const onSubmit = async (data: FormData) => {
    setSubmitError(null)
    const payload: Record<string, any> = {}

    if (canEdit('phone')) payload.phone = data.phone || null
    if (canEdit('position')) payload.position = data.position
    if (canEdit('department')) payload.department = data.department
    if (canEdit('employmentType')) payload.employmentType = data.employmentType
    if (canEdit('status')) payload.status = data.status
    if (canEdit('joinDate')) payload.joinDate = data.joinDate
    if (canEdit('region')) payload.region = data.region
    if (canEdit('reportsToId')) payload.reportsToId = data.reportsToId || null

    try {
      await EmployeesApi.update(id, payload)
      router.push(`/employees/${id}`)
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to update employee')
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Edit Employee"
          description="People"
          icon={<UsersIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <div className="max-w-2xl">
          <Card padding="lg">
            <div className="animate-pulse space-y-4">
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-10 bg-muted rounded" />
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-10 bg-muted rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (!employee) {
    return (
      <>
        <PageHeader
          title="Edit Employee"
          description="People"
          icon={<UsersIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <div className="max-w-2xl">
          <Card padding="lg">
            <Alert variant="error">{submitError || 'Employee not found'}</Alert>
          </Card>
        </div>
      </>
    )
  }

  if (editableFields.length === 0) {
    router.replace(`/employees/${id}`)
    return null
  }

  return (
    <>
      <PageHeader
        title="Edit Employee"
        description={`${employee.firstName} ${employee.lastName}`}
        icon={<UsersIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <div className="max-w-2xl">
        <Card padding="lg">
          {submitError && (
            <Alert variant="error" className="mb-6" onDismiss={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            {/* Identity (Read-only from Google) */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Identity</h3>
                <p className="text-xs text-muted-foreground mt-1">Synced from Google Workspace</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employee ID <LockedBadge /></Label>
                  <Input value={employee.employeeId} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Email <LockedBadge reason={getReason('email')} /></Label>
                  <Input value={employee.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label>First Name <LockedBadge reason={getReason('firstName')} /></Label>
                  <Input value={employee.firstName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Last Name <LockedBadge reason={getReason('lastName')} /></Label>
                  <Input value={employee.lastName} disabled />
                </div>
              </div>
            </div>

            <CardDivider />

            {/* Contact */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Contact</h3>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Phone
                  {!canEdit('phone') && <LockedBadge reason={getReason('phone')} />}
                </Label>
                <Input
                  {...register('phone')}
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  disabled={!canEdit('phone')}
                />
              </div>
            </div>

            <CardDivider />

            {/* Employment */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Employment</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reportsToId">Reports To</Label>
                  <NativeSelect {...register('reportsToId')} disabled={!canEdit('reportsToId')}>
                    <option value="">No Manager</option>
                    {allEmployees
                      .filter((emp) => emp.id !== id)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.position})
                        </option>
                      ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position">Position <span className="text-destructive">*</span></Label>
                  <Input
                    {...register('position')}
                    disabled={!canEdit('position')}
                    className={cn(errors.position && 'border-destructive')}
                  />
                  {errors.position && <p className="text-xs text-destructive">{errors.position.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department <span className="text-destructive">*</span></Label>
                  <NativeSelect
                    {...register('department')}
                    disabled={!canEdit('department')}
                    className={cn(errors.department && 'border-destructive')}
                  >
                    <option value="">Select department...</option>
                    <option value={UNASSIGNED_DEPARTMENT_NAME}>{UNASSIGNED_DEPARTMENT_NAME}</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </NativeSelect>
                  {errors.department && <p className="text-xs text-destructive">{errors.department.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="employmentType">Employment Type <span className="text-destructive">*</span></Label>
                  <NativeSelect
                    {...register('employmentType')}
                    disabled={!canEdit('employmentType')}
                    className={cn(errors.employmentType && 'border-destructive')}
                  >
                    {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status <span className="text-destructive">*</span></Label>
                  <NativeSelect
                    {...register('status')}
                    disabled={!canEdit('status')}
                    className={cn(errors.status && 'border-destructive')}
                  >
                    {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="joinDate">Join Date <span className="text-destructive">*</span></Label>
                  <Input
                    {...register('joinDate')}
                    type="date"
                    disabled={!canEdit('joinDate')}
                    className={cn(errors.joinDate && 'border-destructive')}
                  />
                  {errors.joinDate && <p className="text-xs text-destructive">{errors.joinDate.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="region">Region <span className="text-destructive">*</span></Label>
                  <NativeSelect
                    {...register('region')}
                    disabled={!canEdit('region')}
                    className={cn(errors.region && 'border-destructive')}
                  >
                    {EMPLOYEE_REGION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
              <Button type="button" variant="secondary" onClick={goBack}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  )
}
