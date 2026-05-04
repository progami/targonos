import {
 AreaChart,
 ResponsiveContainer,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 Area
} from '@/components/charts/RechartsComponents'

function formatAxisDate(value: string) {
 if (!value) return ''
 const date = new Date(value)
 if (isNaN(date.getTime())) return ''
 return date.toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
 })
}

function formatTooltipDate(value: string) {
 if (!value) return ''
 const date = new Date(value)
 if (isNaN(date.getTime())) return ''
 return date.toLocaleDateString('en-US', {
 weekday: 'long',
 year: 'numeric',
 month: 'long',
 day: 'numeric',
 timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
 })
}

function getVisibleTickValues(data: Array<{ date: string; inventory: number }>) {
 if (data.length <= 7) return data.map(point => point.date)

 const step = Math.ceil(data.length / 6)
 const ticks = data
 .filter((_, index) => index % step === 0 || index === data.length - 1)
 .map(point => point.date)

 return Array.from(new Set(ticks))
}

interface MarketSectionProps {
 data?: {
 amazonMetrics?: {
 pendingShipments: number
 inboundInventory: number
 activeListings: number
 }
 reorderAlerts?: number
 plannedShipments?: number
 inventoryTrend?: Array<{ date: string; inventory: number }>
 }
 loading?: boolean
}

export function MarketSection({ data, loading }: MarketSectionProps) {
 if (loading) {
 return (
 <div className="flex items-center justify-center h-48">
 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
 </div>
 )
 }

 const inventoryTrend = data?.inventoryTrend ?? []
 const visibleTicks = getVisibleTickValues(inventoryTrend)

 return (
 <div>
 {/* Inventory Trend Chart */}
 {inventoryTrend.length > 0 ? (
 <div className="h-64 sm:h-72 md:h-80">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={inventoryTrend} margin={{ top: 10, right: 16, left: 8, bottom: 12 }}>
 <defs>
 <linearGradient id="colorInventory" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
 <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
 <XAxis 
 dataKey="date" 
 ticks={visibleTicks}
 tick={{ fontSize: 10 }}
 tickMargin={10}
 minTickGap={24}
 tickFormatter={formatAxisDate}
 interval={0}
 />
 <YAxis 
 tick={{ fontSize: 12 }}
 tickFormatter={(value) => value.toLocaleString()}
 />
 <Tooltip 
 contentStyle={{ 
 backgroundColor: 'rgba(255, 255, 255, 0.95)', 
 border: '1px solid #e5e7eb',
 borderRadius: '6px'
 }}
 formatter={(value: number) => [value.toLocaleString(), 'Inventory']}
 labelFormatter={formatTooltipDate}
 />
 <Area 
 type="monotone" 
 dataKey="inventory" 
 stroke="#3B82F6" 
 fillOpacity={1} 
 fill="url(#colorInventory)" 
 />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 ) : (
 <div className="flex items-center justify-center h-64 text-muted-foreground">
 No inventory data available
 </div>
 )}
 </div>
 )
}
