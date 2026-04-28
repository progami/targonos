export type LegacyInboundOrderReviewInput = {
  id: string
  inboundNumber: string | null
  status: string
  postedAt: string | Date | null
  warehouseCode: string | null
  shipToName: string | null
  shippedDate: Date | string | null
}

export type LegacyInboundOrderReviewRow = {
  id: string
  inboundNumber: string | null
  currentStatus: string
  posted: boolean
  warehouseCode: string | null
  shipToName: string | null
  shippedDate: string | null
}

function formatDateOnly(value: Date | string | null): string | null {
  if (value === null) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  return date.toISOString().slice(0, 10)
}

export function formatLegacyInboundOrderReviewRow(
  input: LegacyInboundOrderReviewInput
): LegacyInboundOrderReviewRow {
  return {
    id: input.id,
    inboundNumber: input.inboundNumber,
    currentStatus: input.status,
    posted: input.postedAt !== null,
    warehouseCode: input.warehouseCode,
    shipToName: input.shipToName,
    shippedDate: formatDateOnly(input.shippedDate),
  }
}
