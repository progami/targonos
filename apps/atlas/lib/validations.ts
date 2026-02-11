import { z } from 'zod'
import {
  DISCIPLINARY_ACTION_TYPE_VALUES,
  DISCIPLINARY_STATUS_VALUES,
  VALUE_BREACH_VALUES,
  VIOLATION_REASON_VALUES,
  VIOLATION_TYPE_VALUES,
} from '@/lib/domain/disciplinary/constants'
import { EMPLOYEE_REGION_VALUES, EMPLOYEE_STATUS_VALUES, EMPLOYMENT_TYPE_VALUES, EXIT_REASON_VALUES } from '@/lib/domain/employee/constants'
import { LEAVE_STATUS_VALUES, LEAVE_TYPE_VALUES } from '@/lib/domain/leave/constants'
import { POLICY_CATEGORY_VALUES, POLICY_REGION_VALUES, POLICY_STATUS_VALUES } from '@/lib/domain/policy/constants'
import { REVIEW_STATUS_VALUES, REVIEW_TYPE_VALUES } from '@/lib/domain/performance/constants'
import { getAllowedReviewPeriodTypes, REVIEW_PERIOD_TYPES } from '@/lib/review-period'

// Shared constants
export const MAX_PAGINATION_LIMIT = 100
export const DEFAULT_PAGINATION_LIMIT = 50

// Employee schemas
export const EmploymentTypeEnum = z.enum(EMPLOYMENT_TYPE_VALUES)
export const EmployeeStatusEnum = z.enum(EMPLOYEE_STATUS_VALUES)
export const EmployeeRegionEnum = z.enum(EMPLOYEE_REGION_VALUES)
export const ExitReasonEnum = z.enum(EXIT_REASON_VALUES)

// Leave schemas - simplified for small team (15-20 people)
export const LeaveTypeEnum = z.enum(LEAVE_TYPE_VALUES)
export const LeaveStatusEnum = z.enum(LEAVE_STATUS_VALUES)

export const CreateLeaveRequestSchema = z.object({
  leaveType: LeaveTypeEnum,
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().max(2000).optional().nullable(),
}).refine((data) => {
  const start = new Date(data.startDate)
  const end = new Date(data.endDate)
  return end >= start
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
})

export const CreateEmployeeSchema = z.object({
  employeeId: z.string().min(1).max(50).trim().optional(),
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).trim().toLowerCase(),
  phone: z.string().max(50).trim().optional().nullable(),
  department: z.string().max(100).trim().optional().default('General'),
  departmentName: z.string().max(100).trim().optional(),
  position: z.string().min(1).max(100).trim(),
  employmentType: EmploymentTypeEnum.default('FULL_TIME'),
  joinDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  status: EmployeeStatusEnum.default('ACTIVE'),
  region: EmployeeRegionEnum.default('PAKISTAN'),
  roles: z.array(z.string().max(100)).max(20).optional(),
})

export const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  email: z.string().email().max(255).trim().toLowerCase().optional(),
  phone: z.string().max(50).trim().optional().nullable(),
  department: z.string().max(100).trim().optional(),
  departmentName: z.string().max(100).trim().optional(),
  position: z.string().min(1).max(100).trim().optional(),
  employmentType: EmploymentTypeEnum.optional(),
  joinDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional(),
  status: EmployeeStatusEnum.optional(),
  roles: z.array(z.string().max(100)).max(20).optional(),
  // Hierarchy
  reportsToId: z.string().max(100).optional().nullable(),
  // Personal info
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional().nullable(),
  gender: z.string().max(50).trim().optional().nullable(),
  maritalStatus: z.string().max(50).trim().optional().nullable(),
  nationality: z.string().max(100).trim().optional().nullable(),
  address: z.string().max(500).trim().optional().nullable(),
  city: z.string().max(100).trim().optional().nullable(),
  country: z.string().max(100).trim().optional().nullable(),
  postalCode: z.string().max(20).trim().optional().nullable(),
  emergencyContact: z.string().max(100).trim().optional().nullable(),
  emergencyPhone: z.string().max(50).trim().optional().nullable(),
  // Salary
  salary: z.number().min(0).optional().nullable(),
  currency: z.string().max(10).trim().optional(),
  // Region for leave policy
  region: EmployeeRegionEnum.optional(),
  // Offboarding
  exitReason: ExitReasonEnum.optional().nullable(),
  lastWorkingDay: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional().nullable(),
  exitNotes: z.string().max(2000).trim().optional().nullable(),
})

