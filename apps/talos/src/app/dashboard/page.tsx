'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from '@/hooks/usePortalSession'
import { useRouter } from 'next/navigation'
import { useClientLogger } from '@/hooks/useClientLogger'
import {
 Home,
 TrendingUp,
 Calendar,
 ChevronDown,
 Package,
 FileText,
 Warehouse,
 Plus,
 ArrowRight,
} from '@/lib/lucide-icons'
import Link from 'next/link'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { SectionHeader } from '@/components/dashboard/section-header'
import { MarketSection } from '@/components/dashboard/market-section'
import { StatsCard, StatsCardGrid } from '@/components/ui/stats-card'
import { Button } from '@/components/ui/button'
import { DashboardSkeleton } from '@/components/common/loading-state'
import { toast } from 'react-hot-toast'
import { startOfMonth, endOfMonth, subMonths } from 'date-fns'

interface DashboardStats {
 totalInventory: number
 inventoryChange: string
 inventoryTrend: 'up' | 'down' | 'neutral'
 storageCost: string
 costChange: string
 costTrend: 'up' | 'down' | 'neutral'
 activeSkus: number
}


interface TimeRange {
 label: string
 value: string
 startDate: Date
 endDate: Date
}

interface ChartData {
 inventoryTrend: Array<{ date: string; inventory: number }>
 costTrend: Array<{ date: string; cost: number }>
 warehouseDistribution: Array<{ name: string; value: number; percentage: number }>
 recentTransactions: Array<{
 id: string
 type: string
 sku: string
 quantity: number
 warehouse: string
 date: string
 details?: string
 }>
 // Market data
 amazonMetrics?: {
 pendingShipments: number
 inboundInventory: number
 activeListings: number
 }
 reorderAlerts?: number
 plannedShipments?: number
}

