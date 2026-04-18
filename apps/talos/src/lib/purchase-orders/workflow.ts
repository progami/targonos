import { ConflictError } from '@/lib/api/errors'

export const ACTIVE_PURCHASE_ORDER_STATUSES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'CANCELLED',
] as const

const LEGACY_VISIBLE_PURCHASE_ORDER_STATUSES = [
  'ARCHIVED',
  'AWAITING_PROOF',
  'REVIEW',
  'POSTED',
  'SHIPPED',
  'CLOSED',
  'REJECTED',
] as const

export const CANCELABLE_PURCHASE_ORDER_STATUSES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
] as const

export type ActivePurchaseOrderStatus = (typeof ACTIVE_PURCHASE_ORDER_STATUSES)[number]
export type TransitionablePurchaseOrderStatus = (typeof CANCELABLE_PURCHASE_ORDER_STATUSES)[number]

const LEGACY_READ_ONLY_PURCHASE_ORDER_STATUSES = new Set([
  'ARCHIVED',
  'AWAITING_PROOF',
  'REVIEW',
  'POSTED',
  'SHIPPED',
  'CLOSED',
  'REJECTED',
])

const VALID_NEXT_PURCHASE_ORDER_STATUSES: Record<
  TransitionablePurchaseOrderStatus,
  ActivePurchaseOrderStatus[]
> = {
  ISSUED: ['MANUFACTURING', 'CANCELLED'],
  MANUFACTURING: ['OCEAN', 'CANCELLED'],
  OCEAN: ['WAREHOUSE', 'CANCELLED'],
  WAREHOUSE: ['CANCELLED'],
}

export function getValidNextPurchaseOrderStatuses(
  status: TransitionablePurchaseOrderStatus
): ActivePurchaseOrderStatus[] {
  return [...VALID_NEXT_PURCHASE_ORDER_STATUSES[status]]
}

export function getRenderablePurchaseOrderStatuses(): ActivePurchaseOrderStatus[] {
  return [...ACTIVE_PURCHASE_ORDER_STATUSES]
}

export function getVisiblePurchaseOrderStatuses(): string[] {
  return [
    'RFQ',
    ...ACTIVE_PURCHASE_ORDER_STATUSES,
    ...LEGACY_VISIBLE_PURCHASE_ORDER_STATUSES,
  ]
}

export function isCancelablePurchaseOrderStatus(status: string): status is TransitionablePurchaseOrderStatus {
  return CANCELABLE_PURCHASE_ORDER_STATUSES.includes(status as TransitionablePurchaseOrderStatus)
}

export function normalizePurchaseOrderWorkflowStatus(status: string): string {
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

export function getPurchaseOrderDisplayStatus(status: string): ActivePurchaseOrderStatus {
  const normalizedStatus = normalizePurchaseOrderWorkflowStatus(status)

  if (ACTIVE_PURCHASE_ORDER_STATUSES.includes(normalizedStatus as ActivePurchaseOrderStatus)) {
    return normalizedStatus as ActivePurchaseOrderStatus
  }

  throw new Error(`Unsupported purchase order status: ${status}`)
}

export function isPostedPurchaseOrderReadOnly(input: { postedAt: string | Date | null }): boolean {
  return input.postedAt !== null
}

export function isPurchaseOrderReadOnlyForUi(input: {
  status?: string
  postedAt: string | Date | null
}): boolean {
  return (
    isPostedPurchaseOrderReadOnly(input) ||
    normalizePurchaseOrderWorkflowStatus(input.status ?? '') === 'CANCELLED' ||
    LEGACY_READ_ONLY_PURCHASE_ORDER_STATUSES.has(input.status ?? '')
  )
}

export function assertPurchaseOrderMutable(input: {
  status: string
  postedAt: string | Date | null
}): void {
  if (normalizePurchaseOrderWorkflowStatus(input.status) === 'CANCELLED') {
    throw new ConflictError('cancelled purchase orders are read-only')
  }

  if (LEGACY_READ_ONLY_PURCHASE_ORDER_STATUSES.has(input.status)) {
    throw new ConflictError('legacy purchase orders are read-only')
  }

  if (isPostedPurchaseOrderReadOnly(input)) {
    throw new ConflictError('posted purchase orders are read-only')
  }
}
