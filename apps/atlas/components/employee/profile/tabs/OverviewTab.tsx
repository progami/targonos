'use client'

import type { Employee } from '@/lib/api-client'
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserCircleIcon,
  HashtagIcon,
  ClockIcon,
  ExclamationCircleIcon,
  DocumentIcon,
} from '@/components/ui/Icons'
import { EMPLOYMENT_TYPE_LABELS, EXIT_REASON_LABELS } from '@/lib/domain/employee/constants'
import { formatDate } from '../utils'

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function getTenure(joinDate: string): string {
  const start = new Date(joinDate)
  const now = new Date()
  const totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12

  if (totalMonths < 1) return 'Just started'
  if (totalMonths < 12) return `${totalMonths} month${totalMonths !== 1 ? 's' : ''}`
  if (months === 0) return `${years} year${years !== 1 ? 's' : ''}`
  return `${years}y ${months}m`
}

function InfoRow({ icon: Icon, label, value, href, teal }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  href?: string
  teal?: boolean
}) {
  const content = href ? (
    <a href={href} className="text-brand-teal-600 hover:text-brand-teal-700 hover:underline underline-offset-2">
      {value}
    </a>
  ) : (
    <span className="text-foreground">{value}</span>
  )

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${teal ? 'bg-brand-teal-50' : 'bg-muted/50'}`}>
        <Icon className={`h-4 w-4 ${teal ? 'text-brand-teal-600' : 'text-muted-foreground'}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
        <p className="text-sm font-medium truncate">{content}</p>
      </div>
    </div>
  )
}

export function EmployeeOverviewTab({ employee }: { employee: Employee }) {
  const tenure = getTenure(employee.joinDate)
  const employmentTypeLabel =
    EMPLOYMENT_TYPE_LABELS[employee.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ||
    employee.employmentType

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Profile Header */}
      <div className="p-6 border-b border-border bg-muted/20">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {employee.avatar ? (
              <img
                src={employee.avatar}
                alt={`${employee.firstName} ${employee.lastName}`}
                className="h-20 w-20 rounded-xl object-cover ring-1 ring-border"
              />
            ) : (
              <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-brand-teal-400 to-brand-teal-600 flex items-center justify-center">
                <span className="text-2xl font-semibold text-white">
                  {getInitials(employee.firstName, employee.lastName)}
                </span>
              </div>
            )}
            <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-card ${employee.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>

          {/* Name & Title */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-foreground tracking-tight">
                  {employee.firstName} {employee.lastName}
                </h2>
                <p className="text-brand-teal-600 font-medium">{employee.position}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${employee.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {employee.status}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {employee.department ?? 'No department'} &middot; {employee.employeeId}
            </p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Left Column */}
        <div className="p-5 space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact & Employment</h3>

          <InfoRow
            icon={EnvelopeIcon}
            label="Email"
            value={employee.email}
            href={`mailto:${employee.email}`}
            teal
          />

          {employee.phone ? (
            <InfoRow
              icon={PhoneIcon}
              label="Phone"
              value={employee.phone}
              href={`tel:${employee.phone}`}
              teal
            />
          ) : null}

          <InfoRow
            icon={BriefcaseIcon}
            label="Employment Type"
            value={employmentTypeLabel}
          />

          <InfoRow
            icon={CalendarIcon}
            label="Start Date"
            value={formatDate(employee.joinDate)}
          />

          <InfoRow
            icon={ClockIcon}
            label="Tenure"
            value={tenure}
          />
        </div>

        {/* Right Column */}
        <div className="p-5 space-y-1">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Organization</h3>

          <InfoRow
            icon={BuildingIcon}
            label="Department"
            value={employee.department ?? 'Not assigned'}
          />

          <InfoRow
            icon={HashtagIcon}
            label="Employee ID"
            value={employee.employeeId}
          />

          {/* Manager */}
          <div className="py-2.5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                <UserCircleIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Reports To</p>
                {employee.manager ? (
                  <p className="text-sm font-medium text-foreground truncate">
                    {employee.manager.firstName} {employee.manager.lastName}
                    <span className="text-muted-foreground font-normal"> &middot; {employee.manager.position}</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No manager</p>
                )}
              </div>
            </div>
          </div>

          {/* Roles */}
          {employee.roles && employee.roles.length > 0 ? (
            <div className="pt-3 mt-2 border-t border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium mb-2">System Roles</p>
              <div className="flex flex-wrap gap-1.5">
                {employee.roles.map((role) => (
                  <span
                    key={role.id}
                    className="px-2 py-1 rounded-md text-xs font-medium bg-brand-navy-50 text-brand-navy-700"
                  >
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Separation Details — shown for offboarded employees */}
      {(employee.status === 'RESIGNED' || employee.status === 'TERMINATED') && (employee.exitReason || employee.lastWorkingDay || employee.exitNotes) ? (
        <div className="border-t border-border p-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Separation Details</h3>
          <div className="space-y-1">
            {employee.exitReason ? (
              <InfoRow
                icon={ExclamationCircleIcon}
                label="Exit Reason"
                value={EXIT_REASON_LABELS[employee.exitReason as keyof typeof EXIT_REASON_LABELS]}
              />
            ) : null}

            {employee.lastWorkingDay ? (
              <InfoRow
                icon={CalendarIcon}
                label="Last Working Day"
                value={formatDate(employee.lastWorkingDay)}
              />
            ) : null}

            {employee.exitNotes ? (
              <div className="flex items-start gap-3 py-2.5">
                <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <DocumentIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Exit Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{employee.exitNotes}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
