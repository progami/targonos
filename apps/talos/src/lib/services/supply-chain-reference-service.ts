import { ValidationError } from '@/lib/api/responses'
import { TENANT_CODES, type TenantCode } from '@/lib/tenant/constants'
import { getTenantPrismaClient } from '@/lib/tenant/prisma-factory'
import { Prisma } from '@targon/prisma-talos'

const INBOUND_REFERENCE_REGEX = /^IN-(\d+)-([A-Z0-9]+)$/
const LEGACY_INBOUND_REFERENCE_REGEX = /^(?:INV|IN|Inbound)-(\d+)[A-Z]?-([A-Z0-9]+)(?:-[A-Z]{2})?$/
const LEGACY_TENANT_INBOUND_REFERENCE_REGEX = /^TG-[A-Z]{2}-(\d+)$/
const CI_REFERENCE_REGEX = /^CI-(\d+)-([A-Z0-9]+)$/
const GRN_REFERENCE_REGEX = /^GRN-(\d+)-([A-Z0-9]+)$/

interface InboundOrderReferenceReader {
  inboundOrder: {
    findMany(args: {
      where?: Record<string, unknown>
      select: {
        orderNumber?: true
        inboundNumber?: true
        commercialInvoiceNumber?: true
      }
    }): Promise<Array<{ orderNumber?: string | null; inboundNumber?: string | null; commercialInvoiceNumber?: string | null }>>
  }
}

type InboundOrderSequenceReader = InboundOrderReferenceReader & {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { timeout?: number }
  ): Promise<T>
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

const GLOBAL_INBOUND_SEQUENCE_COUNTER_PREFIX = 'inbound_sequence'

function parsePositiveInteger(value: unknown, fieldName: string): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint'
        ? Number(value)
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : Number.NaN

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new ValidationError(`Invalid ${fieldName}: ${String(value)}`)
  }

  return numericValue
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

export function buildInboundOrderReference(sequence: number, skuGroup: string): string {
  const group = normalizeSkuGroup(skuGroup)
  return `IN-${sequence}-${group}`
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
  const current = parseGroupedReference(normalized, INBOUND_REFERENCE_REGEX)
  if (current) return current
  return parseGroupedReference(normalized, LEGACY_INBOUND_REFERENCE_REGEX)
}

export function resolveOrderReferenceSeed(input: {
  orderNumber: string
  inboundNumber: string | null
  skuGroup: string | null
}): {
  sequence: number
  skuGroup: string
} {
  const candidate =
    typeof input.inboundNumber === 'string' && input.inboundNumber.trim().length > 0
      ? input.inboundNumber
      : input.orderNumber

  const parsed = parseOrderReference(candidate)
  const parsedLegacyTenant = (() => {
    const match = LEGACY_TENANT_INBOUND_REFERENCE_REGEX.exec(candidate.trim().toUpperCase())
    if (!match) return null
    const sequence = parseSequence(match[1])
    if (sequence === null) return null
    return { sequence }
  })()

  if (!parsed && !parsedLegacyTenant) {
    throw new ValidationError(`Order reference ${candidate} does not match the Inbound naming convention`)
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

async function readInboundReferencesForTenant(
  tenantCode: TenantCode,
  skuGroup: string
): Promise<string[]> {
  const prisma = await getTenantPrismaClient(tenantCode)
  const records = await prisma.inboundOrder.findMany({
    where: {
      OR: [
        { orderNumber: { contains: `-${skuGroup}` } },
        { inboundNumber: { contains: `-${skuGroup}` } },
      ],
    },
    select: {
      orderNumber: true,
      inboundNumber: true,
    },
  })

  const references: string[] = []
  for (const record of records) {
    if (typeof record.orderNumber === 'string') {
      references.push(record.orderNumber)
    }
    if (typeof record.inboundNumber === 'string') {
      references.push(record.inboundNumber)
    }
  }

  return references
}

async function findMaxInboundOrderSequenceAcrossTenants(skuGroup: string): Promise<number> {
  const references: string[] = []
  for (const tenantCode of TENANT_CODES) {
    const tenantReferences = await readInboundReferencesForTenant(tenantCode, skuGroup)
    references.push(...tenantReferences)
  }
  return findMaxSequence(references, parseOrderReference, skuGroup)
}

async function reserveNextGlobalInboundOrderSequence(
  prisma: InboundOrderSequenceReader,
  skuGroup: string
): Promise<number> {
  const counterKey = `${GLOBAL_INBOUND_SEQUENCE_COUNTER_PREFIX}:${skuGroup}`

  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${counterKey}))`)

      const rows = await tx.$queryRaw<Array<{ nextValue: number | bigint | string }>>(Prisma.sql`
        SELECT "next_value" AS "nextValue"
        FROM "global_reference_counters"
        WHERE "counter_key" = ${counterKey}
        FOR UPDATE
      `)

      const existing = rows[0]
      if (existing) {
        const reserved = parsePositiveInteger(existing.nextValue, 'next_value')
        await tx.$executeRaw(Prisma.sql`
          UPDATE "global_reference_counters"
          SET "next_value" = ${reserved + 1}, "updated_at" = NOW()
          WHERE "counter_key" = ${counterKey}
        `)
        return reserved
      }

      const maxSequence = await findMaxInboundOrderSequenceAcrossTenants(skuGroup)
      const nextSequence = maxSequence + 1
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "global_reference_counters" (
          "counter_key",
          "next_value",
          "updated_at"
        ) VALUES (${counterKey}, ${nextSequence + 1}, NOW())
      `)

      return nextSequence
    })
  } catch (error) {
    // Fallback: if global_reference_counters table doesn't exist, derive from existing Inbound
    const isTableMissing = error instanceof Error && error.message.includes('42P01')
    if (isTableMissing) {
      console.warn('[inbound-sequence] global_reference_counters table not found, falling back to scan-based sequence')
      const maxSequence = await findMaxInboundOrderSequenceAcrossTenants(skuGroup)
      return maxSequence + 1
    }
    throw error
  }
}

export async function getNextInboundOrderSequence(
  prisma: InboundOrderSequenceReader,
  skuGroup: string
): Promise<number> {
  const normalizedGroup = normalizeSkuGroup(skuGroup)
  return reserveNextGlobalInboundOrderSequence(prisma, normalizedGroup)
}

export async function isInboundOrderReferenceUsedAcrossTenants(reference: string): Promise<boolean> {
  const normalizedReference = reference.trim().toUpperCase()
  if (!normalizedReference) {
    return false
  }

  for (const tenantCode of TENANT_CODES) {
    const prisma = await getTenantPrismaClient(tenantCode)
    const existing = await prisma.inboundOrder.findFirst({
      where: {
        OR: [{ orderNumber: normalizedReference }, { inboundNumber: normalizedReference }],
      },
      select: { id: true },
    })
    if (existing) {
      return true
    }
  }

  return false
}

export async function getNextCommercialInvoiceSequence(
  prisma: InboundOrderReferenceReader,
  skuGroup: string
): Promise<number> {
  const normalizedGroup = normalizeSkuGroup(skuGroup)
  const records = await prisma.inboundOrder.findMany({
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
