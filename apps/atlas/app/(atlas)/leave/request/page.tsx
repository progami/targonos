'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardApi } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { CalendarDaysIcon } from '@/components/ui/Icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { LeaveRequestForm } from '@/components/leave/LeaveRequestForm'

export default function LeaveRequestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState<{
    id: string
    firstName: string
    lastName: string
    avatar?: string | null
    department?: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const dashboard = await DashboardApi.get()
        if (dashboard.currentEmployee) {
          setEmployee({
            id: dashboard.currentEmployee.id,
            firstName: dashboard.currentEmployee.firstName,
            lastName: dashboard.currentEmployee.lastName,
            avatar: dashboard.currentEmployee.avatar,
            department: dashboard.currentEmployee.department,
          })
        }
      } catch (e) {
        setError('Failed to load employee data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <>
        <PageHeader
          title="Request Leave"
          description="Leaves"
          icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
          backHref="/leave"
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

  if (!employee) {
    return (
      <>
        <PageHeader
          title="Request Leave"
          description="Leaves"
          icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
          backHref="/leave"
        />
        <div className="max-w-2xl mx-auto">
          <Card padding="lg">
            <p className="text-sm font-medium text-foreground">Unable to load employee data</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </Card>
        </div>
      </>
    )
  }

  const employeeName = `${employee.firstName} ${employee.lastName}`

  return (
    <>
      <PageHeader
        title="Request Leave"
        description="Leaves"
        icon={<CalendarDaysIcon className="h-6 w-6 text-white" />}
        backHref="/leave"
      />

      <div className="max-w-2xl mx-auto">
        <Card padding="lg">
          <div className="flex items-start gap-3 pb-6 border-b border-border">
            <Avatar src={employee.avatar} alt={employeeName} size="lg" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-0.5">
                Employee
              </p>
              <p className="text-sm font-medium text-foreground">{employeeName}</p>
              {employee.department ? (
                <p className="text-sm text-muted-foreground">{employee.department}</p>
              ) : null}
            </div>
          </div>

          <div className="py-6">
            <LeaveRequestForm
              employeeId={employee.id}
              onSuccess={() => router.push('/leave')}
              onCancel={() => router.push('/leave')}
            />
          </div>
        </Card>
      </div>
    </>
  )
}