// Policy schemas
export const PolicyCategoryEnum = z.enum(POLICY_CATEGORY_VALUES)
export const PolicyStatusEnum = z.enum(POLICY_STATUS_VALUES)
export const RegionEnum = z.enum(POLICY_REGION_VALUES)

// Version format: major.minor (e.g., "1.0", "2.3")
export const VersionSchema = z.string().regex(/^\d+\.\d+$/, {
  message: 'Version must be in format X.Y (e.g., 1.0, 2.3)',
})

export function bumpVersion(current: string, type: 'major' | 'minor' = 'minor'): string {
  const match = current.match(/^(\d+)\.(\d+)$/)
  if (!match) return '1.0'
  const major = parseInt(match[1], 10)
  const minor = parseInt(match[2], 10)
  if (type === 'major') return `${major + 1}.0`
  return `${major}.${minor + 1}`
}

export const CreatePolicySchema = z.object({
  title: z.string().min(1).max(200).trim(),
  category: PolicyCategoryEnum,
  region: RegionEnum,
  summary: z.string().max(1000).trim().optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
  fileUrl: z.string().url().max(500).optional().nullable(),
  version: VersionSchema.default('1.0'),
  effectiveDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional().nullable(),
  status: PolicyStatusEnum.default('ACTIVE'),
})

export const UpdatePolicySchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  category: PolicyCategoryEnum.optional(),
  region: RegionEnum.optional(),
  summary: z.string().max(1000).trim().optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
  fileUrl: z.string().url().max(500).optional().nullable(),
  version: VersionSchema.optional(),
  bumpVersion: z.enum(['major', 'minor']).optional(),
  effectiveDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }).optional().nullable(),
  status: PolicyStatusEnum.optional(),
})

// ============ PERFORMANCE REVIEW SCHEMAS ============
// Simplified for small team (15-20 people)
export const ReviewTypeEnum = z.enum(REVIEW_TYPE_VALUES)
export const ReviewStatusEnum = z.enum(REVIEW_STATUS_VALUES)
export const ReviewPeriodTypeEnum = z.enum(REVIEW_PERIOD_TYPES)

const RatingSchema = z.coerce.number().int().min(1).max(10)
const PeriodYearSchema = z.coerce.number().int().min(2000).max(2100)

