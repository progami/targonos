'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  DisciplinaryActionsApi,
  EmployeeFilesApi,
  EmployeesApi,
  LeavesApi,
  PerformanceReviewsApi,
  UploadsApi,
  type DisciplinaryAction,
  type Employee,
  type EmployeeFile,
  type LeaveBalance,
  type LeaveRequest,
  type PerformanceReview,
} from '@/lib/api-client'
import { ensureMe } from '@/lib/store/me'
import {
  CalendarDaysIcon,
  ClipboardDocumentCheckIcon,
  FolderIcon,
  PencilIcon,
  ShieldExclamationIcon,
  UsersIcon,
  UserPlusIcon,
  UserMinusIcon,
} from '@/components/ui/Icons'
import { OnboardingOffboardingModal } from '@/components/employee/OnboardingOffboardingModal'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeeDocumentsTab } from '@/components/employee/profile/tabs/DocumentsTab'
import { EmployeeLeaveTab } from '@/components/employee/profile/tabs/LeaveTab'
import { EmployeeOverviewTab } from '@/components/employee/profile/tabs/OverviewTab'
import { EmployeePerformanceTab } from '@/components/employee/profile/tabs/PerformanceTab'
import { EmployeeViolationsTab } from '@/components/employee/profile/tabs/ViolationsTab'

type Tab = 'overview' | 'documents' | 'performance' | 'leave' | 'violations'

type EmployeeProfileVariant = 'employee' | 'hub'

type EmployeeProfileClientProps = {
  employeeId: string
  variant?: EmployeeProfileVariant
}

