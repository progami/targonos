import { ConflictError } from '@/lib/api/errors'
import type { InboundOrderStatus } from '@targon/prisma-talos'

export const ACTIVE_INBOUND_STATUSES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'CANCELLED',
] as const

const LEGACY_VISIBLE_INBOUND_STATUSES = [
  'ARCHIVED',
  'AWAITING_PROOF',
  'REVIEW',
  'POSTED',
  'SHIPPED',
  'CLOSED',
  'REJECTED',
] as const

export const CANCELABLE_INBOUND_STATUSES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
] as const

export type ActiveInboundOrderStatus = (typeof ACTIVE_INBOUND_STATUSES)[number]
export type TransitionableInboundOrderStatus = (typeof CANCELABLE_INBOUND_STATUSES)[number]

const LEGACY_READ_ONLY_INBOUND_STATUSES = new Set([
  'ARCHIVED',
  'AWAITING_PROOF',
  'REVIEW',
  'POSTED',
  'SHIPPED',
  'CLOSED',
  'REJECTED',
])

const VALID_NEXT_INBOUND_STATUSES: Record<
  TransitionableInboundOrderStatus,
  ActiveInboundOrderStatus[]
> = {
  ISSUED: ['MANUFACTURING', 'CANCELLED'],
  MANUFACTURING: ['OCEAN', 'CANCELLED'],
  OCEAN: ['WAREHOUSE', 'CANCELLED'],
  WAREHOUSE: ['CANCELLED'],
}

export function getValidNextInboundOrderStatuses(
  status: TransitionableInboundOrderStatus
): ActiveInboundOrderStatus[] {
  return [...VALID_NEXT_INBOUND_STATUSES[status]]
}

export function getRenderableInboundOrderStatuses(): ActiveInboundOrderStatus[] {
  return [...ACTIVE_INBOUND_STATUSES]
}

export function getVisibleInboundOrderStatuses(): string[] {
  return [
    'RFQ',
    ...ACTIVE_INBOUND_STATUSES,
    ...LEGACY_VISIBLE_INBOUND_STATUSES,
  ]
}

export function getQueryableInboundOrderStatuses(): InboundOrderStatus[] {
  // Keep Prisma filters limited to enum members that still exist in the schema.
  return [
    'RFQ',
    ...ACTIVE_INBOUND_STATUSES,
    'ARCHIVED',
    'AWAITING_PROOF',
    'REVIEW',
    'POSTED',
  ]
}

export function isCancelableInboundOrderStatus(status: string): status is TransitionableInboundOrderStatus {
  return CANCELABLE_INBOUND_STATUSES.includes(status as TransitionableInboundOrderStatus)
}

export function normalizeInboundOrderWorkflowStatus(status: string): string {
  if (status === 'RFQ') {
    return 'ISSUED'
  }

  if (status === 'AWAITING_PROOF' || status === 'REVIEW' || status === 'POSTED' || status === 'SHIPPED') {
    return 'WAREHOUSE'
  }

  if (status === 'ARCHIVED' || status === 'REJECTED' || status === 'CLOSED') {
    return 'CANCELLED'
  }

  return status
}

export function getInboundOrderDisplayStatus(status: string): ActiveInboundOrderStatus {
  const normalizedStatus = normalizeInboundOrderWorkflowStatus(status)

  if (ACTIVE_INBOUND_STATUSES.includes(normalizedStatus as ActiveInboundOrderStatus)) {
    return normalizedStatus as ActiveInboundOrderStatus
  }

  throw new Error(`Unsupported inbound status: ${status}`)
}

export function isPostedInboundOrderReadOnly(input: { postedAt: string | Date | null }): boolean {
  return input.postedAt !== null
}

export function isInboundOrderReadOnlyForUi(input: {
  status?: string
  postedAt: string | Date | null
}): boolean {
  return (
    isPostedInboundOrderReadOnly(input) ||
    normalizeInboundOrderWorkflowStatus(input.status ?? '') === 'CANCELLED' ||
    LEGACY_READ_ONLY_INBOUND_STATUSES.has(input.status ?? '')
  )
}

export function assertInboundOrderMutable(input: {
  status: string
  postedAt: string | Date | null
}): void {
  if (normalizeInboundOrderWorkflowStatus(input.status) === 'CANCELLED') {
    throw new ConflictError('cancelled inbound are read-only')
  }

  if (LEGACY_READ_ONLY_INBOUND_STATUSES.has(input.status)) {
    throw new ConflictError('legacy inbound are read-only')
  }

  if (isPostedInboundOrderReadOnly(input)) {
    throw new ConflictError('posted inbound are read-only')
  }
}
