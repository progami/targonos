'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
	import {
	 Package, AlertCircle,
	 Download, Loader2, Clock, BarChart3,
	 ArrowUp, Search,
	 ShoppingCart, Settings, Link2 as LinkIcon, X, Truck
	} from '@/lib/lucide-icons'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { 
 SHIPMENT_PLANNING_CONFIG, 
 getStockUrgency, 
 getUrgencyReason 
} from '@/lib/config/shipment-planning'
import { 
 calculateRestockMetrics, 
 optimizeShipmentQuantity,
 RestockCalculationInput,
 RestockCalculationResult 
} from '@/lib/algorithms/restock-algorithm'
import { RestockAlertCard } from '@/components/operations/restock-alert-card'
import { usePageState } from '@/lib/store/page-state'
import { redirectToPortal } from '@/lib/portal'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'

const PAGE_KEY = '/market/shipment-planning'

interface FBAStockItem {
 skuId: string
 skuCode: string
 description: string
 warehouseStock: number
 fbaStock: number
 unitsPerCarton: number
 dailySalesVelocity: number
 editedVelocity?: number
 daysOfStock: number
 suggestedShipmentCartons: number
 reorderPoint: number
 optimalShipmentCartons: number
 lastUpdated: string
 restockMetrics?: RestockCalculationResult
}

interface ShipmentSuggestion {
 skuCode: string
 description: string
 currentFBAStock: number
 suggestedCartons: number
 urgency: 'critical' | 'high' | 'medium' | 'low'
 reason: string
}

