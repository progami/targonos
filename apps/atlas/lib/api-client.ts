// Centralized, typed API client for ATLAS
// Avoid direct fetch calls in UI components

import type {
  CompletedWorkItemDTO,
  CompletedWorkItemsResponse,
  WorkItemDTO,
  WorkItemsResponse,
} from '@/lib/contracts/work-items'
import type { WorkflowRecordDTO } from '@/lib/contracts/workflow-record'

export type Employee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  avatar?: string | null
  phone?: string
  department?: string
  dept?: { id: string; name: string } | null
  position: string
  employmentType: string
  joinDate: string
  status: string
  exitReason?: string | null
  lastWorkingDay?: string | null
  exitNotes?: string | null
  roles?: { id: string; name: string }[]
  reportsToId?: string | null
  manager?: { id: string; firstName: string; lastName: string; position: string } | null
}

export type EmployeeProjectMembership = {
  id: string
  role?: string | null
  joinedAt: string
  project: {
    id: string
    name: string
    code?: string | null
    status: string
  }
}

export type Policy = {
  id: string
  title: string
  category: string
  region: string
  summary?: string | null
  content?: string | null
  fileUrl?: string | null
  version: string
  effectiveDate?: string | null
  status: string
  createdAt?: string
  updatedAt?: string
}

export class ApiError extends Error {
  status: number
  body: any
  constructor(message: string, status: number, body: any) {
    super(message)
    this.status = status
    this.body = body
  }
}

export function getApiBase(): string {
  // Allow override via env for future deployments; default to /atlas
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE
  }
  // Default to /atlas basePath matching next.config.js
  return '/atlas'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase()
  const url = `${base}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Accept': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  } as RequestInit)

  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json')
  let body: any = null
  try {
    body = isJson ? await res.json() : await res.text()
  } catch {
    body = null
  }
  if (!res.ok) {
    let msg = (body && (body.error || body.message)) || `${res.status} ${res.statusText}`
    const details = body && Array.isArray(body.details) ? body.details : null
    if (details) {
      const detailStrings = details
        .map((d: unknown) => {
          if (typeof d === 'string') return d.trim() ? d.trim() : null
          if (d && typeof d === 'object') {
            const field = (d as any).field
            const message = (d as any).message
            if (typeof message === 'string' && message.trim()) {
              if (typeof field === 'string' && field.trim()) return `${field}: ${message}`
              return message
            }
          }
          return null
        })
        .filter((s: string | null): s is string => Boolean(s))
      const unique = Array.from(new Set(detailStrings))
      if (unique.length) {
        msg = `${msg}: ${unique.join(', ')}`
      }
    }
    throw new ApiError(msg, res.status, body)
  }
  return body as T
}

// Employees
export const EmployeesApi = {
  list(params: {
    q?: string
    take?: number
    skip?: number
    department?: string
    status?: string
    employmentType?: string
  } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.department) qp.set('department', params.department)
    if (params.status) qp.set('status', params.status)
    if (params.employmentType) qp.set('employmentType', params.employmentType)
    const qs = qp.toString()
    return request<{ items: Employee[]; total: number }>(`/api/employees${qs ? `?${qs}` : ''}`)
  },
  create(payload: Partial<Employee> & {
    firstName: string
    lastName: string
    email: string
    department?: string
    position: string
    employmentType: string
    joinDate: string
    status?: string
  }) {
    return request<Employee>(`/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  get(id: string) {
    return request<Employee>(`/api/employees/${encodeURIComponent(id)}`)
  },
  update(id: string, payload: Partial<Employee>) {
    return request<Employee>(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  listManageable() {
    return request<{ items: Employee[]; total: number }>(`/api/employees/manageable`)
  },
  checkCanManage(employeeId: string) {
    return request<{ canManage: boolean; reason?: string }>(`/api/employees/manageable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId }),
    })
  },
  getProjectMemberships(employeeId: string) {
    return request<{ items: EmployeeProjectMembership[] }>(`/api/employees/${encodeURIComponent(employeeId)}/projects`)
  },
  updateProjectMemberships(employeeId: string, memberships: { projectId: string; role?: string }[]) {
    return request<{ items: EmployeeProjectMembership[] }>(`/api/employees/${encodeURIComponent(employeeId)}/projects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberships }),
    })
  },
  getPermissions(employeeId: string) {
    return request<{
      actorId: string
      targetEmployeeId: string
      isEditingSelf: boolean
      isManager: boolean
      isSuperAdmin: boolean
      fieldPermissions: Record<string, { canEdit: boolean; permission: string; reason?: string }>
      editableFields: string[]
      readOnlyFields: string[]
      fieldGroups: Record<string, string[]>
    }>(`/api/employees/${encodeURIComponent(employeeId)}/permissions`)
  },
  getAuthorizedReporters(employeeId: string) {
    return request<{ items: { id: string; employeeId: string; firstName: string; lastName: string; position: string }[]; total: number }>(
      `/api/employees/${encodeURIComponent(employeeId)}/authorized-reporters`
    )
  },
}

