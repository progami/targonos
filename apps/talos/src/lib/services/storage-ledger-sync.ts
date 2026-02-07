import { endOfWeek } from 'date-fns'
import { recordStorageCostEntry } from '@/services/storageCost.service'

export interface StorageLedgerRecalcInput {
  warehouseCode: string
  warehouseName: string
  skuCode: string
  skuDescription: string
  lotRef: string
  transactionDate: Date
}

export async function recalculateStorageLedgerForTransactions(
  inputs: StorageLedgerRecalcInput[]
): Promise<void> {
  if (inputs.length === 0) return

  const deduped = new Map<string, StorageLedgerRecalcInput>()

  for (const input of inputs) {
    const weekEnding = endOfWeek(input.transactionDate, { weekStartsOn: 1 })
    const key = `${input.warehouseCode}::${input.skuCode}::${input.lotRef}::${weekEnding.toISOString()}`
    if (!deduped.has(key)) {
      deduped.set(key, input)
    }
  }

  const entries = Array.from(deduped.values())
  const errors: unknown[] = []

  await Promise.all(
    entries.map(async (entry) => {
      try {
        await recordStorageCostEntry(entry)
      } catch (error) {
        errors.push(error)
      }
    })
  )

  if (errors.length > 0) {
    console.warn('[storage-ledger] Failed to recalculate some weekly entries', {
      errors: errors.map((error) => (error instanceof Error ? error.message : String(error))),
    })
  }
}