export default function ShipmentPlanningPage() {
 const router = useRouter()
 const { data: session, status } = useSession()
 const pageState = usePageState(PAGE_KEY)
 const [loading, setLoading] = useState(true)
 const [refreshing, setRefreshing] = useState(false)
 const [stockItems, setStockItems] = useState<FBAStockItem[]>([])
 const [suggestions, setSuggestions] = useState<ShipmentSuggestion[]>([])
 const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
 const showOnlyLowStock = (pageState.custom?.showOnlyLowStock as boolean) ?? true
 const setShowOnlyLowStock = (value: boolean) => pageState.setCustom('showOnlyLowStock', value)
 const searchQuery = pageState.search ?? ''
 const setSearchQuery = pageState.setSearch
 const [lowStockCount, setLowStockCount] = useState(0)
 const viewMode = (pageState.custom?.viewMode as 'table' | 'cards') ?? 'table'
 const setViewMode = (value: 'table' | 'cards') => pageState.setCustom('viewMode', value)
 const showAmazonStatus = (pageState.custom?.showAmazonStatus as boolean) ?? false
 const setShowAmazonStatus = (value: boolean) => pageState.setCustom('showAmazonStatus', value)

 useEffect(() => {
 if (status === 'loading') return
 if (!session) {
 redirectToPortal('/login', `${window.location.origin}/market/shipment-planning`)
 return
 }
 fetchStockData()
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [session, status])

 const fetchStockData = async () => {
 try {
 setLoading(true)
 
 // API removed - return empty data
 const data: unknown[] = []
 /*
 // Fetch FBA stock levels
 const response = await fetch('/api/amazon/inventory-comparison')
 if (response.ok) {
 const data = await response.json()
 */
 
 // Transform data to include analytics
 const enrichedData: FBAStockItem[] = data.map((item: unknown) => {
 const stockItem = item as Record<string, unknown>
 // TODO: Replace with actual sales velocity from analytics
 // For now, use a configurable default or 0 if not available
 const dailySalesVelocity = (stockItem.dailySalesVelocity as number) || SHIPMENT_PLANNING_CONFIG.DEFAULT_DAILY_SALES_VELOCITY
 const daysOfStock = (stockItem.amazonQty as number) > 0 && dailySalesVelocity > 0 
 ? Math.floor((stockItem.amazonQty as number) / dailySalesVelocity) 
 : 0
 
 // Use configuration values
 const targetDaysOfStock = SHIPMENT_PLANNING_CONFIG.TARGET_DAYS_OF_STOCK
 const _reorderDays = SHIPMENT_PLANNING_CONFIG.REORDER_DAYS
 const defaultCartonsPerPallet = (stockItem.cartonsPerPallet as number) || SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET
 
 // Calculate restock metrics using the new algorithm
 const restockInput: RestockCalculationInput = {
 currentStock: stockItem.amazonQty as number,
 dailySalesVelocity,
 leadTimeDays: 7, // Default lead time, TODO: make configurable
 safetyStockDays: 7, // Default safety stock, TODO: make configurable
 unitsPerCarton: (stockItem.unitsPerCarton as number) || 1,
 cartonsPerPallet: defaultCartonsPerPallet,
 targetStockDays: targetDaysOfStock
 }
 
 const restockMetrics = calculateRestockMetrics(restockInput)
 
 // Optimize shipment quantity
 const { optimizedCartons, pallets: _pallets } = optimizeShipmentQuantity(
 restockMetrics.suggestedCartons,
 defaultCartonsPerPallet
 )

 return {
 skuId: stockItem.skuId as string,
 skuCode: stockItem.sku as string,
 description: stockItem.description as string,
 warehouseStock: stockItem.warehouseQty as number,
 fbaStock: stockItem.amazonQty as number,
 unitsPerCarton: (stockItem.unitsPerCarton as number) || 1,
 dailySalesVelocity,
 daysOfStock,
 suggestedShipmentCartons: restockMetrics.suggestedCartons,
 reorderPoint: restockMetrics.restockPoint,
 optimalShipmentCartons: optimizedCartons,
 lastUpdated: (stockItem.lastUpdated as string) || new Date().toISOString(),
 restockMetrics
 }
 })
 
 setStockItems(enrichedData)
 generateSuggestions(enrichedData)
 
 // Count low stock items
 const lowStock = enrichedData.filter(item => 
 item.daysOfStock <= SHIPMENT_PLANNING_CONFIG.LOW_STOCK_THRESHOLD_DAYS && 
 item.warehouseStock > 0
 )
 setLowStockCount(lowStock.length)
 //}
 } catch (_error) {
 toast.error('Failed to load FBA stock data')
 } finally {
 setLoading(false)
 }
 }

 const generateSuggestions = (items: FBAStockItem[]) => {
 const newSuggestions: ShipmentSuggestion[] = []
 
 items.forEach(item => {
 const urgency = item.restockMetrics?.urgencyLevel || getStockUrgency(item.daysOfStock)
 const reason = item.restockMetrics?.recommendation || getUrgencyReason(item.daysOfStock, urgency)
 
 if (urgency !== 'low' && item.warehouseStock > 0) {
 newSuggestions.push({
 skuCode: item.skuCode,
 description: item.description,
 currentFBAStock: item.fbaStock,
 suggestedCartons: item.optimalShipmentCartons,
 urgency,
 reason
 })
 }
 })
 
 // Sort by urgency score if available, otherwise by urgency level
 newSuggestions.sort((a, b) => {
 const itemA = items.find(i => i.skuCode === a.skuCode)
 const itemB = items.find(i => i.skuCode === b.skuCode)
 
 if (itemA?.restockMetrics?.urgencyScore && itemB?.restockMetrics?.urgencyScore) {
 return itemB.restockMetrics.urgencyScore - itemA.restockMetrics.urgencyScore
 }
 
 const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 }
 return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
 })
 
 setSuggestions(newSuggestions)
 }

	 const handleRefresh = async () => {
	 setRefreshing(true)
 
try {
// Sync with Amazon
 const syncResponse = await fetchWithCSRF('/api/amazon/sync', {
 method: 'POST',
 body: JSON.stringify({ syncType: 'inventory' })
 })
 
	 if (syncResponse.ok) {
	 toast.success('FBA stock data synced')
	 await fetchStockData()
	 }
	 } catch (_error) {
	 toast.error('Failed to sync FBA data')
	 } finally {
	 setRefreshing(false)
	 }
	 }

 const updateVelocity = (skuCode: string, newVelocity: number) => {
 setStockItems(prevItems => 
 prevItems.map(item => {
 if (item.skuCode === skuCode) {
 const velocity = newVelocity || item.dailySalesVelocity
 const daysOfStock = item.fbaStock > 0 && velocity > 0 
 ? Math.floor(item.fbaStock / velocity) 
 : 0
 
 // Recalculate restock metrics with new velocity
 const restockInput: RestockCalculationInput = {
 currentStock: item.fbaStock,
 dailySalesVelocity: velocity,
 leadTimeDays: 7,
 safetyStockDays: 7,
 unitsPerCarton: item.unitsPerCarton || 1,
 cartonsPerPallet: SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET,
 targetStockDays: SHIPMENT_PLANNING_CONFIG.TARGET_DAYS_OF_STOCK
 }
 
 const restockMetrics = calculateRestockMetrics(restockInput)
 const { optimizedCartons } = optimizeShipmentQuantity(
 restockMetrics.suggestedCartons,
 SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET
 )
 
 return {
 ...item,
 editedVelocity: newVelocity,
 dailySalesVelocity: velocity,
 daysOfStock,
 suggestedShipmentCartons: restockMetrics.suggestedCartons,
 reorderPoint: restockMetrics.restockPoint,
 optimalShipmentCartons: optimizedCartons,
 restockMetrics
 }
 }
 return item
 })
 )
 }

 const _handleCreateShipment = () => {
 if (selectedItems.size === 0) {
 toast.error('Please select at least one item to ship')
 return
 }

 // Shipping is handled via the Purchase Order workflow.
 router.push('/operations/purchase-orders')
 }

 const filteredStockItems = stockItems.filter(item => {
 const matchesSearch = searchQuery === '' || 
 item.skuCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
 item.description.toLowerCase().includes(searchQuery.toLowerCase())
 
 const matchesStockFilter = !showOnlyLowStock || item.daysOfStock <= SHIPMENT_PLANNING_CONFIG.LOW_STOCK_THRESHOLD_DAYS
 
 return matchesSearch && matchesStockFilter
 })

 const getStockStatusColor = (daysOfStock: number) => {
 if (daysOfStock <= SHIPMENT_PLANNING_CONFIG.URGENCY_LEVELS.CRITICAL) return 'text-red-600'
 if (daysOfStock <= SHIPMENT_PLANNING_CONFIG.URGENCY_LEVELS.HIGH) return 'text-orange-600'
 if (daysOfStock <= SHIPMENT_PLANNING_CONFIG.URGENCY_LEVELS.MEDIUM) return 'text-yellow-600'
 return 'text-green-600'
 }

 const getUrgencyBadge = (urgency: string) => {
 const colors = {
 critical: 'bg-red-100 text-red-800',
 high: 'bg-orange-100 text-orange-800',
 medium: 'bg-yellow-100 text-yellow-800',
 low: 'bg-green-100 text-green-800'
 }
 return colors[urgency as keyof typeof colors] || colors.low
 }

 if (loading) {
 return (
 <DashboardLayout>
 <div className="flex items-center justify-center h-96">
 <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent " />
 </div>
 </DashboardLayout>
 )
 }

 return (
 <DashboardLayout>
 <PageContainer>
 <PageHeaderSection
 title="Shipment Planning"
 description="Marketplace"
 icon={Truck}
 actions={
 <div className="flex items-center gap-2">
 <button
 onClick={() => setShowAmazonStatus(!showAmazonStatus)}
 className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-soft text-sm font-medium text-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50"
 >
 <LinkIcon className="h-4 w-4 mr-2" />
 Amazon Integration
 </button>
	 <button
	 onClick={handleRefresh}
	 disabled={refreshing}
	 className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-soft text-sm font-medium text-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 disabled:opacity-50"
	 >
	 {refreshing ? (
	 <Loader2 className="h-4 w-4 mr-2 animate-spin" />
	 ) : (
	 <Download className="h-4 w-4 mr-2" />
	 )}
	 Sync FBA Data
	 </button>
 <Link
 href="/operations/purchase-orders"
 className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-soft text-sm font-medium text-white bg-primary hover:bg-primary/90 ${selectedItems.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}
 >
 <ShoppingCart className="h-4 w-4 mr-2" />
 Create Shipment Plan ({selectedItems.size})
 </Link>
 </div>
 }
 />
 <PageContent>

 {/* Amazon Integration Status */}
 {showAmazonStatus && (
 <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
 <div className="flex items-start gap-3">
 <Settings className="h-5 w-5 text-cyan-600 mt-0.5" />
 <div className="flex-1">
 <h3 className="text-sm font-medium text-cyan-900">Amazon Integration Status</h3>
 <p className="text-sm text-cyan-700 mt-1">
 Integration not yet configured. Future SP API integration will enable:
 </p>
 <ul className="mt-2 space-y-1 text-sm text-cyan-700">
 <li>• Automatic inventory sync</li>
 <li>• Direct shipment creation to Amazon</li>
 <li>• Real-time FBA fee calculations</li>
 <li>• Shipment tracking updates</li>
 </ul>
 <button className="mt-3 text-sm font-medium text-cyan-900 hover:text-cyan-800">
 Configure Integration →
 </button>
 </div>
 <button
 onClick={() => setShowAmazonStatus(false)}
 className="text-cyan-400 hover:text-cyan-600"
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 </div>
 )}

 {/* Low Stock Alert */}
 {lowStockCount > 0 && (
 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
 <div className="flex items-center gap-2">
 <AlertCircle className="h-5 w-5 text-yellow-600" />
 <span className="text-sm font-medium text-yellow-900">
 {lowStockCount} items below {SHIPMENT_PLANNING_CONFIG.LOW_STOCK_THRESHOLD_DAYS} days of stock
 </span>
 </div>
 </div>
 )}

 {/* Filters */}
 <div className="flex items-center justify-between gap-4">
 <div className="flex-1 max-w-lg">
 <div className="relative">
 <input
 type="text"
 placeholder="Search by SKU or description..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
 />
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
 </div>
 </div>
 <div className="flex items-center gap-4">
 <label className="flex items-center gap-2">
 <input
 type="checkbox"
 checked={showOnlyLowStock}
 onChange={(e) => setShowOnlyLowStock(e.target.checked)}
 className="rounded border-slate-300"
 />
 <span className="text-sm">Show only low stock items</span>
 </label>
 <div className="flex items-center gap-2 border-l pl-4">
 <button
 onClick={() => setViewMode('table')}
 className={`p-2 rounded ${viewMode === 'table' ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
 title="Table view"
 >
 <BarChart3 className="h-4 w-4" />
 </button>
 <button
 onClick={() => setViewMode('cards')}
 className={`p-2 rounded ${viewMode === 'cards' ? 'bg-slate-200' : 'hover:bg-slate-100'}`}
 title="Card view"
 >
 <Package className="h-4 w-4" />
 </button>
 </div>
 </div>
 </div>

 {/* Stock Display */}
 {viewMode === 'cards' ? (
 <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
 {filteredStockItems
 .filter(item => item.restockMetrics && item.restockMetrics.urgencyLevel !== 'low')
 .map((item) => (
 <RestockAlertCard
 key={item.skuCode}
 skuCode={item.skuCode}
 description={item.description}
 currentStock={item.fbaStock}
 dailySalesVelocity={item.dailySalesVelocity}
 daysOfStock={item.daysOfStock}
 restockPoint={item.restockMetrics?.restockPoint || 0}
 suggestedQuantity={item.restockMetrics?.optimalOrderQuantity || 0}
 suggestedCartons={item.optimalShipmentCartons}
 suggestedPallets={item.restockMetrics?.suggestedPallets || 0}
 urgencyLevel={item.restockMetrics?.urgencyLevel || 'low'}
 urgencyScore={item.restockMetrics?.urgencyScore || 0}
 recommendation={item.restockMetrics?.recommendation || ''}
 leadTimeDays={7} // TODO: make configurable
 safetyStockDays={7} // TODO: make configurable
 onSelect={(selected) => {
 const newSelected = new Set(selectedItems)
 if (selected) {
 newSelected.add(item.skuCode)
 } else {
 newSelected.delete(item.skuCode)
 }
 setSelectedItems(newSelected)
 }}
 isSelected={selectedItems.has(item.skuCode)}
 />
 ))
 }
 </div>
 ) : (
 <div className="border rounded-lg overflow-hidden">
 <table className="min-w-full divide-y divide-gray-200">
 <thead className="bg-slate-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 Select
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 SKU
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 Description
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Warehouse Stock
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 FBA Stock
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Daily Velocity
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Days of Stock
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Suggested Shipment
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 Recommendation
 </th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200">
 {filteredStockItems.map((item) => (
 <tr key={item.skuCode} className="hover:bg-slate-50">
 <td className="px-6 py-4 whitespace-nowrap">
 <input
 type="checkbox"
 checked={selectedItems.has(item.skuCode)}
 onChange={(e) => {
 const newSelected = new Set(selectedItems)
 if (e.target.checked) {
 newSelected.add(item.skuCode)
 } else {
 newSelected.delete(item.skuCode)
 }
 setSelectedItems(newSelected)
 }}
 className="rounded border-slate-300"
 disabled={item.warehouseStock === 0}
 />
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
 {item.skuCode}
 </td>
 <td className="px-6 py-4 text-sm text-slate-500">
 {item.description}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">
 {item.warehouseStock.toLocaleString()}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-slate-900">
 {item.fbaStock.toLocaleString()}
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
 <input
 type="number"
 value={item.editedVelocity !== undefined ? item.editedVelocity : item.dailySalesVelocity}
 onChange={(e) => updateVelocity(item.skuCode, parseFloat(e.target.value) || 0)}
 className="w-20 px-2 py-1 text-right border rounded focus:outline-none focus:ring-1 focus:ring-primary"
 min="0"
 step="0.1"
 />
 <span className="text-xs text-slate-500 ml-1">/day</span>
 </td>
 <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
 item.daysOfStock <= SHIPMENT_PLANNING_CONFIG.URGENCY_LEVELS.CRITICAL 
 ? 'bg-red-50' 
 : item.daysOfStock <= SHIPMENT_PLANNING_CONFIG.URGENCY_LEVELS.HIGH 
 ? 'bg-orange-50'
 : ''
 }`}>
 <div className="flex items-center justify-end gap-2">
 <span className={`font-medium ${getStockStatusColor(item.daysOfStock)}`}>
 {item.daysOfStock} days
 </span>
 {item.restockMetrics && (
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyBadge(item.restockMetrics.urgencyLevel)}`}>
 {item.restockMetrics.urgencyLevel}
 </span>
 )}
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
 {item.suggestedShipmentCartons > 0 ? (
 <div>
 <div className="font-medium text-slate-900">
 {item.optimalShipmentCartons} cartons
 </div>
 <div className="text-xs text-slate-500">
 ({Math.ceil(item.optimalShipmentCartons / SHIPMENT_PLANNING_CONFIG.DEFAULT_CARTONS_PER_PALLET)} pallets)
 </div>
 </div>
 ) : (
 <span className="text-slate-400">-</span>
 )}
 </td>
 <td className="px-6 py-4 text-sm">
 {item.restockMetrics?.urgencyLevel !== 'low' && (
 <div className="space-y-1">
 <div className="text-xs font-medium text-slate-900">
 {item.restockMetrics?.recommendation}
 </div>
 {item.daysOfStock < SHIPMENT_PLANNING_CONFIG.LOW_STOCK_THRESHOLD_DAYS && (
 <button
 onClick={() => setSelectedItems(new Set([...selectedItems, item.skuCode]))}
 className="text-xs text-primary hover:text-primary/80 font-medium"
 >
 Add to shipment →
 </button>
 )}
 </div>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}

 {/* Summary Stats */}
 <div className="grid gap-4 md:grid-cols-4">
 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">Critical Items</p>
 <p className="text-2xl font-bold text-red-600">
 {suggestions.filter(s => s.urgency === 'critical').length}
 </p>
 </div>
 <AlertCircle className="h-8 w-8 text-red-400" />
 </div>
 </div>
 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">High Priority</p>
 <p className="text-2xl font-bold text-orange-600">
 {suggestions.filter(s => s.urgency === 'high').length}
 </p>
 </div>
 <ArrowUp className="h-8 w-8 text-orange-400" />
 </div>
 </div>
 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">Total SKUs</p>
 <p className="text-2xl font-bold">
 {stockItems.length}
 </p>
 </div>
 <Package className="h-8 w-8 text-slate-400" />
 </div>
 </div>
 <div className="border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-muted-foreground">Last Updated</p>
 <p className="text-sm font-medium">
 {stockItems[0]?.lastUpdated 
 ? new Date(stockItems[0].lastUpdated).toLocaleString()
 : 'Never'}
 </p>
 </div>
 <Clock className="h-8 w-8 text-slate-400" />
 </div>
 </div>
 </div>
 </PageContent>
 </PageContainer>
 </DashboardLayout>
 )
}
