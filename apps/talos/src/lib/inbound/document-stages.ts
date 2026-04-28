export const ACTIVE_INBOUND_DOCUMENT_STAGES = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
] as const

export type ActiveInboundOrderDocumentStage =
  (typeof ACTIVE_INBOUND_DOCUMENT_STAGES)[number]

export const INBOUND_DOCUMENT_STAGE_ORDER: Record<
  ActiveInboundOrderDocumentStage,
  number
> = {
  ISSUED: 0,
  MANUFACTURING: 1,
  OCEAN: 2,
  WAREHOUSE: 3,
}

export function isActiveInboundOrderDocumentStage(
  value: string
): value is ActiveInboundOrderDocumentStage {
  return ACTIVE_INBOUND_DOCUMENT_STAGES.includes(
    value as ActiveInboundOrderDocumentStage
  )
}

export function parseActiveInboundOrderDocumentStage(
  value: unknown
): ActiveInboundOrderDocumentStage | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  return isActiveInboundOrderDocumentStage(trimmed) ? trimmed : null
}

export function getInboundOrderDocumentStageForStatus(
  status: string
): ActiveInboundOrderDocumentStage | null {
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

export function getActiveInboundOrderDocumentStageFromStoredStage(
  stage: string
): ActiveInboundOrderDocumentStage | null {
  if (stage === 'DRAFT' || stage === 'RFQ') {
    return 'ISSUED'
  }

  return parseActiveInboundOrderDocumentStage(stage)
}
