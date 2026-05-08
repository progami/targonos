'use client'

import { Package, Archive, DollarSign, Calculator } from '@/lib/lucide-icons'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import { formatCurrencyForCode } from '@/lib/dashboard/currency'
import type { StorageSummary } from '@/hooks/useStorageLedger'

interface StorageCostSummaryProps {
  summary: StorageSummary
  currency: string
}

export function StorageCostSummary({ summary, currency }: StorageCostSummaryProps) {
  return (
    <StatsCardGrid cols={4}>
      <StatsCard
        title="Total Entries"
        value={summary.totalEntries}
        subtitle="Storage records"
        icon={Package}
        variant="default"
      />
      <StatsCard
        title="Total Pallet Days"
        value={summary.totalPalletDays}
        subtitle="Billed in period"
        icon={Archive}
        variant="info"
      />
      <StatsCard
        title="Total Storage Cost"
        value={formatCurrencyForCode(summary.totalStorageCost, currency)}
        subtitle="All entries"
        icon={DollarSign}
        variant="default"
      />
      <StatsCard
        title="Costs Calculated"
        value={`${summary.entriesWithCosts}/${summary.totalEntries}`}
        subtitle={`${summary.costCalculationRate}% complete`}
        icon={Calculator}
        variant="default"
      />
    </StatsCardGrid>
  )
}