// Policies
export const PoliciesApi = {
  list(params: { q?: string; take?: number; skip?: number; category?: string; region?: string; status?: string } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.category) qp.set('category', params.category)
    if (params.region) qp.set('region', params.region)
    if (params.status) qp.set('status', params.status)
    const qs = qp.toString()
    return request<{ items: Policy[]; total: number }>(`/api/policies${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<Policy>(`/api/policies/${encodeURIComponent(id)}`)
  },
  getWorkflowRecord(id: string) {
    return request<WorkflowRecordDTO>(`/api/policies/${encodeURIComponent(id)}?format=workflow`)
  },
  create(payload: Partial<Policy> & { title: string; category: string; region: string; status?: string }) {
    return request<Policy>(`/api/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<Policy> & { bumpVersion?: 'major' | 'minor' }) {
    return request<Policy>(`/api/policies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/policies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

export const PoliciesAdminApi = {
  consolidateConductCompanyWide() {
    return request<{
      canonicalPolicyId: string | null
      archivedPolicyIds: string[]
      acknowledgementsCopied: number
      updatedCanonical: boolean
      reason?: string
    }>(`/api/admin/policies/conduct/company-wide`, {
      method: 'POST',
    })
  },
}

// Dashboard
export type DashboardUser = {
  id: string
  firstName: string
  lastName: string
  department: string
  position: string
  avatar: string | null
}

export type DashboardDirectReport = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department: string
  position: string
  avatar: string | null
}

export type DashboardPendingReview = {
  id: string
  reviewType: string
  reviewPeriod: string
  reviewDate: string
  status: string
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
  }
}

export type DashboardStat = {
  label: string
  value: number
}

export type DashboardCurrentEmployee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  department?: string | null
  position: string
  avatar?: string | null
  status: string
  employmentType: string
  joinDate?: string | null
  reportsToId?: string | null
  reportsTo?: {
    id: string
    firstName: string
    lastName: string
  } | null
}

export type DashboardPendingLeaveRequest = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string | null
  status: string
  createdAt: string
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    avatar?: string | null
  }
}

export type DashboardLeaveApprovalHistory = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string | null
  status: string
  reviewedAt: string
  employee: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    avatar?: string | null
  }
}

export type DashboardUpcomingLeave = {
  id: string
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  employee: {
    id: string
    firstName: string
    lastName: string
    avatar?: string | null
  }
}

export type LeaveBalance = {
  leaveType: string
  year?: number
  allocated: number
  used: number
  pending: number
  available: number
}

export type DashboardData = {
  user: DashboardUser | null
  isManager: boolean
  currentEmployee: DashboardCurrentEmployee | null
  directReports: DashboardDirectReport[]
  notifications: Notification[]
  unreadNotificationCount: number
  pendingReviews: DashboardPendingReview[]
  pendingLeaveRequests: DashboardPendingLeaveRequest[]
  leaveApprovalHistory: DashboardLeaveApprovalHistory[]
  myLeaveBalance: LeaveBalance[]
  upcomingLeaves: DashboardUpcomingLeave[]
  stats: DashboardStat[]
}

export const DashboardApi = {
  get() {
    return request<DashboardData>(`/api/dashboard`)
  },
}

// Performance Reviews
export type PerformanceReview = {
  id: string
  employeeId: string
  employee?: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    department?: string
    position?: string
    email?: string
  }
  reviewType: string
  // Structured period data
  periodType?: string | null
  periodYear?: number | null
  // Legacy period string
  reviewPeriod: string
  reviewDate: string
  reviewerName: string
  roleTitle: string
  assignedReviewerId?: string | null
  assignedReviewer?: {
    id: string
    firstName: string
    lastName: string
    position?: string
  } | null
  overallRating: number
  qualityOfWork?: number | null
  productivity?: number | null
  communication?: number | null
  teamwork?: number | null
  initiative?: number | null
  attendance?: number | null
  strengths?: string | null
  areasToImprove?: string | null
  goals?: string | null
  comments?: string | null
  status: string
  // Workflow timestamps
  startedAt?: string | null
  submittedAt?: string | null
  // HR review stage
  hrReviewedAt?: string | null
  hrReviewedById?: string | null
  hrReviewNotes?: string | null
  hrApproved?: boolean | null
  // Super Admin stage
  superAdminApprovedAt?: string | null
  superAdminApprovedById?: string | null
  superAdminNotes?: string | null
  superAdminApproved?: boolean | null
  acknowledgedAt?: string | null
  // Quarterly review fields
  quarterlyCycleId?: string | null
  deadline?: string | null
  escalatedToHR?: boolean
  remindersSent?: number
  createdAt?: string
  updatedAt?: string
}

export type CreatePerformanceReviewInput = {
  employeeId: string
  reviewType: string
  periodType: string
  periodYear: number
  reviewDate: string
  roleTitle?: string
  assignedReviewerId?: string
  reviewerName?: string
  overallRating: number
  qualityOfWork?: number | null
  productivity?: number | null
  communication?: number | null
  teamwork?: number | null
  initiative?: number | null
  attendance?: number | null
  ratingPrecision?: number | null
  ratingTransparency?: number | null
  ratingReliability?: number | null
  ratingInitiative?: number | null
  selfRatingPrecision?: number | null
  selfRatingTransparency?: number | null
  selfRatingReliability?: number | null
  selfRatingInitiative?: number | null
  lowHonestyJustification?: string | null
  lowIntegrityJustification?: string | null
  strengths?: string | null
  areasToImprove?: string | null
  goals?: string | null
  comments?: string | null
  status?: string
}

export type UpdatePerformanceReviewInput = {
  reviewType?: string
  periodType?: string
  periodYear?: number
  reviewDate?: string
  reviewerName?: string
  roleTitle?: string
  overallRating?: number
  qualityOfWork?: number | null
  productivity?: number | null
  communication?: number | null
  teamwork?: number | null
  initiative?: number | null
  attendance?: number | null
  ratingPrecision?: number | null
  ratingTransparency?: number | null
  ratingReliability?: number | null
  ratingInitiative?: number | null
  selfRatingPrecision?: number | null
  selfRatingTransparency?: number | null
  selfRatingReliability?: number | null
  selfRatingInitiative?: number | null
  lowHonestyJustification?: string | null
  lowIntegrityJustification?: string | null
  strengths?: string | null
  areasToImprove?: string | null
  goals?: string | null
  comments?: string | null
  status?: string
}

export const PerformanceReviewsApi = {
  list(params: {
    q?: string
    take?: number
    skip?: number
    employeeId?: string
    reviewType?: string
    status?: string
  } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.employeeId) qp.set('employeeId', params.employeeId)
    if (params.reviewType) qp.set('reviewType', params.reviewType)
    if (params.status) qp.set('status', params.status)
    const qs = qp.toString()
    return request<{ items: PerformanceReview[]; total: number }>(`/api/performance-reviews${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<PerformanceReview>(`/api/performance-reviews/${encodeURIComponent(id)}`)
  },
  getWorkflowRecord(id: string) {
    return request<WorkflowRecordDTO>(`/api/performance-reviews/${encodeURIComponent(id)}?format=workflow`)
  },
  create(payload: CreatePerformanceReviewInput) {
    return request<PerformanceReview>(`/api/performance-reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: UpdatePerformanceReviewInput) {
    return request<PerformanceReview>(`/api/performance-reviews/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/performance-reviews/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  // Workflow methods
  start(id: string) {
    return request<PerformanceReview & { message: string }>(`/api/performance-reviews/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    })
  },
  submit(id: string) {
    return request<PerformanceReview & { message: string }>(`/api/performance-reviews/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
    })
  },
  acknowledge(id: string) {
    return request<PerformanceReview & { message: string }>(`/api/performance-reviews/${encodeURIComponent(id)}/acknowledge`, {
      method: 'POST',
    })
  },
}

// Disciplinary Actions
export type DisciplinaryAction = {
  id: string
  employeeId: string
  caseId?: string | null
  employee?: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    department?: string
    position?: string
    email?: string
  }
  violationType: string
  violationReason: string
  valuesBreached: string[]
  severity: string
  incidentDate: string
  reportedDate: string
  reportedBy: string
  createdById?: string | null
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  } | null
  description: string
  witnesses?: string | null
  evidence?: string | null
  actionTaken: string
  actionDate?: string | null
  actionDetails?: string | null
  followUpDate?: string | null
  followUpNotes?: string | null
  status: string
  resolution?: string | null
  // Approval chain tracking
  hrReviewedAt?: string | null
  hrReviewedById?: string | null
  hrReviewNotes?: string | null
  hrApproved?: boolean | null
  superAdminApprovedAt?: string | null
  superAdminApprovedById?: string | null
  superAdminNotes?: string | null
  superAdminApproved?: boolean | null
  // Appeal tracking
  appealReason?: string | null
  appealedAt?: string | null
  appealStatus?: string | null
  appealResolution?: string | null
  appealResolvedAt?: string | null
  appealResolvedById?: string | null
  // Acknowledgment tracking
  employeeAcknowledged?: boolean
  employeeAcknowledgedAt?: string | null
  managerAcknowledged?: boolean
  managerAcknowledgedAt?: string | null
  managerAcknowledgerId?: string | null
  createdAt?: string
  updatedAt?: string
}

export const DisciplinaryActionsApi = {
  list(params: {
    q?: string
    take?: number
    skip?: number
    employeeId?: string
    violationType?: string
    severity?: string
    status?: string
  } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.employeeId) qp.set('employeeId', params.employeeId)
    if (params.violationType) qp.set('violationType', params.violationType)
    if (params.severity) qp.set('severity', params.severity)
    if (params.status) qp.set('status', params.status)
    const qs = qp.toString()
    return request<{ items: DisciplinaryAction[]; total: number }>(`/api/disciplinary-actions${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<DisciplinaryAction>(`/api/disciplinary-actions/${encodeURIComponent(id)}`)
  },
  getWorkflowRecord(id: string) {
    return request<WorkflowRecordDTO>(`/api/disciplinary-actions/${encodeURIComponent(id)}?format=workflow`)
  },
  create(payload: {
    employeeId: string
    violationType: string
    violationReason: string
    valuesBreached: string[]
    severity: string
    incidentDate: string
    reportedBy: string
    description: string
    witnesses?: string | null
    evidence?: string | null
    actionTaken: string
  }) {
    return request<DisciplinaryAction>(`/api/disciplinary-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<Omit<DisciplinaryAction, 'id' | 'employeeId' | 'employee' | 'reportedDate' | 'createdAt' | 'updatedAt'>>) {
    return request<DisciplinaryAction>(`/api/disciplinary-actions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/disciplinary-actions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// HR Calendar Events
export type HRCalendarEvent = {
  id: string
  title: string
  description?: string | null
  eventType: string
  startDate: string
  endDate?: string | null
  allDay: boolean
  employeeId?: string | null
  relatedRecordId?: string | null
  relatedRecordType?: string | null
  googleEventId?: string | null
  createdAt?: string
  updatedAt?: string
}

export const HRCalendarApi = {
  list(params: {
    q?: string
    take?: number
    skip?: number
    eventType?: string
    employeeId?: string
    startDate?: string
    endDate?: string
  } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.eventType) qp.set('eventType', params.eventType)
    if (params.employeeId) qp.set('employeeId', params.employeeId)
    if (params.startDate) qp.set('startDate', params.startDate)
    if (params.endDate) qp.set('endDate', params.endDate)
    const qs = qp.toString()
    return request<{ items: HRCalendarEvent[]; total: number }>(`/api/hr-calendar${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<HRCalendarEvent>(`/api/hr-calendar/${encodeURIComponent(id)}`)
  },
  create(payload: Omit<HRCalendarEvent, 'id' | 'googleEventId' | 'createdAt' | 'updatedAt'>) {
    return request<HRCalendarEvent>(`/api/hr-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<Omit<HRCalendarEvent, 'id' | 'googleEventId' | 'createdAt' | 'updatedAt'>>) {
    return request<HRCalendarEvent>(`/api/hr-calendar/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/hr-calendar/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Notifications
export type Notification = {
  id: string
  type: string
  title: string
  message: string
  link?: string | null
  relatedId?: string | null
  relatedType?: string | null
  employeeId?: string | null
  isRead: boolean
  createdAt: string
}

export const NotificationsApi = {
  list(params: { unreadOnly?: boolean; limit?: number } = {}) {
    const qp = new URLSearchParams()
    if (params.unreadOnly) qp.set('unreadOnly', 'true')
    if (params.limit != null) qp.set('limit', String(params.limit))
    const qs = qp.toString()
    return request<{ items: Notification[]; unreadCount: number }>(`/api/notifications${qs ? `?${qs}` : ''}`)
  },
  markAsRead(ids: string[]) {
    return request<{ ok: boolean }>(`/api/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  },
  markAllAsRead() {
    return request<{ ok: boolean }>(`/api/notifications`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
  },
}

// Hierarchy
export type HierarchyEmployee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department: string
  position: string
  employmentType: string
  avatar: string | null
  reportsToId: string | null
  status: string
  phone?: string | null
  city?: string | null
  country?: string | null
  joinDate?: string | null
  projects?: string[]
}

export const HierarchyApi = {
  getDirectReports() {
    return request<{ items: HierarchyEmployee[]; currentEmployeeId: string | null }>(`/api/hierarchy?type=direct-reports`)
  },
  getManagerChain() {
    return request<{ items: HierarchyEmployee[]; currentEmployeeId: string | null }>(`/api/hierarchy?type=manager-chain`)
  },
  getFull() {
    return request<{
      items: HierarchyEmployee[]
      currentEmployeeId: string | null
      managerChainIds: string[]
      directReportIds: string[]
    }>(`/api/hierarchy?type=full`)
  },
}

// Leave Requests
export type LeaveRequest = {
  id: string
  employeeId: string
  employee?: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    avatar: string | null
    reportsTo?: {
      id: string
      firstName: string
      lastName: string
    } | null
  }
  leaveType: string
  startDate: string
  endDate: string
  totalDays: number
  reason?: string | null
  status: string
  // Manager approval (Level 1)
  managerApprovedById?: string | null
  managerApprovedAt?: string | null
  managerNotes?: string | null
  // HR approval (Level 2)
  hrApprovedById?: string | null
  hrApprovedAt?: string | null
  hrNotes?: string | null
  // Super Admin approval (Level 3)
  superAdminApprovedById?: string | null
  superAdminApprovedAt?: string | null
  superAdminNotes?: string | null
  // Approvers (populated by API)
  managerApprovedBy?: { id: string; firstName: string; lastName: string } | null
  hrApprovedBy?: { id: string; firstName: string; lastName: string } | null
  superAdminApprovedBy?: { id: string; firstName: string; lastName: string } | null
  // Permissions (populated by API)
  permissions?: {
    canCancel: boolean
    canManagerApprove: boolean
    canHRApprove: boolean
    canSuperAdminApprove: boolean
  }
  // Legacy fields
  reviewedById?: string | null
  reviewedBy?: {
    id: string
    firstName: string
    lastName: string
  } | null
  reviewedAt?: string | null
  reviewNotes?: string | null
  createdAt: string
  updatedAt: string
}

export const LeavesApi = {
  list(params: {
    employeeId?: string
    status?: string
    startDate?: string
    endDate?: string
    take?: number
    skip?: number
  } = {}) {
    const qp = new URLSearchParams()
    if (params.employeeId) qp.set('employeeId', params.employeeId)
    if (params.status) qp.set('status', params.status)
    if (params.startDate) qp.set('startDate', params.startDate)
    if (params.endDate) qp.set('endDate', params.endDate)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    const qs = qp.toString()
    return request<{ items: LeaveRequest[]; total: number }>(`/api/leaves${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`)
  },
  getWorkflowRecord(id: string) {
    return request<WorkflowRecordDTO>(`/api/leaves/${encodeURIComponent(id)}?format=workflow`)
  },
  create(payload: {
    employeeId: string
    leaveType: string
    startDate: string
    endDate: string
    totalDays: number
    reason?: string
  }) {
    return request<LeaveRequest>(`/api/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{
    status: string
    reviewNotes?: string
  }>) {
    return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/leaves/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  managerApprove(id: string, payload: { approved: boolean; notes?: string }) {
    return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}/manager-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  hrApprove(id: string, payload: { approved: boolean; notes?: string }) {
    return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}/hr-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  superAdminApprove(id: string, payload: { approved: boolean; notes?: string }) {
    return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}/super-admin-approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  getBalance(params: { employeeId: string; year?: number } = { employeeId: '' }) {
    const qp = new URLSearchParams()
    if (params.employeeId) qp.set('employeeId', params.employeeId)
    if (params.year != null) qp.set('year', String(params.year))
    const qs = qp.toString()
    return request<{ balances: LeaveBalance[] }>(`/api/leaves/balance${qs ? `?${qs}` : ''}`)
  },
}

// Departments
export type DepartmentHead = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  position: string
  employmentType: string
  avatar?: string | null
}

export type DepartmentEmployee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  position: string
  employmentType: string
  avatar?: string | null
}

export type Department = {
  id: string
  name: string
  code?: string | null
  kpi?: string | null
  headId?: string | null
  head?: DepartmentHead | null
  parentId?: string | null
  parent?: { id: string; name: string } | null
  children?: { id: string; name: string }[]
  employees?: DepartmentEmployee[]
  _count?: {
    employees: number
    children?: number
  }
}

export const DepartmentsApi = {
  list() {
    return request<{ items: Department[] }>('/api/departments')
  },
  get(id: string) {
    return request<Department>(`/api/departments/${encodeURIComponent(id)}`)
  },
  getHierarchy() {
    return request<{ items: Department[] }>('/api/departments/hierarchy')
  },
  create(payload: { name: string; code?: string; kpi?: string; headId?: string; parentId?: string }) {
    return request<Department>('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{ name: string; code: string; kpi: string; headId: string; parentId: string }>) {
    return request<Department>(`/api/departments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ success: boolean }>(`/api/departments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Projects
export type ProjectLead = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  position: string
  avatar?: string | null
}

export type ProjectMember = {
  id: string
  role?: string | null
  employee: {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    email: string
    position: string
    department: string
    avatar?: string | null
  }
}

export type Project = {
  id: string
  name: string
  code?: string | null
  description?: string | null
  status: string
  leadId?: string | null
  lead?: ProjectLead | null
  members?: ProjectMember[]
  startDate?: string | null
  endDate?: string | null
  _count?: {
    members: number
  }
}

export const ProjectsApi = {
  list() {
    return request<{ items: Project[] }>('/api/projects')
  },
  get(id: string) {
    return request<Project>(`/api/projects/${encodeURIComponent(id)}`)
  },
  getHierarchy() {
    return request<{ items: Project[] }>('/api/projects/hierarchy')
  },
  create(payload: { name: string; code?: string; description?: string; status?: string; leadId?: string; startDate?: string; endDate?: string }) {
    return request<Project>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{ name: string; code: string; description: string; status: string; leadId: string; startDate: string; endDate: string }>) {
    return request<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ success: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Access Management (Admin)
export type EmployeeAccess = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department?: string
  position: string
  avatar?: string | null
  isSuperAdmin: boolean
  permissionLevel: number
  roles: { id: string; name: string }[]
  isHR: boolean
  hrRoleId: string | null
}

export const AdminApi = {
  getAccessList() {
    return request<{ items: EmployeeAccess[]; total: number; currentUserId: string }>('/api/admin/access')
  },
  updateAccess(employeeId: string, payload: { isSuperAdmin?: boolean; isHR?: boolean }) {
    return request<{ success: boolean; employee: EmployeeAccess }>(`/api/admin/access/${encodeURIComponent(employeeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}

// Me
export type Me = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  avatar: string | null
  isSuperAdmin: boolean
  isHR: boolean
}

export const MeApi = {
  get() {
    return request<Me>('/api/me')
  },
}

// Work Items
export type WorkItem = WorkItemDTO
export type CompletedWorkItem = CompletedWorkItemDTO

let workItemsCache: { at: number; value: WorkItemsResponse } | null = null
let completedWorkItemsCache: { at: number; value: CompletedWorkItemsResponse } | null = null
const WORK_ITEMS_CACHE_TTL_MS = 10_000

export const WorkItemsApi = {
  async list(options?: { force?: boolean }) {
    const force = options?.force ?? false
    const now = Date.now()
    if (!force && workItemsCache && now - workItemsCache.at < WORK_ITEMS_CACHE_TTL_MS) {
      return workItemsCache.value
    }

    const value = await request<WorkItemsResponse>('/api/work-items')
    workItemsCache = { at: now, value }
    return value
  },
  async listCompleted(options?: { force?: boolean }) {
    const force = options?.force ?? false
    const now = Date.now()
    if (!force && completedWorkItemsCache && now - completedWorkItemsCache.at < WORK_ITEMS_CACHE_TTL_MS) {
      return completedWorkItemsCache.value
    }

    const value = await request<CompletedWorkItemsResponse>('/api/work-items/completed')
    completedWorkItemsCache = { at: now, value }
    return value
  },
  invalidate() {
    workItemsCache = null
    completedWorkItemsCache = null
  },
}

// Policy Acknowledgements
export type PolicyAcknowledgementStatus = {
  policyId: string
  policyVersion: string
  policyStatus: string
  isApplicable: boolean
  isAcknowledged: boolean
  acknowledgedAt: string | null
}

export const PolicyAcknowledgementsApi = {
  get(policyId: string) {
    return request<PolicyAcknowledgementStatus>(`/api/policies/${encodeURIComponent(policyId)}/acknowledgement`)
  },
  acknowledge(policyId: string) {
    return request<{ id: string; policyId: string; employeeId: string; policyVersion: string; acknowledgedAt: string }>(
      `/api/policies/${encodeURIComponent(policyId)}/acknowledgement`,
      { method: 'POST' }
    )
  },
}

// Tasks
export type TaskPerson = {
  id: string
  firstName: string
  lastName: string
  avatar?: string | null
}

export type TaskCaseRef = {
  id: string
  caseNumber: number
  title: string
}

export type Task = {
  id: string
  title: string
  description?: string | null
  actionUrl?: string | null
  status: string
  category: string
  dueDate?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
  createdById: string
  assignedToId?: string | null
  subjectEmployeeId?: string | null
  caseId?: string | null
  createdBy?: TaskPerson
  assignedTo?: TaskPerson | null
  subjectEmployee?: TaskPerson | null
  case?: TaskCaseRef | null
}

export const TasksApi = {
  list(params: {
    scope?: 'mine' | 'all'
    take?: number
    skip?: number
    status?: string
    category?: string
    assignedToId?: string
    subjectEmployeeId?: string
    caseId?: string
  } = {}) {
    const qp = new URLSearchParams()
    if (params.scope) qp.set('scope', params.scope)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.status) qp.set('status', params.status)
    if (params.category) qp.set('category', params.category)
    if (params.assignedToId) qp.set('assignedToId', params.assignedToId)
    if (params.subjectEmployeeId) qp.set('subjectEmployeeId', params.subjectEmployeeId)
    if (params.caseId) qp.set('caseId', params.caseId)
    const qs = qp.toString()
    return request<{ items: Task[]; total: number }>(`/api/tasks${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<Task>(`/api/tasks/${encodeURIComponent(id)}`)
  },
  create(payload: {
    title: string
    description?: string | null
    actionUrl?: string | null
    category?: string
    dueDate?: string | null
    assignedToId?: string | null
    subjectEmployeeId?: string | null
    caseId?: string | null
  }) {
    return request<Task>(`/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{
    title: string
    description: string | null
    status: string
    category: string
    dueDate: string | null
    assignedToId: string | null
    subjectEmployeeId: string | null
  }>) {
    return request<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Employee Timeline
export type TimelineEvent = {
  id: string
  type: string
  title: string
  description: string | null
  occurredAt: string
  href: string | null
}

export const EmployeeTimelineApi = {
  get(employeeId: string, params: { take?: number } = {}) {
    const qp = new URLSearchParams()
    if (params.take != null) qp.set('take', String(params.take))
    const qs = qp.toString()
    return request<{ items: TimelineEvent[]; total: number }>(
      `/api/employees/${encodeURIComponent(employeeId)}/timeline${qs ? `?${qs}` : ''}`
    )
  },
}

// Uploads (S3 presign + finalize)
export type UploadTarget = { type: 'EMPLOYEE' | 'CASE'; id: string }
export type UploadVisibility = 'HR_ONLY' | 'EMPLOYEE_AND_HR' | 'INTERNAL_HR'

export const UploadsApi = {
  presign(payload: { filename: string; contentType: string; size: number; target: UploadTarget; visibility?: UploadVisibility }) {
    return request<{ putUrl: string; key: string }>('/api/uploads/presign', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  finalize(payload: { key: string; filename: string; contentType: string; size: number; target: UploadTarget; visibility?: UploadVisibility; title?: string | null }) {
    return request<any>('/api/uploads/finalize', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
}

// Employee Files (document vault)
export type EmployeeFile = {
  id: string
  title: string
  fileName?: string | null
  contentType?: string | null
  size?: number | null
  visibility: 'HR_ONLY' | 'EMPLOYEE_AND_HR'
  uploadedAt: string
  uploadedBy?: { id: string; firstName: string; lastName: string } | null
}

export const EmployeeFilesApi = {
  list(employeeId: string) {
    return request<{ items: EmployeeFile[]; total: number }>(`/api/employees/${encodeURIComponent(employeeId)}/files`)
  },
  getDownloadUrl(employeeId: string, fileId: string) {
    return request<{ url: string }>(
      `/api/employees/${encodeURIComponent(employeeId)}/files/${encodeURIComponent(fileId)}/download`
    )
  },
}

// Passwords
export type PasswordDepartment = 'OPS' | 'SALES_MARKETING' | 'LEGAL' | 'HR' | 'FINANCE'

export type Password = {
  id: string
  title: string
  username?: string | null
  password: string
  url?: string | null
  department: PasswordDepartment
  notes?: string | null
  createdBy?: { id: string; firstName: string; lastName: string; email: string } | null
  createdAt: string
  updatedAt: string
}

export const PasswordsApi = {
  list(params: { q?: string; take?: number; skip?: number; department?: PasswordDepartment } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.department) qp.set('department', params.department)
    const qs = qp.toString()
    return request<{ items: Password[]; total: number; allowedDepartments: PasswordDepartment[] }>(
      `/api/passwords${qs ? `?${qs}` : ''}`
    )
  },
  get(id: string) {
    return request<Password>(`/api/passwords/${encodeURIComponent(id)}`)
  },
  create(payload: {
    title: string
    username?: string | null
    password: string
    url?: string | null
    department?: PasswordDepartment
    notes?: string | null
  }) {
    return request<Password>(`/api/passwords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{
    title: string
    username: string | null
    password: string
    url: string | null
    department: PasswordDepartment
    notes: string | null
  }>) {
    return request<Password>(`/api/passwords/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/passwords/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Credit Cards
export type CreditCardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'DISCOVER' | 'OTHER'

export type CreditCard = {
  id: string
  title: string
  cardholderName?: string | null
  brand: CreditCardBrand
  cardNumber?: string | null
  last4: string
  cvv?: string | null
  expMonth: number
  expYear: number
  department: PasswordDepartment
  url?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export const CreditCardsApi = {
  list(params: { q?: string; take?: number; skip?: number; department?: PasswordDepartment } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.department) qp.set('department', params.department)
    const qs = qp.toString()
    return request<{ items: CreditCard[]; total: number; allowedDepartments: PasswordDepartment[] }>(
      `/api/credit-cards${qs ? `?${qs}` : ''}`
    )
  },
  get(id: string) {
    return request<CreditCard>(`/api/credit-cards/${encodeURIComponent(id)}`)
  },
  create(payload: {
    title: string
    cardholderName?: string | null
    brand: CreditCardBrand
    cardNumber?: string | null
    last4?: string
    cvv?: string | null
    expMonth: number
    expYear: number
    department?: PasswordDepartment
    url?: string | null
    notes?: string | null
  }) {
    return request<CreditCard>(`/api/credit-cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{
    title: string
    cardholderName: string | null
    brand: CreditCardBrand
    cardNumber: string | null
    last4: string
    cvv: string | null
    expMonth: number
    expYear: number
    department: PasswordDepartment
    url: string | null
    notes: string | null
  }>) {
    return request<CreditCard>(`/api/credit-cards/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/credit-cards/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

// Contractors
export type ContractorStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'TERMINATED'

export type Contractor = {
  id: string
  name: string
  company?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  department?: string | null
  hourlyRate?: number | null
  currency: string
  contractStart?: string | null
  contractEnd?: string | null
  status: ContractorStatus
  address?: string | null
  city?: string | null
  country?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export const ContractorsApi = {
  list(params: { q?: string; take?: number; skip?: number; status?: ContractorStatus } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.status) qp.set('status', params.status)
    const qs = qp.toString()
    return request<{ items: Contractor[]; total: number }>(`/api/contractors${qs ? `?${qs}` : ''}`)
  },
  get(id: string) {
    return request<Contractor>(`/api/contractors/${encodeURIComponent(id)}`)
  },
  create(payload: {
    name: string
    company?: string | null
    email?: string | null
    phone?: string | null
    role?: string | null
    department?: string | null
    hourlyRate?: number | null
    currency?: string
    contractStart?: string | null
    contractEnd?: string | null
    status?: ContractorStatus
    address?: string | null
    city?: string | null
    country?: string | null
    notes?: string | null
  }) {
    return request<Contractor>(`/api/contractors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  update(id: string, payload: Partial<{
    name: string
    company: string | null
    email: string | null
    phone: string | null
    role: string | null
    department: string | null
    hourlyRate: number | null
    currency: string
    contractStart: string | null
    contractEnd: string | null
    status: ContractorStatus
    address: string | null
    city: string | null
    country: string | null
    notes: string | null
  }>) {
    return request<Contractor>(`/api/contractors/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
  delete(id: string) {
    return request<{ ok: boolean }>(`/api/contractors/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

export type HiringCandidateInterview = {
  id: string
  title: string
  interviewType: string
  status: string
  startAt: string
  endAt: string
  timeZone: string
  meetingLink?: string | null
  googleEventId?: string | null
  googleHtmlLink?: string | null
}

export type HiringCandidate = {
  id: string
  fullName: string
  email?: string | null
  phone?: string | null
  role?: string | null
  status: string
  notes?: string | null
  createdAt: string
  updatedAt: string
  interviews?: HiringCandidateInterview[]
}

export type HiringInterviewInterviewer = {
  id: string
  interviewId: string
  employeeId: string
  employee: Pick<Employee, 'id' | 'employeeId' | 'firstName' | 'lastName' | 'email' | 'avatar'>
}

export type HiringInterview = {
  id: string
  candidateId: string
  title: string
  interviewType: string
  status: string
  startAt: string
  endAt: string
  timeZone: string
  location?: string | null
  meetingLink?: string | null
  googleEventId?: string | null
  googleHtmlLink?: string | null
  notes?: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  candidate: HiringCandidate
  interviewers: HiringInterviewInterviewer[]
}

export const HiringCandidatesApi = {
  list(params: { q?: string; take?: number; skip?: number; status?: string } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.status) qp.set('status', params.status)
    const qs = qp.toString()
    return request<{ items: HiringCandidate[]; total: number }>(`/api/hiring/candidates${qs ? `?${qs}` : ''}`)
  },
  create(payload: {
    fullName: string
    email?: string | null
    phone?: string | null
    role?: string | null
    status?: string
    notes?: string | null
  }) {
    return request<HiringCandidate>(`/api/hiring/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}

export const HiringInterviewsApi = {
  list(params: { q?: string; take?: number; skip?: number; status?: string; upcoming?: boolean } = {}) {
    const qp = new URLSearchParams()
    if (params.q) qp.set('q', params.q)
    if (params.take != null) qp.set('take', String(params.take))
    if (params.skip != null) qp.set('skip', String(params.skip))
    if (params.status) qp.set('status', params.status)
    if (params.upcoming != null) qp.set('upcoming', params.upcoming ? 'true' : 'false')
    const qs = qp.toString()
    return request<{ items: HiringInterview[]; total: number }>(`/api/hiring/interviews${qs ? `?${qs}` : ''}`)
  },
  schedule(payload: {
    candidateFullName: string
    candidateEmail: string
    candidatePhone?: string | null
    candidateRole?: string | null
    title: string
    interviewType?: string
    startAt: string
    durationMinutes: number
    timeZone: string
    location?: string | null
    notes?: string | null
    interviewerEmployeeIds: string[]
  }) {
    return request<HiringInterview>(`/api/hiring/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  },
}
