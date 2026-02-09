import type { Prisma as PrismaNamespace } from '@targon/prisma-atlas'

// Re-export all Prisma types from the generated package
export {
  PrismaClient,
  Prisma,
  EmploymentType,
  EmployeeStatus,
  ExitReason,
  ResourceCategory,
  PolicyCategory,
  PolicyStatus,
  Region,
  ReviewType,
  ReviewStatus,
  ViolationType,
  ViolationReason,
  ViolationSeverity,
  DisciplinaryActionType,
  DisciplinaryStatus,
  HREventType,
  NotificationType,
  TaskStatus,
  TaskCategory,
  CaseType,
  CaseStatus,
  CaseSeverity,
  CaseParticipantRole,
  CaseNoteVisibility,
  AuditAction,
  AuditEntityType,
  EmployeeFileVisibility,
} from '@targon/prisma-atlas'

// Transaction client type for $transaction callbacks
export type TransactionClient = PrismaNamespace.TransactionClient
