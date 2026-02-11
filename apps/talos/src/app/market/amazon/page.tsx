'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSession } from '@/hooks/usePortalSession'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import {
  ShoppingCart,
  Download,
  Loader2,
  Search,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Construction,
  Hammer,
  Wrench,
  Package2,
} from '@/lib/lucide-icons'
import { toast } from 'react-hot-toast'
import { PageHeader } from '@/components/ui/page-header'
import { redirectToPortal } from '@/lib/portal'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { withBasePath } from '@/lib/utils/base-path'

interface InventoryComparison {
 sku: string
 description: string
 warehouseQty: number
 amazonQty: number
 total: number
 lastUpdated?: string
 trend?: 'up' | 'down' | 'stable'
 percentChange?: number
}

// Force cache invalidation
export default function AmazonIntegrationPage() {
 const { data: session, status } = useSession()

 // TEMPORARY: Show under construction page
 return (
 <DashboardLayout>
 <PageContainer>
 <PageHeaderSection
 title="Amazon Integration"
 description="Marketplace"
 icon={ShoppingCart}
 />
 <PageContent>

 <div className="mt-8 flex flex-col items-center justify-center text-center py-16">
 <div className="relative">
 <Construction className="h-24 w-24 text-yellow-500 mb-6" />
 <Hammer className="h-8 w-8 text-yellow-600 absolute -right-2 -top-2 animate-bounce" />
 <Wrench className="h-8 w-8 text-yellow-600 absolute -left-2 bottom-0 animate-pulse" />
 </div>
 
 <h2 className="text-2xl font-bold text-slate-900 mb-4">
 Under Construction
 </h2>
 
 <p className="text-slate-600 max-w-md mb-8">
 We're working hard to bring you the Amazon FBA Integration module. 
 This feature will allow you to sync inventory levels, manage FBA shipments, 
 and track Amazon warehouse inventory in real-time.
 </p>

 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 max-w-lg">
 <h3 className="text-lg font-semibold text-yellow-900 mb-2">
 Coming Soon Features:
 </h3>
 <ul className="text-left text-yellow-800 space-y-2">
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Real-time inventory sync with Amazon FBA</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Create and manage FBA shipment plans</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Track inventory across multiple Amazon warehouses</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>Automated replenishment alerts</span>
 </li>
 <li className="flex items-start">
 <span className="mr-2">•</span>
 <span>FBA fee calculations and analytics</span>
 </li>
 </ul>
 </div>

 <p className="text-sm text-slate-500 mt-8">
 Expected availability: Q2 2024
 </p>
 </div>
 </PageContent>
 </PageContainer>
 </DashboardLayout>
 )

 // Original code below (temporarily disabled)
 const [loading, setLoading] = useState(false)
 const [inventory, setInventory] = useState<InventoryComparison[]>([])
 const [searchTerm, setSearchTerm] = useState('')
 const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
 const [selectedView, setSelectedView] = useState<'all' | 'warehouse' | 'amazon' | 'lowstock'>('all')
 const [sortBy, setSortBy] = useState<'sku' | 'total' | 'trend'>('sku')
 const [isDemoMode, setIsDemoMode] = useState(false)

 // Generate demo data
 const generateDemoData = (): InventoryComparison[] => {
 return [
 { sku: 'SKU001', description: 'Premium Widget A', warehouseQty: 500, amazonQty: 150, total: 650, trend: 'up', percentChange: 12 },
 { sku: 'SKU002', description: 'Standard Widget B', warehouseQty: 300, amazonQty: 200, total: 500, trend: 'stable', percentChange: 0 },
 { sku: 'SKU003', description: 'Economy Widget C', warehouseQty: 50, amazonQty: 75, total: 125, trend: 'down', percentChange: -8 },
 { sku: 'SKU004', description: 'Deluxe Widget D', warehouseQty: 800, amazonQty: 300, total: 1100, trend: 'up', percentChange: 15 },
 { sku: 'SKU005', description: 'Basic Widget E', warehouseQty: 0, amazonQty: 25, total: 25, trend: 'down', percentChange: -20 },
 { sku: 'TEST-SKU-001', description: 'Test Product Alpha', warehouseQty: 200, amazonQty: 100, total: 300, trend: 'stable', percentChange: 0 },
 { sku: 'TEST-SKU-002', description: 'Test Product Beta', warehouseQty: 150, amazonQty: 50, total: 200, trend: 'up', percentChange: 5 },
 { sku: 'TEST-SKU-003', description: 'Test Product Gamma', warehouseQty: 0, amazonQty: 0, total: 0, trend: 'stable', percentChange: 0 },
 ]
 }

 useEffect(() => {
 if (isDemoMode) {
 setInventory(generateDemoData())
 setLastRefresh(new Date())
 setLoading(false)
 return
 }

 const fetchAndSyncInventory = async () => {
 setLoading(true)
 try {
 // Add timeout to prevent infinite loading
 const controller = new AbortController()
 const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
 
 // Fetch inventory comparison
 const response = await fetch(withBasePath('/api/amazon/inventory-comparison'), {
 signal: controller.signal,
 credentials: 'include',
 headers: {
 'Content-Type': 'application/json',
 }
 })
 clearTimeout(timeoutId)
 
 if (response.ok) {
 const data = await response.json()
 setInventory(data)
 setLastRefresh(new Date())
 
 // Try to sync from Amazon API to database (but don't block on it)
 fetchWithCSRF('/api/amazon/sync', {
 method: 'POST',
 body: JSON.stringify({ syncType: 'inventory' })
 }).then(async (syncResponse) => {
 if (syncResponse.ok) {
 const result = await syncResponse.json()
 if (result.synced > 0) {
 toast.success(`Synced ${result.synced} items from Amazon FBA`)
 
 // Refresh the inventory comparison after sync
 const refreshResponse = await fetch(withBasePath('/api/amazon/inventory-comparison'), {
 credentials: 'include'
 })
 if (refreshResponse.ok) {
 const refreshedData = await refreshResponse.json()
 setInventory(refreshedData)
 }
 }
 }
 }).catch(() => {
 // Silently fail sync - not critical for page load
 })
 } else {
 // If API fails, show demo data with a warning
 setInventory(generateDemoData())
 setLastRefresh(new Date())
 toast.error('Could not connect to Amazon API. Showing demo data.')
 setIsDemoMode(true)
 }
 } catch (_error) {
 // On any error, fallback to demo mode
 setInventory(generateDemoData())
 setLastRefresh(new Date())
 setIsDemoMode(true)
 
 if (_error instanceof Error && _error.name === 'AbortError') {
 toast.error('Connection timeout. Showing demo data.')
 } else {
 toast.error('Error loading inventory. Showing demo data.')
 }
 } finally {
 setLoading(false)
 }
 }

 // Only fetch if authenticated
 if (status === 'authenticated' && session?.user?.role === 'admin') {
 fetchAndSyncInventory()
 } else if (status === 'authenticated') {
 // Non-admin users see empty state
 setLoading(false)
 }
 }, [status, session, isDemoMode])

 const filteredInventory = inventory
 .filter(item => {
 const matchesSearch = item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
 item.description.toLowerCase().includes(searchTerm.toLowerCase())
 
 switch (selectedView) {
 case 'warehouse':
 return matchesSearch && item.warehouseQty > 0
 case 'amazon':
 return matchesSearch && item.amazonQty > 0
 case 'lowstock':
 return matchesSearch && item.total < 50
 default:
 return matchesSearch
 }
 })
 .sort((a, b) => {
 switch (sortBy) {
 case 'total':
 return b.total - a.total
 case 'trend':
 return (b.percentChange || 0) - (a.percentChange || 0)
 default:
 return a.sku.localeCompare(b.sku)
 }
 })

 const totalWarehouse = inventory.reduce((sum, item) => sum + item.warehouseQty, 0)
 const totalAmazon = inventory.reduce((sum, item) => sum + item.amazonQty, 0)
 const totalCombined = totalWarehouse + totalAmazon
 const skusWithStock = inventory.filter(item => item.total > 0).length
 const totalSkus = inventory.length
 const lowStockSkus = inventory.filter(item => item.total > 0 && item.total < 50).length
 const outOfStockSkus = inventory.filter(item => item.total === 0).length

 if (status === 'loading') {
 return (
 <DashboardLayout>
 <div className="flex items-center justify-center h-96">
 <Loader2 className="h-8 w-8 animate-spin" />
 </div>
 </DashboardLayout>
 )
 }

 if (!session || session.user.role !== 'admin') {
 redirectToPortal('/login', `${window.location.origin}/market/amazon`)
 return null
 }

 return (
 <DashboardLayout>
 <div className="space-y-6">
 <PageHeader
 title="Amazon Integration"
 subtitle="Inventory overview by warehouse"
 icon={Package2}
 iconColor="text-orange-600"
 bgColor="bg-orange-50"
 borderColor="border-orange-200"
 textColor="text-orange-800"
 />

 {/* Demo Mode Toggle */}
 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-yellow-800">Demo Mode</h3>
 <p className="text-xs text-yellow-600 mt-1">Toggle to use sample data without Amazon API credentials</p>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={isDemoMode}
 onChange={(e) => setIsDemoMode(e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
 </label>
 </div>
 </div>

 {/* Actions Bar */}
 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
 <div className="relative flex-1 max-w-md">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
 <input
 type="text"
 placeholder="Search by SKU or description..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="pl-10 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
 />
 </div>
 <button
 onClick={async () => {
 if (isDemoMode) {
 setInventory(generateDemoData())
 setLastRefresh(new Date())
 toast.success('Demo data refreshed')
 return
 }
 
 setLoading(true)
 try {
 // Skip warehouse setup - it should be done manually
 
 // Fetch inventory comparison
 const response = await fetch(withBasePath('/api/amazon/inventory-comparison'), {
 credentials: 'include'
 })
 if (response.ok) {
 const data = await response.json()
 setInventory(data)
 setLastRefresh(new Date())
 
 // Sync from Amazon API to database
 const syncResponse = await fetchWithCSRF('/api/amazon/sync', {
 method: 'POST',
 body: JSON.stringify({ syncType: 'inventory' })
 })
 
 if (syncResponse.ok) {
 const result = await syncResponse.json()
 if (result.synced > 0) {
 toast.success(`Synced ${result.synced} items from Amazon FBA`)
 
 // Refresh the inventory comparison after sync
 const refreshResponse = await fetch(withBasePath('/api/amazon/inventory-comparison'), {
 credentials: 'include'
 })
 if (refreshResponse.ok) {
 const refreshedData = await refreshResponse.json()
 setInventory(refreshedData)
 }
 }
 } else {
 const _errorData = await syncResponse.json()
 // console.error('Sync error:', errorData)
 toast.error('Failed to sync Amazon inventory')
 }
 } else {
 const errorData = await response.json()
 // console.error('API Error:', errorData)
 toast.error(errorData.details || 'Failed to fetch inventory comparison')
 }
 } catch (_error) {
 // console.error('Error in refresh:', error)
 if (_error instanceof Error) {
 toast.error(`Error: ${_error.message}`)
	 } else {
	 toast.error('Error refreshing data')
	 }
	 } finally {
	 setLoading(false)
 }
 }}
 disabled={loading}
 className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
 >
	 {loading ? (
	 <>
	 <Loader2 className="h-4 w-4 animate-spin" />
	 Syncing...
	 </>
	 ) : (
	 <>
	 <Download className="h-4 w-4" />
	 Sync Data
	 </>
	 )}
	 </button>
 </div>

 {/* Summary Cards */}
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <div className="bg-white dark:bg-slate-800 border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-slate-600">Warehouse Stock</h3>
 <p className="text-2xl font-bold text-slate-900 mt-1">
 {totalWarehouse.toLocaleString()}
 </p>
 <p className="text-xs text-slate-500 mt-1">units</p>
 </div>
 <Package2 className="h-8 w-8 text-slate-400" />
 </div>
 </div>
 <div className="bg-white dark:bg-slate-800 border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-slate-600">Amazon FBA</h3>
 <p className="text-2xl font-bold text-orange-600 mt-1">
 {totalAmazon.toLocaleString()}
 </p>
 <p className="text-xs text-slate-500 mt-1">units</p>
 </div>
 <Package2 className="h-8 w-8 text-orange-400" />
 </div>
 </div>
 <div className="bg-white dark:bg-slate-800 border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-slate-600">Combined Total</h3>
 <p className="text-2xl font-bold text-cyan-600 mt-1">
 {totalCombined.toLocaleString()}
 </p>
 <p className="text-xs text-slate-500 mt-1">units across all warehouses</p>
 </div>
 <BarChart3 className="h-8 w-8 text-cyan-400" />
 </div>
 </div>
 <div className="bg-white dark:bg-slate-800 border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="text-sm font-medium text-slate-600">Stock Alerts</h3>
 <p className="text-2xl font-bold text-red-600 mt-1">
 {lowStockSkus}
 </p>
 <p className="text-xs text-slate-500 mt-1">SKUs low/out of stock</p>
 </div>
 <AlertTriangle className="h-8 w-8 text-red-400" />
 </div>
 </div>
 </div>

 {/* View Filters */}
 <div className="bg-slate-50 p-4 rounded-lg">
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => setSelectedView('all')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
 selectedView === 'all'
 ? 'bg-primary text-white'
 : 'bg-white text-slate-700 hover:bg-slate-100'
 }`}
 >
 All SKUs ({totalSkus})
 </button>
 <button
 onClick={() => setSelectedView('warehouse')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
 selectedView === 'warehouse'
 ? 'bg-primary text-white'
 : 'bg-white text-slate-700 hover:bg-slate-100'
 }`}
 >
 Warehouse Only
 </button>
 <button
 onClick={() => setSelectedView('amazon')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
 selectedView === 'amazon'
 ? 'bg-primary text-white'
 : 'bg-white text-slate-700 hover:bg-slate-100'
 }`}
 >
 Amazon FBA Only
 </button>
 <button
 onClick={() => setSelectedView('lowstock')}
 className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
 selectedView === 'lowstock'
 ? 'bg-primary text-white'
 : 'bg-white text-slate-700 hover:bg-slate-100'
 }`}
 >
 Low Stock ({lowStockSkus})
 </button>
 <div className="ml-auto flex items-center gap-2">
 <label className="text-sm font-medium text-slate-700">Sort by:</label>
 <select
 value={sortBy}
 onChange={(e) => setSortBy(e.target.value as 'sku' | 'total' | 'trend')}
 className="px-3 py-1 border rounded-md text-sm"
 >
 <option value="sku">SKU</option>
 <option value="total">Total Stock</option>
 <option value="trend">Trend</option>
 </select>
 </div>
 </div>
 </div>

 {/* Inventory Table */}
 <div className="bg-white dark:bg-slate-800 border rounded-lg overflow-hidden">
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-gray-200">
 <thead className="bg-slate-50">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 SKU
 </th>
 <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
 Description
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Warehouse Units
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Amazon FBA
 </th>
 <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
 Total (Units)
 </th>
 </tr>
 </thead>
 <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200">
 {loading ? (
 <tr>
 <td colSpan={5} className="px-6 py-4 text-center">
 <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
 </td>
 </tr>
 ) : filteredInventory.length === 0 ? (
 <tr>
 <td colSpan={5} className="px-6 py-4 text-center text-slate-500">
 No inventory data found
 </td>
 </tr>
 ) : (
 filteredInventory.map((item) => {
 const hasNoStock = item.total === 0
 const isLowStock = item.total > 0 && item.total < 50
 return (
 <tr key={item.sku} className={`hover:bg-slate-50 ${hasNoStock ? 'opacity-50' : ''}`}>
 <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
 <div className="flex items-center gap-2">
 {item.sku}
 {isLowStock && (
 <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
 Low Stock
 </span>
 )}
 {hasNoStock && (
 <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
 Out of Stock
 </span>
 )}
 </div>
 </td>
 <td className="px-6 py-4 text-sm text-slate-500">
 {item.description}
 </td>
 <td className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
 item.warehouseQty === 0 ? 'text-slate-400' : 'text-slate-900'
 }`}>
 {item.warehouseQty.toLocaleString()}
 </td>
 <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
 item.amazonQty === 0 ? 'text-slate-400' : 'text-orange-600'
 }`}>
 {item.amazonQty.toLocaleString()}
 </td>
 <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
 item.total === 0 ? 'text-slate-400' : isLowStock ? 'text-red-600' : 'text-cyan-600'
 }`}>
 <div className="flex items-center justify-end gap-2">
 {item.total.toLocaleString()}
 {item.trend && (
 <TrendingUp 
 className={`h-4 w-4 ${
 item.trend === 'up' ? 'text-green-500' : 
 item.trend === 'down' ? 'text-red-500' : 
 'text-slate-400'
 }`}
 />
 )}
 </div>
 </td>
 </tr>
 )
 })
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* Analytics Summary */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div className="bg-gradient-to-r from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-4">
 <h3 className="font-semibold text-cyan-900 mb-2">Inventory Distribution</h3>
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">SKUs with stock:</span>
 <span className="font-medium">{skusWithStock} / {totalSkus}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">Warehouse coverage:</span>
 <span className="font-medium">{((totalWarehouse / totalCombined) * 100).toFixed(1)}%</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">Amazon FBA coverage:</span>
 <span className="font-medium">{((totalAmazon / totalCombined) * 100).toFixed(1)}%</span>
 </div>
 </div>
 </div>
 <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
 <h3 className="font-semibold text-red-900 mb-2">Stock Health</h3>
 <div className="space-y-2">
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">Low stock SKUs:</span>
 <span className="font-medium text-orange-600">{lowStockSkus}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">Out of stock SKUs:</span>
 <span className="font-medium text-red-600">{outOfStockSkus}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-slate-600">Healthy stock SKUs:</span>
 <span className="font-medium text-green-600">{skusWithStock - lowStockSkus}</span>
 </div>
 </div>
 </div>
 </div>

 {/* Info Note */}
 <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-4">
 <p className="text-sm text-cyan-800">
 <strong>Note:</strong> This page displays inventory levels across all warehouses. Showing {skusWithStock} of {totalSkus} SKUs with stock.
 The total column shows the combined inventory across all warehouses.
 </p>
 </div>

 {/* Amazon API Status */}
 {lastRefresh && (
 <div className={`border rounded-lg p-4 ${isDemoMode ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
 <p className={`text-sm ${isDemoMode ? 'text-yellow-800' : 'text-green-800'}`}>
 <strong>{isDemoMode ? 'Demo Mode Active:' : 'Amazon FBA Connected:'}</strong> {isDemoMode ? 'Using sample data for testing' : 'Production API active'}. Last synced: {lastRefresh.toLocaleString()}
	 <br />{isDemoMode ? 'Toggle off demo mode to connect to real Amazon FBA API' : 'Click "Sync Data" to sync the latest inventory from Amazon FBA'}.
	 </p>
 </div>
 )}
 </div>
 </DashboardLayout>
 )
}
