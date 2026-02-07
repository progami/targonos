import {
  InventoryAggregationResult,
  InventoryBalanceSnapshot,
  InventoryTransactionRecord
} from './types'
import { calculatePallets, calculateUnits } from './utils/units'

export interface AggregateInventoryOptions {
  includeZeroStock?: boolean
  sort?: boolean
}

interface BalanceAccumulator extends Omit<InventoryBalanceSnapshot, 'currentUnits' | 'currentPallets'> {
  currentUnits: number
  currentPallets: number
  unitsPerCarton: number
  storageCartonsPerPallet: number | null
  shippingCartonsPerPallet: number | null
  firstReceive?: InventoryBalanceSnapshot['firstReceive']
  lastTransactionId: string | null
  lastTransactionType: string | null
  lastTransactionReference: string | null
}

export function aggregateInventoryTransactions(
  transactions: readonly InventoryTransactionRecord[],
  options: AggregateInventoryOptions = {}
): InventoryAggregationResult {
  const balances = new Map<string, BalanceAccumulator>()

  for (const transaction of transactions) {
    const key = [transaction.warehouseCode, transaction.skuCode, transaction.lotRef].join('::')
    let current = balances.get(key)

    if (!current) {
      current = {
        id: key,
        warehouseCode: transaction.warehouseCode,
        warehouseName: transaction.warehouseName,
        skuCode: transaction.skuCode,
        skuDescription: transaction.skuDescription,
        lotRef: transaction.lotRef,
        currentCartons: 0,
        currentUnits: 0,
        currentPallets: 0,
        unitsPerCarton: transaction.unitsPerCarton ?? 1,
        storageCartonsPerPallet: transaction.storageCartonsPerPallet ?? null,
        shippingCartonsPerPallet: transaction.shippingCartonsPerPallet ?? null,
        lastTransactionDate: null,
        lastTransactionId: null,
        lastTransactionType: null,
        lastTransactionReference: null,
        purchaseOrderId: null,
        purchaseOrderNumber: null,
        fulfillmentOrderId: null,
        fulfillmentOrderNumber: null,
        firstReceive: undefined
      }
      balances.set(key, current)
    }

    // Update units-per-carton if the transaction provides a more specific value
    if (transaction.unitsPerCarton && transaction.unitsPerCarton > 0) {
      current.unitsPerCarton = transaction.unitsPerCarton
    }

    current.currentCartons += (transaction.cartonsIn || 0) - (transaction.cartonsOut || 0)
    current.currentUnits = calculateUnits(current.currentCartons, current.unitsPerCarton)

    const transactionTime = transaction.transactionDate.getTime()
    const lastTime = current.lastTransactionDate?.getTime() ?? 0

    if (transactionTime >= lastTime) {
      current.lastTransactionDate = transaction.transactionDate
      current.lastTransactionId = transaction.id ?? transaction.transactionId ?? null
      current.lastTransactionType = transaction.transactionType ?? null
      current.lastTransactionReference = transaction.referenceId ?? null

      if (transaction.purchaseOrderId) {
        const poIdChanged = current.purchaseOrderId !== transaction.purchaseOrderId
        current.purchaseOrderId = transaction.purchaseOrderId

        if (transaction.purchaseOrderNumber) {
          current.purchaseOrderNumber = transaction.purchaseOrderNumber
        } else if (poIdChanged) {
          current.purchaseOrderNumber = null
        }
      } else if (transaction.purchaseOrderNumber) {
        current.purchaseOrderNumber = transaction.purchaseOrderNumber
      }

      if (transaction.fulfillmentOrderId) {
        const foIdChanged = current.fulfillmentOrderId !== transaction.fulfillmentOrderId
        current.fulfillmentOrderId = transaction.fulfillmentOrderId

        if (transaction.fulfillmentOrderNumber) {
          current.fulfillmentOrderNumber = transaction.fulfillmentOrderNumber
        } else if (foIdChanged) {
          current.fulfillmentOrderNumber = null
        }
      } else if (transaction.fulfillmentOrderNumber) {
        current.fulfillmentOrderNumber = transaction.fulfillmentOrderNumber
      }
    }

    if (transaction.storageCartonsPerPallet && transaction.storageCartonsPerPallet > 0) {
      current.storageCartonsPerPallet = transaction.storageCartonsPerPallet
    }

    if (transaction.shippingCartonsPerPallet && transaction.shippingCartonsPerPallet > 0) {
      current.shippingCartonsPerPallet = transaction.shippingCartonsPerPallet
    }

    if (transaction.transactionType === 'RECEIVE') {
      const shouldUpdateFirstReceive = !current.firstReceive ||
        transaction.transactionDate < current.firstReceive.transactionDate

      if (shouldUpdateFirstReceive) {
        current.firstReceive = {
          transactionDate: transaction.transactionDate,
          createdByName: transaction.createdByName,
          createdById: transaction.createdById
        }
      }
    }
  }

  let balanceArray: InventoryBalanceSnapshot[] = Array.from(balances.values()).map((balance) => {
    const effectiveCartonsPerPallet = resolveCartonsPerPallet(balance)

    const currentPallets = balance.currentCartons > 0
      ? calculatePallets(balance.currentCartons, effectiveCartonsPerPallet)
      : 0

    return {
      ...balance,
      currentUnits: Math.max(0, balance.currentUnits),
      currentPallets,
      storageCartonsPerPallet: balance.storageCartonsPerPallet ?? effectiveCartonsPerPallet,
      shippingCartonsPerPallet: balance.shippingCartonsPerPallet ?? effectiveCartonsPerPallet,
      lastTransactionReference: balance.lastTransactionReference
    }
  })

  if (!options.includeZeroStock) {
    balanceArray = balanceArray.filter(balance => balance.currentCartons > 0)
  }

  if (options.sort !== false) {
    balanceArray.sort((a, b) => {
      const aTime = a.lastTransactionDate ? a.lastTransactionDate.getTime() : Number.NEGATIVE_INFINITY
      const bTime = b.lastTransactionDate ? b.lastTransactionDate.getTime() : Number.NEGATIVE_INFINITY

      return bTime - aTime
    })
  }

  const lotsWithInventory = balanceArray.filter(balance => balance.currentCartons > 0).length

  return {
    balances: balanceArray,
    summary: {
      totalSkuCount: new Set(balanceArray.map(balance => balance.skuCode)).size,
      totalLotCount: balanceArray.length,
      lotsWithInventory,
      lotsOutOfStock: balanceArray.length - lotsWithInventory
    }
  }
}

function resolveCartonsPerPallet(balance: BalanceAccumulator): number {
  if (balance.storageCartonsPerPallet && balance.storageCartonsPerPallet > 0) {
    return balance.storageCartonsPerPallet
  }
  if (balance.shippingCartonsPerPallet && balance.shippingCartonsPerPallet > 0) {
    return balance.shippingCartonsPerPallet
  }
  return 1
}
