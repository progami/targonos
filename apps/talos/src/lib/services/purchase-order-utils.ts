/**
 * Purchase Order utility functions.
 * Contains helpers for order number formatting and data normalization.
 */

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
