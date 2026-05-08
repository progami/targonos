import { StorageCostSummary } from './StorageCostSummary'
import type { StorageSummary } from '@/hooks/useStorageLedger'

interface StorageLedgerStatsProps {
  summary: StorageSummary
  currency: string
}

export function StorageLedgerStats({ summary, currency }: StorageLedgerStatsProps) {
  return <StorageCostSummary summary={summary} currency={currency} />
}
