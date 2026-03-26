/**
 * Pallet calculation utilities for inventory transactions.
 * These functions handle the logic for calculating storage and shipping pallet counts.
 */

// Standard pallet dimensions (mm)
const PALLET_LENGTH_MM = 1200
const PALLET_WIDTH_MM = 1000
const DEFAULT_MAX_HEIGHT_MM = 1050

export type TransactionTypeForPallets = 'RECEIVE' | 'SHIP' | 'ADJUST_IN' | 'ADJUST_OUT'

export interface PalletCalculationInput {
  transactionType: TransactionTypeForPallets
  cartons: number
  storageCartonsPerPallet?: number | null
  shippingCartonsPerPallet?: number | null
  providedStoragePallets?: number
  providedShippingPallets?: number
  providedPallets?: number
  cartonLengthCm?: number | null
  cartonWidthCm?: number | null
  cartonHeightCm?: number | null
  maxPalletHeightMm?: number | null
}

export interface PalletCalculationResult {
  storagePalletsIn: number
  shippingPalletsOut: number
}

/**
 * Calculate pallets from physical carton dimensions against a standard 1200x1000mm pallet.
 * Max height defaults to 1050mm but is configurable per warehouse (e.g. 1600mm for V Global).
 *
 * Formula:
 *   cartonsPerLayer = max(floor(1200/L) × floor(1000/W), floor(1200/W) × floor(1000/L))
 *   layersPerPallet = floor(maxHeight/H)
 *   cartonsPerPallet = cartonsPerLayer × layersPerPallet
 *   pallets = ceil(N / cartonsPerPallet)
 */
export function calculatePalletsFromDimensions(
  cartons: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
  maxHeightMm?: number
): number {
  if (cartons <= 0 || lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
    return 0
  }

  const L = lengthCm * 10
  const W = widthCm * 10
  const H = heightCm * 10

  const orientation1 = Math.floor(PALLET_LENGTH_MM / L) * Math.floor(PALLET_WIDTH_MM / W)
  const orientation2 = Math.floor(PALLET_LENGTH_MM / W) * Math.floor(PALLET_WIDTH_MM / L)
  const cartonsPerLayer = Math.max(orientation1, orientation2)

  const layersPerPallet = Math.floor((maxHeightMm ?? DEFAULT_MAX_HEIGHT_MM) / H)
  const cartonsPerPallet = cartonsPerLayer * layersPerPallet

  if (cartonsPerPallet <= 0) {
    return 0
  }

  return Math.ceil(cartons / cartonsPerPallet)
}

/**
 * Calculate the number of storage pallets based on cartons and cartons per pallet
 */
export function calculateStoragePallets(
  cartons: number,
  cartonsPerPallet: number | null | undefined
): number {
  if (!cartonsPerPallet || cartonsPerPallet <= 0) {
    return 0
  }
  return Math.ceil(cartons / Math.max(1, cartonsPerPallet))
}

/**
 * Calculate the number of shipping pallets based on cartons and cartons per pallet
 */
export function calculateShippingPallets(
  cartons: number,
  cartonsPerPallet: number | null | undefined
): number {
  if (!cartonsPerPallet || cartonsPerPallet <= 0) {
    return 0
  }
  return Math.ceil(cartons / Math.max(1, cartonsPerPallet))
}

/**
 * Determine if a transaction type is inbound (RECEIVE or ADJUST_IN)
 */
export function isInboundTransaction(transactionType: TransactionTypeForPallets): boolean {
  return transactionType === 'RECEIVE' || transactionType === 'ADJUST_IN'
}

/**
 * Determine if a transaction type is outbound (SHIP or ADJUST_OUT)
 */
export function isOutboundTransaction(transactionType: TransactionTypeForPallets): boolean {
  return transactionType === 'SHIP' || transactionType === 'ADJUST_OUT'
}

/**
 * Calculate final pallet values for a transaction, considering overrides and calculated values.
 *
 * Priority for inbound storage pallets:
 * 1. Manual override (providedStoragePallets or providedPallets)
 * 2. Dimension-based calculation (cartonLengthCm × cartonWidthCm × cartonHeightCm)
 * 3. Config-based calculation (storageCartonsPerPallet)
 */
export function calculatePalletValues(input: PalletCalculationInput): PalletCalculationResult {
  const {
    transactionType,
    cartons,
    storageCartonsPerPallet,
    shippingCartonsPerPallet,
    providedStoragePallets,
    providedShippingPallets,
    providedPallets,
    cartonLengthCm,
    cartonWidthCm,
    cartonHeightCm,
    maxPalletHeightMm,
  } = input

  const isInbound = isInboundTransaction(transactionType)
  const isOutbound = isOutboundTransaction(transactionType)

  // Storage pallets (for inbound)
  let storagePalletsIn = 0
  if (isInbound) {
    const hasStorageOverride = providedStoragePallets !== undefined || providedPallets !== undefined
    if (hasStorageOverride) {
      storagePalletsIn = Number(providedStoragePallets ?? providedPallets ?? 0)
    } else if (cartonLengthCm && cartonWidthCm && cartonHeightCm) {
      storagePalletsIn = calculatePalletsFromDimensions(cartons, cartonLengthCm, cartonWidthCm, cartonHeightCm, maxPalletHeightMm ?? undefined)
      // Fall back to config if dimensions yield 0 (carton too large for pallet)
      if (storagePalletsIn <= 0) {
        storagePalletsIn = calculateStoragePallets(cartons, storageCartonsPerPallet)
      }
    } else {
      storagePalletsIn = calculateStoragePallets(cartons, storageCartonsPerPallet)
    }
  }

  // Shipping pallets (for outbound)
  let shippingPalletsOut = 0
  if (isOutbound) {
    const calculatedShipping = calculateShippingPallets(cartons, shippingCartonsPerPallet)
    const hasShippingOverride = providedShippingPallets !== undefined || providedPallets !== undefined
    const overrideValue = Number(providedShippingPallets ?? providedPallets ?? 0)
    shippingPalletsOut = hasShippingOverride ? overrideValue : calculatedShipping
  }

  return {
    storagePalletsIn,
    shippingPalletsOut,
  }
}