export function EmployeeProfileClient({ employeeId, variant = 'employee' }: EmployeeProfileClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = employeeId

  const tabParam = (searchParams.get('tab') ?? '').toLowerCase()
  const normalizedTabParam = tabParam === 'timeoff' ? 'leave' : tabParam
  const initialTab: Tab =
    normalizedTabParam === 'documents' ||
    normalizedTabParam === 'performance' ||
    normalizedTabParam === 'leave' ||
    normalizedTabParam === 'violations'
      ? (normalizedTabParam as Tab)
      : 'overview'

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [me, setMe] = useState<{ id: string; isHR: boolean; isSuperAdmin: boolean } | null>(null)
  const [permissions, setPermissions] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [reviews, setReviews] = useState<PerformanceReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveLoading, setLeaveLoading] = useState(false)

  const [violations, setViolations] = useState<DisciplinaryAction[]>([])
  const [violationsLoading, setViolationsLoading] = useState(false)

  const [files, setFiles] = useState<EmployeeFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadVisibility, setUploadVisibility] = useState<'HR_ONLY' | 'EMPLOYEE_AND_HR'>('HR_ONLY')
  const [uploading, setUploading] = useState(false)
  const [removingEmployee, setRemovingEmployee] = useState(false)

  // Onboarding/Offboarding modal state
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false)
  const [workflowType, setWorkflowType] = useState<'onboarding' | 'offboarding'>('onboarding')

  const isSuperAdmin = Boolean(me?.isSuperAdmin)
  const isHR = Boolean(me?.isHR)
  const isHROrAbove = isHR || isSuperAdmin
  const isSelf = Boolean(employee && me && employee.id === me.id)
  const isManager = Boolean(permissions?.isManager)
  const canViewSensitive = isSelf || isHROrAbove || isManager
  const canViewDocuments = isSelf || isHROrAbove
  const canViewPerformance = canViewSensitive
  const canViewLeave = canViewSensitive
  const canViewViolations = canViewSensitive
  const permissionsReady = Boolean(employee && me && permissions)
  const canRemoveEmployee = isSuperAdmin && !isSelf

  // Sync tab from URL only when it differs (e.g., browser back/forward navigation)
  useEffect(() => {
    if (initialTab !== activeTab) {
      setActiveTab(initialTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam])

  useEffect(() => {
    if (tabParam !== 'timeoff') return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', 'leave')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '')
  }, [router, searchParams, tabParam])

  useEffect(() => {
    if (!isHROrAbove && isSelf) {
      setUploadVisibility('EMPLOYEE_AND_HR')
    }
  }, [isHROrAbove, isSelf])

  const tabs = useMemo(
    () => [
      { id: 'overview' as Tab, label: 'Overview', icon: UsersIcon, visible: true },
      { id: 'documents' as Tab, label: 'Documents', icon: FolderIcon, visible: canViewDocuments },
      { id: 'leave' as Tab, label: 'Leave', icon: CalendarDaysIcon, visible: canViewLeave },
      { id: 'performance' as Tab, label: 'Reviews', icon: ClipboardDocumentCheckIcon, visible: canViewPerformance },
      { id: 'violations' as Tab, label: 'Violations', icon: ShieldExclamationIcon, visible: canViewViolations },
    ],
    [canViewDocuments, canViewLeave, canViewPerformance, canViewViolations]
  )

  const visibleTabs = useMemo(() => tabs.filter((tab) => tab.visible), [tabs])

  function setTab(next: Tab) {
    if (!visibleTabs.some((tab) => tab.id === next)) return
    setActiveTab(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '')
  }

  useEffect(() => {
    if (!permissionsReady) return
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      const fallback = visibleTabs[0]?.id ?? 'overview'
      setActiveTab(fallback)
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', fallback)
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : '')
    }
  }, [activeTab, permissionsReady, router, searchParams, visibleTabs])

  useEffect(() => {
    let cancelled = false

    async function loadEmployee() {
      try {
        setLoading(true)
        setError(null)

        const [emp, perms, meRes] = await Promise.all([
          EmployeesApi.get(id),
          EmployeesApi.getPermissions(id),
          ensureMe(),
        ])
        if (cancelled) return

        setEmployee(emp)
        setPermissions(perms)
        setMe({ id: meRes.id, isHR: Boolean(meRes.isHR), isSuperAdmin: Boolean(meRes.isSuperAdmin) })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : 'Failed to load employee'
        setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadEmployee()

    return () => {
      cancelled = true
    }
  }, [id])

  // Preload all tab data when employee and permissions are ready
  useEffect(() => {
    if (!employee || !permissionsReady) return
    const emp = employee // capture for closure

    async function loadAllTabData() {
      // Load all tab data in parallel for instant tab switching
      const promises: Promise<void>[] = []

      if (canViewPerformance) {
        promises.push(
          (async () => {
            try {
              setReviewsLoading(true)
              const data = await PerformanceReviewsApi.list({ employeeId: emp.id })
              setReviews(data.items)
            } catch (e) {
              console.error('Failed to load reviews', e)
              setReviews([])
            } finally {
              setReviewsLoading(false)
            }
          })()
        )
      }

      if (canViewLeave) {
        promises.push(
          (async () => {
            try {
              setLeaveLoading(true)
              const [balanceData, requestsData] = await Promise.all([
                LeavesApi.getBalance({ employeeId: emp.id }),
                LeavesApi.list({ employeeId: emp.id }),
              ])
              setLeaveBalances(balanceData.balances)
              setLeaveRequests(requestsData.items)
            } catch (e) {
              console.error('Failed to load leave data', e)
              setLeaveBalances([])
              setLeaveRequests([])
            } finally {
              setLeaveLoading(false)
            }
          })()
        )
      }

      if (canViewDocuments) {
        promises.push(
          (async () => {
            try {
              setFilesLoading(true)
              const res = await EmployeeFilesApi.list(emp.id)
              setFiles(res.items)
            } catch (e) {
              console.error('Failed to load employee files', e)
              setFiles([])
            } finally {
              setFilesLoading(false)
            }
          })()
        )
      }

      if (canViewViolations) {
        promises.push(
          (async () => {
            try {
              setViolationsLoading(true)
              const data = await DisciplinaryActionsApi.list({ employeeId: emp.id })
              setViolations(data.items)
            } catch (e) {
              console.error('Failed to load violations', e)
              setViolations([])
            } finally {
              setViolationsLoading(false)
            }
          })()
        )
      }

      await Promise.all(promises)
    }

    loadAllTabData()
  }, [employee, permissionsReady, canViewPerformance, canViewLeave, canViewDocuments, canViewViolations])

  async function uploadDocument() {
    if (!employee || !uploadFile) return
    try {
      setUploading(true)
      setError(null)

      const contentType = uploadFile.type ? uploadFile.type : 'application/octet-stream'
      const trimmedTitle = uploadTitle.trim()
      const presign = await UploadsApi.presign({
        filename: uploadFile.name,
        contentType,
        size: uploadFile.size,
        target: { type: 'EMPLOYEE', id: employee.id },
        visibility: uploadVisibility,
      })

      const put = await fetch(presign.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: uploadFile,
      })

      if (!put.ok) {
        throw new Error(`Upload failed (${put.status})`)
      }

      await UploadsApi.finalize({
        key: presign.key,
        filename: uploadFile.name,
        contentType,
        size: uploadFile.size,
        target: { type: 'EMPLOYEE', id: employee.id },
        visibility: uploadVisibility,
        title: trimmedTitle.length > 0 ? trimmedTitle : null,
      })

      setUploadFile(null)
      setUploadTitle('')

      const res = await EmployeeFilesApi.list(employee.id)
      setFiles(res.items)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to upload'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  async function downloadFile(fileId: string) {
    if (!employee) return
    try {
      const { url } = await EmployeeFilesApi.getDownloadUrl(employee.id, fileId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to download'
      setError(message)
    }
  }

  const headerTitle = useMemo(() => {
    if (variant === 'hub') return 'My Hub'
    if (!employee) return 'Employee profile'
    return `${employee.firstName} ${employee.lastName}`.trim()
  }, [employee, variant])

  const headerDescription = useMemo(() => {
    if (!employee) return ''
    if (variant === 'hub') {
      return `${employee.firstName} ${employee.lastName} • ${employee.department} • ${employee.position}`
    }
    return `${employee.department} • ${employee.position}`
  }, [employee, variant])

  const canEditFields: string[] = permissions?.editableFields ?? []
  const canEdit = canEditFields.length > 0

  // Group leave balances into categories
  const groupedLeaveBalances = useMemo(() => {
    const filtered = leaveBalances.filter(b => b.leaveType !== 'UNPAID')

    // Core leave types (always show first)
    const coreTypes = ['PTO']
    // Parental leave types
    const parentalTypes = ['PARENTAL', 'MATERNITY', 'PATERNITY']
    // Bereavement types
    const bereavementTypes = ['BEREAVEMENT', 'BEREAVEMENT_IMMEDIATE', 'BEREAVEMENT_EXTENDED']
    // Other types
    const otherTypes = ['JURY_DUTY']

    const core = filtered.filter(b => coreTypes.includes(b.leaveType))
    const parental = filtered.filter(b => parentalTypes.includes(b.leaveType))
    const bereavement = filtered.filter(b => bereavementTypes.includes(b.leaveType))
    const other = filtered.filter(b =>
      !coreTypes.includes(b.leaveType) &&
      !parentalTypes.includes(b.leaveType) &&
      !bereavementTypes.includes(b.leaveType) &&
      !['UNPAID'].includes(b.leaveType)
    )

    return { core, parental, bereavement, other }
  }, [leaveBalances])

  if (loading && !employee) {
    return (
      <>
        <ListPageHeader
          title={headerTitle}
          description="Loading…"
          icon={<UsersIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <Card padding="lg">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </Card>
      </>
    )
  }

  if (!employee) {
    return (
      <>
        <ListPageHeader
          title={headerTitle}
          description="Not found"
          icon={<UsersIcon className="h-6 w-6 text-white" />}
          showBack
        />
        {error ? (
          <Alert variant="error" className="mb-6" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
        <Card padding="lg">
          <p className="text-sm text-muted-foreground">Employee not found.</p>
          <div className="mt-4">
            <Button href="/hub" variant="secondary">
              Back to My Hub
            </Button>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      {error ? (
        <Alert variant="error" className="mb-6" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      <ListPageHeader
        title={headerTitle}
        description={headerDescription}
        icon={<UsersIcon className="h-6 w-6 text-white" />}
        showBack
        action={
          <div className="flex flex-wrap gap-2">
            {isHROrAbove && !isSelf ? (
              <>
                <Button
                  variant="secondary"
                  icon={<UserPlusIcon className="h-4 w-4" />}
                  onClick={() => {
                    setWorkflowType('onboarding')
                    setWorkflowModalOpen(true)
                  }}
                >
                  Start Onboarding
                </Button>
                <Button
                  variant="secondary"
                  icon={<UserMinusIcon className="h-4 w-4" />}
                  onClick={() => {
                    setWorkflowType('offboarding')
                    setWorkflowModalOpen(true)
                  }}
                >
                  Start Offboarding
                </Button>
              </>
            ) : null}
            {employee && canRemoveEmployee ? (
              <Button
                variant="destructive"
                loading={removingEmployee}
                onClick={async () => {
                  const confirmed = window.confirm(
                    `Remove ${employee.firstName} ${employee.lastName}?\n\nThis will mark them as RESIGNED and remove them from active views (org chart, search, pickers).`
                  )
                  if (!confirmed) return
                  try {
                    setRemovingEmployee(true)
                    setError(null)
                    await EmployeesApi.delete(employee.id)
                    router.push('/employees')
                  } catch (e) {
                    const message = e instanceof Error ? e.message : 'Failed to remove employee'
                    setError(message)
                  } finally {
                    setRemovingEmployee(false)
                  }
                }}
              >
                Remove employee
              </Button>
            ) : null}
            {canEdit ? (
              <Button href={`/employees/${employee.id}/edit`} icon={<PencilIcon className="h-4 w-4" />}>
                Edit profile
              </Button>
            ) : null}
          </div>
        }
      />

      {!canViewSensitive ? (
        <Alert variant="info" className="mb-6">
          You have limited access to this profile. Sensitive records (leave, performance, timeline) are visible only to managers and HR.
        </Alert>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setTab(value as Tab)}>
        <TabsList className="w-full h-auto flex-wrap justify-start bg-muted/30 border border-border/60 rounded-xl">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="gap-2 data-[state=active]:bg-accent/10 data-[state=active]:text-accent data-[state=active]:shadow-none"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <EmployeeOverviewTab employee={employee} />
        </TabsContent>

        {canViewDocuments ? (
          <TabsContent value="documents">
            <EmployeeDocumentsTab
              canUpload={isHROrAbove || isSelf}
              canManageVisibility={isHROrAbove}
              isSelf={isSelf}
              uploadReady={Boolean(uploadFile)}
              uploadTitle={uploadTitle}
              setUploadTitle={setUploadTitle}
              uploadVisibility={uploadVisibility}
              setUploadVisibility={setUploadVisibility}
              setUploadFile={setUploadFile}
              uploading={uploading}
              uploadDocument={uploadDocument}
              files={files}
              filesLoading={filesLoading}
              downloadFile={downloadFile}
            />
          </TabsContent>
        ) : null}

        {canViewPerformance ? (
          <TabsContent value="performance">
            <EmployeePerformanceTab reviews={reviews} loading={reviewsLoading} />
          </TabsContent>
        ) : null}

        {canViewLeave ? (
          <TabsContent value="leave">
            <EmployeeLeaveTab
              groupedBalances={groupedLeaveBalances}
              leaveBalances={leaveBalances}
              leaveRequests={leaveRequests}
              loading={leaveLoading}
              isSelf={isSelf}
            />
          </TabsContent>
        ) : null}

        {canViewViolations ? (
          <TabsContent value="violations">
            <EmployeeViolationsTab violations={violations} loading={violationsLoading} />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Onboarding/Offboarding Modal */}
      <OnboardingOffboardingModal
        open={workflowModalOpen}
        onClose={() => setWorkflowModalOpen(false)}
        employee={employee}
        workflowType={workflowType}
      />
    </>
  )
}
