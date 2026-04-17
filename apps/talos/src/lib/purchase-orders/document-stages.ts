export const ACTIVE_PURCHASE_ORDER_DOCUMENT_STAGES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
] as const

export type ActivePurchaseOrderDocumentStage =
  (typeof ACTIVE_PURCHASE_ORDER_DOCUMENT_STAGES)[number]

export const PURCHASE_ORDER_DOCUMENT_STAGE_ORDER: Record<
  ActivePurchaseOrderDocumentStage,
  number
> = {
  ISSUED: 0,
  MANUFACTURING: 1,
  OCEAN: 2,
  WAREHOUSE: 3,
}

export function isActivePurchaseOrderDocumentStage(
  value: string
): value is ActivePurchaseOrderDocumentStage {
  return ACTIVE_PURCHASE_ORDER_DOCUMENT_STAGES.includes(
    value as ActivePurchaseOrderDocumentStage
  )
}

export function parseActivePurchaseOrderDocumentStage(
  value: unknown
): ActivePurchaseOrderDocumentStage | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return isActivePurchaseOrderDocumentStage(trimmed) ? trimmed : null
}

export function getPurchaseOrderDocumentStageForStatus(
  status: string
): ActivePurchaseOrderDocumentStage | null {
  if (status === 'RFQ' || status === 'ISSUED') {
    return 'ISSUED'
  }

  if (status === 'MANUFACTURING') {
    return 'MANUFACTURING'
  }

  if (status === 'OCEAN') {
    return 'OCEAN'
  }

  if (status === 'WAREHOUSE') {
    return 'WAREHOUSE'
  }

  return null
}

export function getActivePurchaseOrderDocumentStageFromStoredStage(
  stage: string
): ActivePurchaseOrderDocumentStage | null {
  if (stage === 'DRAFT' || stage === 'RFQ') {
    return 'ISSUED'
  }

  return parseActivePurchaseOrderDocumentStage(stage)
}
