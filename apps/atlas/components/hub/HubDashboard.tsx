'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  EmployeesApi,
  LeavesApi,
  WorkItemsApi,
  DashboardApi,
  PerformanceReviewsApi,
  DisciplinaryActionsApi,
  type Employee,
  type LeaveBalance,
  type DashboardData,
  type PerformanceReview,
  type DisciplinaryAction,
} from '@/lib/api-client'
import type { WorkItemsResponse, WorkItemDTO, CompletedWorkItemsResponse } from '@/lib/contracts/work-items'
import type { ActionId } from '@/lib/contracts/action-ids'
import { executeAction } from '@/lib/actions/execute-action'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getLeaveTypeLabel } from '@/components/employee/profile/utils'
import { InboxItemList } from '@/components/inbox/InboxItemList'
import { CompletedItemList } from '@/components/inbox/CompletedItemList'
import { InboxActionPane } from '@/components/inbox/InboxActionPane'
import { CompletedActionPane } from '@/components/inbox/CompletedActionPane'
import { CreateRequestModal } from '@/components/inbox/CreateRequestModal'

type HubTab = 'inbox' | 'overview'
type InboxSubTab = 'pending' | 'completed'

type HubDashboardProps = {
  employeeId: string
}

// ============================================================================
// Shared Components
// ============================================================================

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-soft'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      )}
    >
      {children}
      {count !== undefined && count > 0 ? (
        <span className={cn(
          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
          active ? 'bg-muted text-foreground' : 'bg-background/70 text-muted-foreground'
        )}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

function SubTabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-soft'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      )}
    >
      {children}
      {count !== undefined && count > 0 ? (
        <span className={cn(
          'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
          active ? 'bg-muted text-foreground' : 'bg-background/70 text-muted-foreground'
        )}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em]">
        {children}
      </h2>
      {action}
    </div>
  )
}

// ============================================================================
// Profile Section
// ============================================================================

function ProfileCard({
  employee,
  editingField,
  editValue,
  saving,
  onStartEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  employee: Employee
  editingField: 'phone' | null
  editValue: string
  saving: boolean
  onStartEdit: (field: 'phone', value: string) => void
  onEditChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const joinDate = employee.joinDate ? new Date(employee.joinDate) : null
  const tenure = joinDate ? Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365)) : null

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground text-base font-semibold">
          {employee.firstName[0]}
          {employee.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-foreground">
                {employee.firstName} {employee.lastName}
              </h3>
              <p className="text-sm text-muted-foreground">{employee.position}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{employee.department}</span>
                {tenure !== null && tenure >= 0 ? (
                  <>
                    <span>·</span>
                    <span>{tenure === 0 ? '< 1 year' : `${tenure}y tenure`}</span>
                  </>
                ) : null}
              </div>
            </div>
            <Button
              href={`/employees/${employee.id}/edit`}
              variant="outline"
              size="icon"
              aria-label="Edit full profile"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Button>
          </div>

          {/* Editable fields */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Phone */}
            <div className="group">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Phone</label>
              {editingField === 'phone' ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <input
                    type="tel"
                    value={editValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                  />
                  <button
                    onClick={onSave}
                    disabled={saving}
                    className="rounded-md p-1 text-success-700 hover:bg-success-50 disabled:opacity-50 dark:text-success-300 dark:hover:bg-success-900/20"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={onCancel}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onStartEdit('phone', employee.phone ? employee.phone : '')}
                  className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground hover:text-accent transition-colors"
                >
                  <span>{employee.phone ? employee.phone : 'Add phone'}</span>
                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Email - read-only */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
              <p className="mt-0.5 text-sm text-foreground truncate">
                {employee.email}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Time Off Section
// ============================================================================

function PTOHeroCard({ balance }: { balance: LeaveBalance }) {
  const available = balance.available
  const total = balance.allocated
  const used = total - available
  const percentage = total > 0 ? (available / total) * 100 : 0
  const isLow = total > 0 && available <= Math.ceil(total * 0.2) && available > 0
  const isEmpty = available === 0

  const size = 88
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="flex items-center gap-5 rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="relative flex-shrink-0">
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn(
              'transition-all duration-700',
              isEmpty ? 'text-muted-foreground' : isLow ? 'text-warning-500' : 'text-accent'
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(
            'text-2xl font-semibold tabular-nums',
            isEmpty ? 'text-muted-foreground' : isLow ? 'text-warning-600 dark:text-warning-400' : 'text-foreground'
          )}>
            {available}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">days</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground">
          PTO Available
        </h4>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{used}</span> used
          </span>
          <span>
            <span className="font-medium text-foreground">{total}</span> total
          </span>
          {balance.pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-[11px] font-semibold text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
              <span className="h-1.5 w-1.5 rounded-full bg-warning-500" />
              {balance.pending} pending
            </span>
          )}
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              isEmpty ? 'bg-muted-foreground/40' : isLow ? 'bg-warning-500' : 'bg-accent'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function CompactLeaveCard({ balance }: { balance: LeaveBalance }) {
  const available = balance.available
  const total = balance.allocated
  const percentage = total > 0 ? (available / total) * 100 : 0
  const isLow = total > 0 && available <= Math.ceil(total * 0.2) && available > 0
  const isEmpty = available === 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <div className={cn(
        'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-semibold text-sm tabular-nums',
        isEmpty
          ? 'bg-muted text-muted-foreground'
          : isLow
            ? 'bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300'
            : 'bg-muted text-foreground'
      )}>
        {available}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground truncate">
            {getLeaveTypeLabel(balance.leaveType)}
          </h4>
          {balance.pending > 0 && (
            <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
              {balance.pending}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isEmpty ? 'bg-muted-foreground/40' : isLow ? 'bg-warning-500' : 'bg-accent/70'
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">{total}</span>
        </div>
      </div>
    </div>
  )
}

function TimeOffSection({ balances }: { balances: LeaveBalance[] }) {
  const filtered = balances.filter(b => b.leaveType !== 'UNPAID')
  const ptoBalance = filtered.find(b => b.leaveType === 'PTO')
  const otherBalances = filtered.filter(b => b.leaveType !== 'PTO')

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">No leave balances configured</p>
        <p className="text-xs text-muted-foreground mt-1">Contact HR to set up your leave allocation</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* PTO Hero Card */}
      {ptoBalance && <PTOHeroCard balance={ptoBalance} />}

      {/* Other Leave Types in compact row */}
      {otherBalances.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {otherBalances.map((balance) => (
            <CompactLeaveCard key={balance.leaveType} balance={balance} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Performance Section (Reviews + Violations combined)
// ============================================================================

function PerformanceSection({
  reviews,
  violations,
}: {
  reviews: PerformanceReview[]
  violations: DisciplinaryAction[]
}) {
  const hasReviews = reviews.length > 0
  const hasViolations = violations.length > 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Reviews */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">My Reviews</h3>
          {hasReviews && (
            <Link href="/performance/reviews" className="text-xs font-semibold text-accent hover:underline">
              View all
            </Link>
          )}
        </div>
        {hasReviews ? (
          <div className="space-y-2">
            {reviews.slice(0, 3).map((r) => (
              <Link
                key={r.id}
                href={`/performance/reviews/${r.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.reviewType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.reviewPeriod}</p>
                </div>
                <span className={cn(
                  'ml-2 px-2 py-0.5 rounded text-xs font-medium',
                  r.status === 'COMPLETED' || r.status === 'ACKNOWLEDGED'
                    ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {r.status === 'COMPLETED' || r.status === 'ACKNOWLEDGED' ? `${r.overallRating}/5` : r.status}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground">No reviews yet</p>
          </div>
        )}
      </div>

      {/* Violations */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Disciplinary Record</h3>
          {hasViolations && (
            <Link href="/performance/violations" className="text-xs font-semibold text-accent hover:underline">
              View all
            </Link>
          )}
        </div>
        {hasViolations ? (
          <div className="space-y-2">
            {violations.slice(0, 3).map((v) => (
              <Link
                key={v.id}
                href={`/performance/violations/${v.id}`}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-danger-50 hover:bg-danger-100 transition-colors dark:bg-danger-900/15 dark:hover:bg-danger-900/25"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {v.violationType.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(v.incidentDate).toLocaleDateString()}
                  </p>
                </div>
                <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300">
                  {v.severity.replace(/_/g, ' ')}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success-50 dark:bg-success-900/15">
            <div className="w-8 h-8 rounded-lg bg-success-100 dark:bg-success-900/30 flex items-center justify-center">
              <svg className="w-4 h-4 text-success-700 dark:text-success-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-success-800 dark:text-success-200">Clean record</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Team Section
// ============================================================================

function TeamSection({ dashboardData }: { dashboardData: DashboardData }) {
  const hasDirectReports = dashboardData.directReports && dashboardData.directReports.length > 0
  const hasPendingReviews = dashboardData.pendingReviews && dashboardData.pendingReviews.length > 0
  const hasPendingLeave = dashboardData.pendingLeaveRequests && dashboardData.pendingLeaveRequests.length > 0
  const hasUpcomingLeave = dashboardData.upcomingLeaves && dashboardData.upcomingLeaves.length > 0

  if (!hasDirectReports && !hasPendingReviews && !hasPendingLeave && !hasUpcomingLeave) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Direct Reports */}
      {hasDirectReports && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Direct Reports ({dashboardData.directReports.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboardData.directReports.slice(0, 8).map((report) => (
              <Link
                key={report.id}
                href={`/employees/${report.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
                  {report.firstName[0]}{report.lastName[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {report.firstName} {report.lastName}
                  </p>
                </div>
              </Link>
            ))}
            {dashboardData.directReports.length > 8 && (
              <Link
                href="/employees"
                className="flex items-center justify-center px-3 py-2 rounded-lg bg-muted text-xs font-medium text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                +{dashboardData.directReports.length - 8}
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Pending Actions Grid */}
      {(hasPendingReviews || hasPendingLeave || hasUpcomingLeave) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pending Reviews */}
          {hasPendingReviews && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Reviews to Complete</h3>
              <div className="space-y-2">
                {dashboardData.pendingReviews.slice(0, 3).map((review) => (
                  <Link
                    key={review.id}
                    href={`/performance/reviews/${review.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-warning-50 hover:bg-warning-100 transition-colors dark:bg-warning-900/15 dark:hover:bg-warning-900/25"
                  >
                    <div className="w-7 h-7 rounded-full bg-warning-100 dark:bg-warning-900/30 flex items-center justify-center text-[10px] font-bold text-warning-800 dark:text-warning-300">
                      {review.employee.firstName[0]}{review.employee.lastName[0]}
                    </div>
                    <span className="text-sm font-medium text-foreground truncate">
                      {review.employee.firstName} {review.employee.lastName}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Leave Requests */}
          {hasPendingLeave && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Leave to Approve</h3>
              <div className="space-y-2">
                {dashboardData.pendingLeaveRequests.slice(0, 3).map((req) => (
                  <Link
                    key={req.id}
                    href={`/leave/${req.id}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-accent/10 hover:bg-accent/15 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-[10px] font-bold text-accent">
                      {req.employee.firstName[0]}{req.employee.lastName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-foreground truncate block">
                        {req.employee.firstName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{req.totalDays}d {req.leaveType}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Who's Out */}
          {hasUpcomingLeave && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Who's Out</h3>
              <div className="space-y-2">
                {dashboardData.upcomingLeaves.slice(0, 3).map((leave) => {
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  const start = new Date(leave.startDate)
                  start.setHours(0, 0, 0, 0)
                  const isOutNow = start <= today

                  return (
                    <div
                      key={leave.id}
                      className={cn(
                        'flex items-center gap-2.5 p-2.5 rounded-xl',
                        isOutNow
                          ? 'bg-danger-50 dark:bg-danger-900/15'
                          : 'bg-muted/40'
                      )}
                    >
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold',
                        isOutNow
                          ? 'bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300'
                          : 'bg-muted text-foreground'
                      )}>
                        {leave.employee.firstName[0]}{leave.employee.lastName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate block">
                          {leave.employee.firstName}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {isOutNow ? 'Out today' : new Date(leave.startDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Inbox Components
// ============================================================================

function InboxLoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 flex-1 min-h-0 lg:grid-cols-[360px,minmax(0,1fr)] animate-in fade-in duration-300">
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-muted animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
      <div className="rounded-2xl bg-muted animate-pulse" />
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function HubDashboard({ employeeId }: HubDashboardProps) {
  // Tab state - only inbox and overview now
  const [activeTab, setActiveTab] = useState<HubTab>('inbox')
  const [inboxSubTab, setInboxSubTab] = useState<InboxSubTab>('pending')

  // Overview data
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([])
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [myViolations, setMyViolations] = useState<DisciplinaryAction[]>([])
  const [myReviews, setMyReviews] = useState<PerformanceReview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [editingField, setEditingField] = useState<'phone' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  // Inbox data
  const [workItems, setWorkItems] = useState<WorkItemsResponse | null>(null)
  const [completedItems, setCompletedItems] = useState<CompletedWorkItemsResponse | null>(null)
  const [inboxLoading, setInboxLoading] = useState(true)
  const [completedLoading, setCompletedLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [completedSelectedId, setCompletedSelectedId] = useState<string | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Shared state
  const [error, setError] = useState<string | null>(null)

  // Load inbox items (pending)
  const loadPending = useCallback(async (options?: { force?: boolean }) => {
    try {
      const force = options?.force ?? false
      setInboxLoading(true)
      setError(null)
      const next = await WorkItemsApi.list({ force })
      setWorkItems(next)
      setSelectedId((prev) => {
        if (prev && next.items.some((i) => i.id === prev)) return prev
        return next.items[0]?.id ?? null
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load work items'
      setError(message)
      setWorkItems({ items: [], meta: { totalCount: 0, actionRequiredCount: 0, overdueCount: 0 } })
    } finally {
      setInboxLoading(false)
    }
  }, [])

  // Load completed items
  const loadCompleted = useCallback(async (options?: { force?: boolean }) => {
    try {
      const force = options?.force ?? false
      setCompletedLoading(true)
      const next = await WorkItemsApi.listCompleted({ force })
      setCompletedItems(next)
      setCompletedSelectedId((prev) => {
        if (prev && next.items.some((i) => i.id === prev)) return prev
        return next.items[0]?.id ?? null
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load completed items'
      setError(message)
      setCompletedItems({ items: [], meta: { totalCount: 0 } })
    } finally {
      setCompletedLoading(false)
    }
  }, [])

  // Load overview data
  const loadOverview = useCallback(async () => {
    try {
      setOverviewLoading(true)
      setError(null)
      const [emp, balanceData, dashboard, violations, reviews] = await Promise.all([
        EmployeesApi.get(employeeId),
        LeavesApi.getBalance({ employeeId }).catch(() => ({ balances: [] })),
        DashboardApi.get().catch(() => null),
        DisciplinaryActionsApi.list({ employeeId, take: 10 }).catch(() => ({ items: [] })),
        PerformanceReviewsApi.list({ employeeId, take: 5 }).catch(() => ({ items: [] })),
      ])
      setEmployee(emp)
      setLeaveBalances(balanceData.balances)
      setDashboardData(dashboard)
      setMyViolations(violations.items)
      setMyReviews(reviews.items)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load profile'
      setError(message)
    } finally {
      setOverviewLoading(false)
    }
  }, [employeeId])

  // Save profile field
  const handleSaveField = useCallback(async () => {
    if (!employee || !editingField) return
    setSaving(true)
    try {
      const updated = await EmployeesApi.update(employee.id, { [editingField]: editValue })
      setEmployee(updated)
      setEditingField(null)
      setEditValue('')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save'
      setError(message)
    } finally {
      setSaving(false)
    }
  }, [employee, editingField, editValue])

  const startEditing = useCallback((field: 'phone', currentValue: string) => {
    setEditingField(field)
    setEditValue(currentValue)
  }, [])

  // Initial load
  useEffect(() => {
    loadPending()
  }, [loadPending])

  // Load completed when switching to completed sub-tab
  useEffect(() => {
    if (inboxSubTab === 'completed' && !completedItems) {
      loadCompleted()
    }
  }, [inboxSubTab, completedItems, loadCompleted])

  // Load overview data when switching to overview tab
  useEffect(() => {
    if (activeTab === 'overview' && !employee) {
      loadOverview()
    }
  }, [activeTab, employee, loadOverview])

  // Handle inbox action
  const handleAction = useCallback(async (actionId: ActionId, item: WorkItemDTO) => {
    setError(null)
    try {
      await executeAction(actionId, item.entity)
      await loadPending({ force: true })
      if (completedItems) {
        await loadCompleted({ force: true })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to complete action'
      setError(message)
    }
  }, [loadPending, loadCompleted, completedItems])

  const handleRequestCreated = useCallback(() => {
    setCreateModalOpen(false)
    loadPending({ force: true })
  }, [loadPending])

  // Computed values for inbox
  const items = workItems?.items ?? []
  const meta = workItems?.meta
  const completedList = completedItems?.items ?? []
  const completedMeta = completedItems?.meta

  const selected = useMemo(() => {
    if (!items.length) return null
    if (!selectedId) return items[0] ?? null
    return items.find((i) => i.id === selectedId) ?? items[0] ?? null
  }, [items, selectedId])

  const selectedIndex = useMemo(() => {
    if (!selected) return -1
    return items.findIndex((i) => i.id === selected.id)
  }, [items, selected])

  const selectedCompleted = useMemo(() => {
    if (!completedList.length) return null
    if (!completedSelectedId) return completedList[0] ?? null
    return completedList.find((i) => i.id === completedSelectedId) ?? completedList[0] ?? null
  }, [completedList, completedSelectedId])

  const isInboxLoading = inboxSubTab === 'pending' ? inboxLoading : completedLoading

  // Check if user is a manager
  const isManager = dashboardData?.directReports && dashboardData.directReports.length > 0
  const isAllClear = activeTab === 'inbox' && inboxSubTab === 'pending' && meta?.totalCount === 0

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <CreateRequestModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleRequestCreated}
      />

      {error ? (
        <Alert variant="error" className="mb-4" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {/* Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">My Hub</h1>

          <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1">
            <TabButton
              active={activeTab === 'inbox'}
              onClick={() => setActiveTab('inbox')}
              count={meta?.totalCount}
            >
              Inbox
            </TabButton>
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </TabButton>
          </div>

          {isAllClear ? (
            <div className="inline-flex items-center gap-2 rounded-xl bg-success-50 px-3 py-1.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
              <span className="h-2 w-2 rounded-full bg-success-500" />
              All clear
            </div>
          ) : null}
        </div>

        {activeTab === 'inbox' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-0.5">
              <SubTabButton
                active={inboxSubTab === 'pending'}
                onClick={() => setInboxSubTab('pending')}
                count={meta?.totalCount}
              >
                Pending
              </SubTabButton>
              <SubTabButton
                active={inboxSubTab === 'completed'}
                onClick={() => setInboxSubTab('completed')}
                count={completedMeta?.totalCount}
              >
                Completed
              </SubTabButton>
            </div>

            <Button onClick={() => setCreateModalOpen(true)} variant="outline" size="sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New request
            </Button>
          </div>
        ) : null}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 pt-4">
        {activeTab === 'inbox' ? (
          <div key={`inbox-${inboxSubTab}`} className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Inbox content */}
            {isInboxLoading ? (
              <InboxLoadingSkeleton />
            ) : inboxSubTab === 'pending' ? (
              <div className="grid grid-cols-1 gap-4 flex-1 min-h-0 lg:grid-cols-[360px,minmax(0,1fr)]">
                <div className="flex flex-col min-h-0">
                  <InboxItemList items={items} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
                </div>
                <div className="min-h-0">
                  <InboxActionPane
                    item={selected}
                    onAction={handleAction}
                    currentIndex={selectedIndex}
                    totalCount={items.length}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 flex-1 min-h-0 lg:grid-cols-[360px,minmax(0,1fr)]">
                <div className="flex flex-col min-h-0">
                  <CompletedItemList items={completedList} selectedId={selectedCompleted?.id ?? null} onSelect={setCompletedSelectedId} />
                </div>
                <div className="min-h-0">
                  <CompletedActionPane item={selectedCompleted} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div key="overview" className="h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
            {overviewLoading ? (
              <div className="space-y-6 animate-pulse">
                <div className="h-32 rounded-2xl bg-muted" />
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-muted" />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-40 rounded-2xl bg-muted" />
                  <div className="h-40 rounded-2xl bg-muted" />
                </div>
              </div>
            ) : employee ? (
              <div className="h-full overflow-y-auto pr-2 -mr-2">
                <div className="grid grid-cols-1 gap-4 pb-6 xl:grid-cols-12">
                  <div className="xl:col-span-5 flex flex-col gap-4">
                    <section className="space-y-2">
                      <SectionHeader>Profile</SectionHeader>
                      <ProfileCard
                        employee={employee}
                        editingField={editingField}
                        editValue={editValue}
                        saving={saving}
                        onStartEdit={startEditing}
                        onEditChange={setEditValue}
                        onSave={handleSaveField}
                        onCancel={() => { setEditingField(null); setEditValue('') }}
                      />
                    </section>

                    <section className="space-y-2">
                      <SectionHeader
                        action={
                          <Button href="/leave/request" size="sm" variant="secondary">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Request leave
                          </Button>
                        }
                      >
                        Time off
                      </SectionHeader>
                      <TimeOffSection balances={leaveBalances} />
                    </section>
                  </div>

                  <div className="xl:col-span-7 flex flex-col gap-4">
                    <section className="space-y-2">
                      <SectionHeader>Performance</SectionHeader>
                      <PerformanceSection reviews={myReviews} violations={myViolations} />
                    </section>

                    {isManager && dashboardData ? (
                      <section className="space-y-2">
                        <SectionHeader>Team</SectionHeader>
                        <TeamSection dashboardData={dashboardData} />
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                <p className="text-sm text-muted-foreground">Could not load your profile</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