export const CreatePerformanceReviewSchema = z.object({
  employeeId: z.string().min(1).max(100),
  reviewType: ReviewTypeEnum,
  periodType: ReviewPeriodTypeEnum,
  periodYear: PeriodYearSchema,
  reviewDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }),
  roleTitle: z.string().min(1).max(200).trim().optional(),
  assignedReviewerId: z.string().min(1).max(100).trim().optional(),
  reviewerName: z.string().min(1).max(100).trim().optional(),
  overallRating: RatingSchema,
  qualityOfWork: RatingSchema.optional().nullable(),
  productivity: RatingSchema.optional().nullable(),
  communication: RatingSchema.optional().nullable(),
  teamwork: RatingSchema.optional().nullable(),
  initiative: RatingSchema.optional().nullable(),
  attendance: RatingSchema.optional().nullable(),
  // Values-based ratings (Core Values System)
  ratingPrecision: RatingSchema.optional().nullable(),     // Attention to Detail (40%)
  ratingTransparency: RatingSchema.optional().nullable(),  // Honesty (20%)
  ratingReliability: RatingSchema.optional().nullable(),   // Integrity (20%)
  ratingInitiative: RatingSchema.optional().nullable(),    // Courage (20%)
  // Self-assessment ratings
  selfRatingPrecision: RatingSchema.optional().nullable(),
  selfRatingTransparency: RatingSchema.optional().nullable(),
  selfRatingReliability: RatingSchema.optional().nullable(),
  selfRatingInitiative: RatingSchema.optional().nullable(),
  // Justifications for low core values scores
  lowHonestyJustification: z.string().max(2000).trim().optional().nullable(),
  lowIntegrityJustification: z.string().max(2000).trim().optional().nullable(),
  strengths: z.string().max(2000).trim().optional().nullable(),
  areasToImprove: z.string().max(2000).trim().optional().nullable(),
  goals: z.string().max(2000).trim().optional().nullable(),
  comments: z.string().max(5000).trim().optional().nullable(),
  status: ReviewStatusEnum.default('DRAFT'),
}).superRefine((data, ctx) => {
  const allowedPeriodTypes = getAllowedReviewPeriodTypes(data.reviewType)
  if (!allowedPeriodTypes.includes(data.periodType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid review period for ${data.reviewType}`,
      path: ['periodType'],
    })
  }
})

export const UpdatePerformanceReviewSchema = z.object({
  reviewType: ReviewTypeEnum.optional(),
  periodType: ReviewPeriodTypeEnum.optional(),
  periodYear: PeriodYearSchema.optional(),
  reviewDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional(),
  reviewerName: z.string().min(1).max(100).trim().optional(),
  roleTitle: z.string().min(1).max(200).trim().optional(),
  overallRating: RatingSchema.optional(),
  qualityOfWork: RatingSchema.optional().nullable(),
  productivity: RatingSchema.optional().nullable(),
  communication: RatingSchema.optional().nullable(),
  teamwork: RatingSchema.optional().nullable(),
  initiative: RatingSchema.optional().nullable(),
  attendance: RatingSchema.optional().nullable(),
  // Values-based ratings (Core Values System)
  ratingPrecision: RatingSchema.optional().nullable(),
  ratingTransparency: RatingSchema.optional().nullable(),
  ratingReliability: RatingSchema.optional().nullable(),
  ratingInitiative: RatingSchema.optional().nullable(),
  // Self-assessment ratings
  selfRatingPrecision: RatingSchema.optional().nullable(),
  selfRatingTransparency: RatingSchema.optional().nullable(),
  selfRatingReliability: RatingSchema.optional().nullable(),
  selfRatingInitiative: RatingSchema.optional().nullable(),
  // Justifications for low core values scores
  lowHonestyJustification: z.string().max(2000).trim().optional().nullable(),
  lowIntegrityJustification: z.string().max(2000).trim().optional().nullable(),
  strengths: z.string().max(2000).trim().optional().nullable(),
  areasToImprove: z.string().max(2000).trim().optional().nullable(),
  goals: z.string().max(2000).trim().optional().nullable(),
  comments: z.string().max(5000).trim().optional().nullable(),
  status: ReviewStatusEnum.optional(),
}).superRefine((data, ctx) => {
  const hasPeriodType = data.periodType !== undefined
  const hasPeriodYear = data.periodYear !== undefined
  if (hasPeriodType !== hasPeriodYear) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'periodType and periodYear must be provided together',
      path: ['periodType'],
    })
  }

  if (data.reviewType && data.periodType) {
    const allowedPeriodTypes = getAllowedReviewPeriodTypes(data.reviewType)
    if (!allowedPeriodTypes.includes(data.periodType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid review period for ${data.reviewType}`,
        path: ['periodType'],
      })
    }
  }
})

// ============ DISCIPLINARY ACTION SCHEMAS ============
export const ViolationTypeEnum = z.enum(VIOLATION_TYPE_VALUES)

export const ViolationReasonEnum = z.enum(VIOLATION_REASON_VALUES)

export const ViolationSeverityEnum = z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'])

export const DisciplinaryActionTypeEnum = z.enum(DISCIPLINARY_ACTION_TYPE_VALUES)

export const DisciplinaryStatusEnum = z.enum(DISCIPLINARY_STATUS_VALUES)

