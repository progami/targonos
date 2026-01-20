/**
 * Purchase Order utility functions.
 * Contains helpers for order number formatting, batch resolution, and type mapping.
 */

import { createHash } from 'crypto'
import { ValidationError } from '@/lib/api'

export const SYSTEM_FALLBACK_ID = 'system'
export const SYSTEM_FALLBACK_NAME = 'System'
export const ORDER_NUMBER_SEPARATOR = '::'

/**
 * Convert internal order number to public-facing format
 */
export function toPublicOrderNumber(orderNumber: string): string {
  const [publicValue] = orderNumber.split(ORDER_NUMBER_SEPARATOR)
  return publicValue
}

/**
 * Normalize nullable string value - returns null for empty/whitespace strings
 */
export function normalizeNullable(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}


/**
 * Generate a deterministic hash from seed parts
 */
export function generateBatchHash(seedParts: string[]): string {
  const hash = createHash('sha256')
  for (const part of seedParts) {
    hash.update(part)
    hash.update('::')
  }
  const hexDigest = hash.digest('hex')
  const numericValue = BigInt('0x' + hexDigest) % (10n ** 12n)
  return numericValue.toString().padStart(12, '0')
}

/**
 * Resolve batch from raw input (required)
 */
export function resolveBatchLot(params: {
  rawBatchLot?: string | null
  orderNumber: string
  warehouseCode: string
  skuCode: string
  transactionDate: Date
}): string {
  const normalized = normalizeNullable(params.rawBatchLot)
  if (!normalized) {
    throw new ValidationError(`Batch is required for SKU ${params.skuCode}`)
  }

  return normalized
}
