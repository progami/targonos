import { useState, useMemo } from 'react'
import { Calculator, Download, Loader2 } from '@/lib/lucide-icons'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { PageTabs } from '@/components/ui/page-tabs'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'

interface StorageLedgerHeaderProps {
 aggregationView: 'weekly' | 'monthly'
 onAggregationChange: (view: 'weekly' | 'monthly') => void
 onExport: () => void
 onRefresh?: () => void
}

export function StorageLedgerHeader({
 aggregationView,
 onAggregationChange,
 onExport,
 onRefresh,
}: StorageLedgerHeaderProps) {
 const [isCalculating, setIsCalculating] = useState(false)

 const handleWeeklySync = async () => {
 if (isCalculating) return

 setIsCalculating(true)
 try {
 const response = await fetchWithCSRF('/api/finance/storage-calculation/weekly', {
   method: 'POST',
   body: JSON.stringify({
     weekEndingDate: new Date().toISOString(),
     forceRecalculate: false,
   }),
 })

 if (!response.ok) {
 throw new Error(`Weekly sync failed: ${response.status}`)
 }

 const result = await response.json()
 toast.success(`Weekly sync completed: ${result.processed} entries processed, ${result.costCalculated} costs calculated`)

 if (onRefresh) {
 onRefresh()
 }
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error'
 toast.error(`Weekly sync failed: ${message}`)
 } finally {
 setIsCalculating(false)
 }
 }

 const aggregationTabs = useMemo(() => [
   { value: 'weekly', label: 'Weekly' },
   { value: 'monthly', label: 'Monthly' },
 ], [])

 return (
   <div className="flex flex-wrap items-center gap-3">
     <PageTabs
       tabs={aggregationTabs}
       value={aggregationView}
       onChange={(value) => onAggregationChange(value as 'weekly' | 'monthly')}
       variant="pills"
     />

	 <Button
	 onClick={handleWeeklySync}
	 disabled={isCalculating}
	 className="gap-2"
	 >
	 {isCalculating ? (
	 <Loader2 className="h-4 w-4 animate-spin" />
	 ) : (
	 <Calculator className="h-4 w-4" />
	 )}
	 {isCalculating ? 'Syncing…' : 'Weekly Sync'}
	 </Button>

 <Button
 onClick={onExport}
 variant="outline"
 className="gap-2"
 >
 <Download className="h-4 w-4" />
 Export
 </Button>
 </div>
 )
}