export const AppealStatusEnum = z.enum([
  'PENDING', 'UPHELD', 'OVERTURNED', 'MODIFIED'
])

// Schema for employee to submit an appeal
export const SubmitAppealSchema = z.object({
  appealReason: z.string().min(10, 'Appeal reason must be at least 10 characters').max(5000).trim(),
})

// Schema for HR to resolve an appeal
export const ResolveAppealSchema = z.object({
  appealStatus: AppealStatusEnum,
  appealResolution: z.string().min(1, 'Resolution is required').max(5000).trim(),
})

// Core Values breach mapping
export const ValueBreachEnum = z.enum(VALUE_BREACH_VALUES)

export const CreateDisciplinaryActionSchema = z.object({
  employeeId: z.string().min(1).max(100),
  violationType: ViolationTypeEnum,
  violationReason: ViolationReasonEnum,
  // Core Values Breached - can select multiple
  valuesBreached: z.array(ValueBreachEnum).default([]),
  severity: ViolationSeverityEnum,
  incidentDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }),
  reportedBy: z.string().min(1).max(100).trim(),
  description: z.string().min(1).max(5000).trim(),
  witnesses: z.string().max(1000).trim().optional().nullable(),
  evidence: z.string().max(2000).trim().optional().nullable(),
  actionTaken: DisciplinaryActionTypeEnum,
})

export const UpdateDisciplinaryActionSchema = z.object({
  violationType: ViolationTypeEnum.optional(),
  violationReason: ViolationReasonEnum.optional(),
  severity: ViolationSeverityEnum.optional(),
  // Core Values breach tracking
  valuesBreached: z.array(ValueBreachEnum).optional(),
  employeeTookOwnership: z.boolean().optional().nullable(),
  incidentDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional(),
  reportedBy: z.string().min(1).max(100).trim().optional(),
  description: z.string().min(1).max(5000).trim().optional(),
  witnesses: z.string().max(1000).trim().optional().nullable(),
  evidence: z.string().max(2000).trim().optional().nullable(),
  actionTaken: DisciplinaryActionTypeEnum.optional(),
  actionDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional().nullable(),
  actionDetails: z.string().max(2000).trim().optional().nullable(),
  followUpDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional().nullable(),
  followUpNotes: z.string().max(2000).trim().optional().nullable(),
  status: DisciplinaryStatusEnum.optional(),
  resolution: z.string().max(2000).trim().optional().nullable(),
})

// ============ HR CALENDAR EVENT SCHEMAS ============
// Simplified for small team (15-20 people)
export const HREventTypeEnum = z.enum([
  'PERFORMANCE_REVIEW', 'PROBATION_END', 'COMPANY_EVENT', 'HOLIDAY', 'OTHER'
])

export const CreateHRCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
  eventType: HREventTypeEnum,
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional().nullable(),
  allDay: z.boolean().default(true),
  employeeId: z.string().max(100).optional().nullable(),
  relatedRecordId: z.string().max(100).optional().nullable(),
  relatedRecordType: z.string().max(50).optional().nullable(),
})

export const UpdateHRCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().optional().nullable(),
  eventType: HREventTypeEnum.optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid date format' }).optional().nullable(),
  allDay: z.boolean().optional(),
  employeeId: z.string().max(100).optional().nullable(),
  relatedRecordId: z.string().max(100).optional().nullable(),
  relatedRecordType: z.string().max(50).optional().nullable(),
})

// Pagination schema
export const PaginationSchema = z.object({
  take: z.coerce.number().int().min(1).max(MAX_PAGINATION_LIMIT).default(DEFAULT_PAGINATION_LIMIT),
  skip: z.coerce.number().int().min(0).default(0),
  q: z.string().max(200).optional(),
})

// Type exports
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>
export type CreatePolicyInput = z.infer<typeof CreatePolicySchema>
export type UpdatePolicyInput = z.infer<typeof UpdatePolicySchema>
export type PaginationInput = z.infer<typeof PaginationSchema>
