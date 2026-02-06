import { ValidationError } from '@/lib/api'

const PO_REFERENCE_REGEX = /^PO-(\d+)-([A-Z0-9]+)$/
const LEGACY_PO_REFERENCE_REGEX = /^INV-(\d+)[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$/
const LEGACY_TENANT_PO_REFERENCE_REGEX = /^TG-[A-Z]{2}-(\d+)$/
const CI_REFERENCE_REGEX = /^CI-(\d+)-([A-Z0-9]+)$/
const GRN_REFERENCE_REGEX = /^GRN-(\d+)-([A-Z0-9]+)$/

interface PurchaseOrderReferenceReader {
  purchaseOrder: {
    findMany(args: {
      where?: Record<string, unknown>
      select: {
        orderNumber?: true
        poNumber?: true
        commercialInvoiceNumber?: true
      }
    }): Promise<Array<{ orderNumber?: string | null; poNumber?: string | null; commercialInvoiceNumber?: string | null }>>
  }
}

interface GrnReferenceReader {
  grn: {
    findMany(args: {
      where?: Record<string, unknown>
      select: {
        referenceNumber: true
      }
    }): Promise<Array<{ referenceNumber: string | null }>>
  }
}

function parseSequence(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}

function parseGroupedReference(
  reference: string,
  regex: RegExp
): {
  sequence: number
  skuGroup: string
} | null {
  const match = regex.exec(reference)
  if (!match) return null
  const sequence = parseSequence(match[1])
  if (sequence === null) return null

  const skuGroup = normalizeSkuGroup(match[2])
  return { sequence, skuGroup }
}

export function normalizeSkuGroup(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    throw new ValidationError('SKU group is required')
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    throw new ValidationError('SKU group must contain only letters and numbers')
  }
  return normalized
}

export function normalizeSkuCodeForLot(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (!normalized) {
    throw new ValidationError('SKU code is required for lot reference generation')
  }
  return normalized
}

export function buildPurchaseOrderReference(sequence: number, skuGroup: string): string {
  const group = normalizeSkuGroup(skuGroup)
  return `PO-${sequence}-${group}`
}

export function buildCommercialInvoiceReference(sequence: number, skuGroup: string): string {
  const group = normalizeSkuGroup(skuGroup)
  return `CI-${sequence}-${group}`
}

export function buildGoodsReceiptReference(sequence: number, skuGroup: string): string {
  const group = normalizeSkuGroup(skuGroup)
  return `GRN-${sequence}-${group}`
}

export function buildLotReference(sequence: number, skuGroup: string, skuCode: string): string {
  const group = normalizeSkuGroup(skuGroup)
  const skuSegment = normalizeSkuCodeForLot(skuCode)
  return `Lot-${sequence}-${group}-${skuSegment}`
}

export function parseOrderReference(reference: string): { sequence: number; skuGroup: string } | null {
  const normalized = reference.trim().toUpperCase()
  const current = parseGroupedReference(normalized, PO_REFERENCE_REGEX)
  if (current) return current
  return parseGroupedReference(normalized, LEGACY_PO_REFERENCE_REGEX)
}

export function resolveOrderReferenceSeed(input: {
  orderNumber: string
  poNumber: string | null
  skuGroup: string | null
}): {
  sequence: number
  skuGroup: string
} {
  const candidate =
    typeof input.poNumber === 'string' && input.poNumber.trim().length > 0
      ? input.poNumber
      : input.orderNumber

  const parsed = parseOrderReference(candidate)
  const parsedLegacyTenant = (() => {
    const match = LEGACY_TENANT_PO_REFERENCE_REGEX.exec(candidate.trim().toUpperCase())
    if (!match) return null
    const sequence = parseSequence(match[1])
    if (sequence === null) return null
    return { sequence }
  })()

  if (!parsed && !parsedLegacyTenant) {
    throw new ValidationError(`Order reference ${candidate} does not match the PO naming convention`)
  }

  if (typeof input.skuGroup === 'string' && input.skuGroup.trim().length > 0) {
    const normalizedGroup = normalizeSkuGroup(input.skuGroup)
    if (parsed && normalizedGroup !== parsed.skuGroup) {
      throw new ValidationError(
        `Order reference group mismatch: expected ${normalizedGroup}, found ${parsed.skuGroup}`
      )
    }
    return {
      sequence: parsed ? parsed.sequence : parsedLegacyTenant!.sequence,
      skuGroup: normalizedGroup,
    }
  }

  if (!parsed) {
    throw new ValidationError('SKU group is required for legacy order references')
  }

  return parsed
}

function findMaxSequence(
  references: Array<string | null | undefined>,
  parser: (value: string) => { sequence: number; skuGroup: string } | null,
  skuGroup: string
): number {
  let maxSequence = 0

  for (const value of references) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue
    }

    const parsed = parser(value.trim().toUpperCase())
    if (!parsed || parsed.skuGroup !== skuGroup) {
      continue
    }

    if (parsed.sequence > maxSequence) {
      maxSequence = parsed.sequence
    }
  }

  return maxSequence
}

export async function getNextPurchaseOrderSequence(
  prisma: PurchaseOrderReferenceReader,
  skuGroup: string
): Promise<number> {
  const normalizedGroup = normalizeSkuGroup(skuGroup)
  const records = await prisma.purchaseOrder.findMany({
    where: {
      OR: [
        { orderNumber: { contains: `-${normalizedGroup}` } },
        { poNumber: { contains: `-${normalizedGroup}` } },
      ],
    },
    select: {
      orderNumber: true,
      poNumber: true,
    },
  })

  const references: string[] = []
  for (const record of records) {
    if (typeof record.orderNumber === 'string') {
      references.push(record.orderNumber)
    }
    if (typeof record.poNumber === 'string') {
      references.push(record.poNumber)
    }
  }

  const maxSequence = findMaxSequence(references, parseOrderReference, normalizedGroup)
  return maxSequence + 1
}

export async function getNextCommercialInvoiceSequence(
  prisma: PurchaseOrderReferenceReader,
  skuGroup: string
): Promise<number> {
  const normalizedGroup = normalizeSkuGroup(skuGroup)
  const records = await prisma.purchaseOrder.findMany({
    where: {
      commercialInvoiceNumber: {
        contains: `-${normalizedGroup}`,
      },
    },
    select: {
      commercialInvoiceNumber: true,
    },
  })

  const references = records.map(record => record.commercialInvoiceNumber)
  const maxSequence = findMaxSequence(
    references,
    value => parseGroupedReference(value, CI_REFERENCE_REGEX),
    normalizedGroup
  )
  return maxSequence + 1
}

export async function getNextGoodsReceiptSequence(
  prisma: GrnReferenceReader,
  skuGroup: string
): Promise<number> {
  const normalizedGroup = normalizeSkuGroup(skuGroup)
  const records = await prisma.grn.findMany({
    where: {
      referenceNumber: {
        contains: `-${normalizedGroup}`,
      },
    },
    select: {
      referenceNumber: true,
    },
  })

  const references = records.map(record => record.referenceNumber)
  const maxSequence = findMaxSequence(
    references,
    value => parseGroupedReference(value, GRN_REFERENCE_REGEX),
    normalizedGroup
  )
  return maxSequence + 1
}