export default function DashboardPage() {
 const { data: session, status } = useSession()
 const router = useRouter()
 const { logAction, logPerformance, logError } = useClientLogger()
 const [stats, setStats] = useState<DashboardStats | null>(null)
 const [chartData, setChartData] = useState<ChartData | null>(null)
 const [loadingStats, setLoadingStats] = useState(true)
 const [selectedTimeRange, setSelectedTimeRange] = useState('yearToDate')
 const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false)
 const [hasError, setHasError] = useState(false)
 
 // Trust middleware auth check - don't redirect on client
 // The middleware already validates the portal session
 useEffect(() => {
 // Commented out to trust middleware auth
 // if (status === 'unauthenticated') {
 // router.push('/auth/login?callbackUrl=/dashboard')
 // }
 }, [status, router])
 
 // Always use real data, never demo data
 const useDemoData = false
 const _isAdmin = session?.user?.role === 'admin'
 
 const timeRanges: Record<string, TimeRange> = useMemo(() => ({
 current: {
 label: 'Current Month',
 value: 'current',
 startDate: startOfMonth(new Date()),
 endDate: endOfMonth(new Date())
 },
 last30: {
 label: 'Last 30 Days',
 value: 'last30',
 startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
 endDate: new Date()
 },
 last90: {
 label: 'Last 90 Days',
 value: 'last90',
 startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
 endDate: new Date()
 },
 lastMonth: {
 label: 'Last Month',
 value: 'lastMonth',
 startDate: startOfMonth(subMonths(new Date(), 1)),
 endDate: endOfMonth(subMonths(new Date(), 1))
 },
 yearToDate: {
 label: 'Year to Date',
 value: 'yearToDate',
 startDate: new Date(new Date().getFullYear(), 0, 1),
 endDate: new Date()
 },
 lastYear: {
 label: 'Last Year',
 value: 'lastYear',
 startDate: new Date(new Date().getFullYear() - 1, 0, 1),
 endDate: new Date(new Date().getFullYear() - 1, 11, 31)
 }
 }), [])

 const fetchDashboardStats = useCallback(async () => {
 const startTime = performance.now()
 
 try {
 logAction('dashboard_stats_fetch_started', { timeRange: selectedTimeRange })
 const params = new URLSearchParams({
 timeRange: selectedTimeRange,
 startDate: timeRanges[selectedTimeRange].startDate.toISOString(),
 endDate: timeRanges[selectedTimeRange].endDate.toISOString()
 })
 
 const response = await fetch(`/api/dashboard/stats?${params}`)
 
 if (response.ok) {
 const data = await response.json()
 setStats(data.stats || data)
 
 // Use real chart data from API
 if (data.chartData) {
 setChartData(data.chartData)
 }
 
 const duration = performance.now() - startTime
 logPerformance('dashboard_stats_fetch', duration, {
 timeRange: selectedTimeRange,
 hasData: !!data
 })
 } else {
 setHasError(true)
 const errorText = await response.text()
 try {
 const errorData = JSON.parse(errorText)
 toast.error(errorData.details || errorData.error || 'Failed to load dashboard stats')
 } catch {
 toast.error(`API Error (${response.status}): ${errorText}`)
 }
 }
 } catch (_error) {
 const duration = performance.now() - startTime
 logError('Failed to fetch dashboard stats', _error)
 logPerformance('dashboard_stats_fetch_error', duration)
 setHasError(true)
 
	 // Check if it's an authentication error
	 if (_error instanceof Error && _error.message.includes('401')) {
	 const callbackUrl = '/dashboard'
	 router.push(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
	 } else {
	 toast.error(_error instanceof Error ? _error.message : 'Failed to load dashboard stats')
	 }
	 } finally {
	 setLoadingStats(false)
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [selectedTimeRange, timeRanges, logAction, logPerformance, logError])


 // Fetch data when authenticated or when time range changes
 useEffect(() => {
 if (status === 'authenticated') {
 fetchDashboardStats()
 }
 }, [status, selectedTimeRange, fetchDashboardStats])

 // Show loading only while checking authentication
 if (status === 'loading') {
 return (
 <DashboardLayout>
 <div className="flex items-center justify-center h-96">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent " />
 </div>
 </DashboardLayout>
 )
 }

 // If unauthenticated, the useEffect redirect will handle it
 if (status === 'unauthenticated' || !session) {
 return (
 <DashboardLayout>
 <div className="flex items-center justify-center h-96">
 <div className="text-center">
 <p className="text-slate-500">Redirecting to login...</p>
 </div>
 </div>
 </DashboardLayout>
 )
 }

 // Show loading while fetching stats (only for authenticated users)
 if (loadingStats) {
 return (
 <DashboardLayout>
 <PageContainer>
 <DashboardSkeleton />
 </PageContainer>
 </DashboardLayout>
 )
 }

 // Show error state if data fetch failed
 if (hasError && !stats && !useDemoData) {
 return (
 <DashboardLayout>
 <div className="flex items-center justify-center h-96">
 <div className="text-center space-y-4">
 <p className="text-red-500 text-lg">Failed to load dashboard data</p>
 <p className="text-slate-500">Please check your connection and try again</p>
 <button
 onClick={() => {
 setHasError(false)
 fetchDashboardStats()
 }}
 className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
 >
 Retry
 </button>
 </div>
 </div>
 </DashboardLayout>
 )
 }


 // Prepare data for sections
 const marketData = {
 data: {
 amazonMetrics: chartData?.amazonMetrics,
 reorderAlerts: chartData?.reorderAlerts,
 plannedShipments: chartData?.plannedShipments,
 inventoryTrend: chartData?.inventoryTrend
 }
 }

 const _opsData = {
 data: {
 totalInventory: stats?.totalInventory,
 inventoryChange: stats?.inventoryChange,
 inventoryTrend: stats?.inventoryTrend,
 activeSkus: stats?.activeSkus,
 warehouseDistribution: chartData?.warehouseDistribution,
 recentTransactions: chartData?.recentTransactions
 }
 }

 return (
 <DashboardLayout>
 <PageContainer>
 <PageHeaderSection
 title="Dashboard"
 description="Home"
 icon={Home}
 metadata={
 <div className="relative">
 <button
 onClick={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
 className="flex items-center gap-2 px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors min-h-[44px] bg-white dark:bg-slate-900"
 >
 <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
 <span className="text-xs sm:text-sm">
 <span className="sm:hidden">{selectedTimeRange === 'yearToDate' ? 'YTD' : selectedTimeRange === 'current' ? 'Current' : selectedTimeRange === 'last30' ? '30d' : selectedTimeRange === 'last90' ? '90d' : selectedTimeRange === 'lastMonth' ? 'Last Mo' : 'Last Yr'}</span>
 <span className="hidden sm:inline">{timeRanges[selectedTimeRange].label}</span>
 </span>
 <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />
 </button>
 {showTimeRangeDropdown && (
 <div className="absolute right-0 mt-2 w-40 sm:w-44 md:w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10">
 {Object.entries(timeRanges).map(([key, range]) => (
 <button
 key={key}
 onClick={() => {
 setSelectedTimeRange(key)
 setShowTimeRangeDropdown(false)
 }}
 className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 ${selectedTimeRange === key ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
 >
 {range.label}
 </button>
 ))}
 </div>
 )}
 </div>
 }
 />
 <PageContent>
 {/* Quick Actions */}
 <div className="flex flex-wrap gap-3 mb-6">
 <Button asChild size="sm" className="gap-2">
 <Link href="/operations/purchase-orders/new">
 <Plus className="h-4 w-4" />
 New Purchase Order
 </Link>
 </Button>
 <Button asChild variant="outline" size="sm" className="gap-2">
 <Link href="/operations/inventory">
 <Package className="h-4 w-4" />
 View Inventory
 </Link>
 </Button>
 <Button asChild variant="outline" size="sm" className="gap-2">
 <Link href="/config/products">
 <ArrowRight className="h-4 w-4" />
 Manage Products
 </Link>
 </Button>
 </div>

 {/* Stats Cards */}
 <StatsCardGrid cols={4} className="mb-6">
 <StatsCard
 title="Total Inventory"
 value={stats?.totalInventory ?? 0}
 subtitle="units"
 icon={Package}
 variant={stats?.inventoryTrend === 'up' ? 'success' : stats?.inventoryTrend === 'down' ? 'danger' : 'default'}
 trend={stats?.inventoryChange ? {
 value: parseFloat(stats.inventoryChange.replace('%', '').replace('+', '')),
 label: 'vs last period'
 } : undefined}
 />
 <StatsCard
 title="Active SKUs"
 value={stats?.activeSkus ?? 0}
 subtitle="products"
 icon={FileText}
 variant="info"
 />
 <StatsCard
 title="Storage Cost"
 value={stats?.storageCost ?? '$0'}
 icon={Warehouse}
 variant={stats?.costTrend === 'down' ? 'success' : stats?.costTrend === 'up' ? 'warning' : 'default'}
 trend={stats?.costChange ? {
 value: parseFloat(stats.costChange.replace('%', '').replace('+', '')),
 label: 'vs last period'
 } : undefined}
 />
 <StatsCard
 title="Period"
 value={timeRanges[selectedTimeRange].label}
 icon={Calendar}
 variant="default"
 onClick={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
 />
 </StatsCardGrid>

 {/* Main Dashboard Sections */}
 <div className="grid gap-4">
 {/* Market Section - Inventory Level Graph Only */}
 <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800">
 <SectionHeader 
 title="Inventory Levels" 
 icon={TrendingUp} 
 description={`Daily inventory trend - ${timeRanges[selectedTimeRange].label}`}
 />
 <MarketSection data={marketData.data} loading={loadingStats} />
 </div>
 </div>

 </PageContent>
 </PageContainer>
 </DashboardLayout>
 )
}
