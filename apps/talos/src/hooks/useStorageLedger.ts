import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { withBasePath } from '@/lib/utils/base-path'

export interface StorageEntry {
 id: string
 warehouseCode: string
 warehouseName: string
 skuCode: string
 skuDescription: string
 lotRef: string
 weekEndingDate: string
 closingBalance: number
 averageBalance: number
 closingPallets: number
 palletDays: number
 storageRatePerPalletDay?: number
 totalStorageCost?: number
 isCostCalculated: boolean
 rateEffectiveDate?: string
 createdAt: string
}

export interface StorageSummary {
 totalEntries: number
 entriesWithCosts: number
 totalPalletDays: number
 totalStorageCost: number
 costCalculationRate: string
}

export interface StorageLedgerFilters {
 warehouse?: string
 startDate: string
 endDate: string
 includeCosts?: boolean
}

export function useStorageLedger(filters: StorageLedgerFilters) {
 const [entries, setEntries] = useState<StorageEntry[]>([])
 const [summary, setSummary] = useState<StorageSummary>({
 totalEntries: 0,
 entriesWithCosts: 0,
 totalPalletDays: 0,
 totalStorageCost: 0,
 costCalculationRate: '0'
 })
 const [pagination, setPagination] = useState({
 page: 1,
 limit: 50,
 totalCount: 0,
 totalPages: 0,
 hasNext: false,
 hasPrev: false
 })
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState<string | null>(null)

 const fetchStorageData = useCallback(async (page = 1) => {
 try {
 setLoading(true)
 setError(null)
 
 const params = new URLSearchParams({
 startDate: filters.startDate,
 endDate: filters.endDate,
 includeCosts: filters.includeCosts ? 'true' : 'false',
 page: page.toString(),
 limit: '50'
 })
 
 if (filters.warehouse) params.set('warehouseCode', filters.warehouse)
 
 const response = await fetch(withBasePath(`/api/finance/storage-ledger?${params}`), {
 credentials: 'include',
 })
 
 if (!response.ok) {
 throw new Error(`Failed to fetch storage data: ${response.status}`)
 }
 
 const data = await response.json()
 setEntries(data.entries)
 setPagination(data.pagination)
 if (data.summary) setSummary(data.summary)
 } catch (fetchError) {
 const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error'
 setError(errorMessage)
 toast.error(`Failed to load storage ledger: ${errorMessage}`)
 } finally {
 setLoading(false)
 }
 }, [filters.startDate, filters.endDate, filters.warehouse, filters.includeCosts])

 useEffect(() => {
 const timer = setTimeout(() => {
 fetchStorageData(1)
 }, 100)
 return () => clearTimeout(timer)
 }, [fetchStorageData])

 const loadPage = useCallback((page: number) => {
 fetchStorageData(page)
 }, [fetchStorageData])

 const exportData = useCallback(async (format: 'csv' | 'json' = 'csv') => {
 try {
 const params = new URLSearchParams({
 startDate: filters.startDate,
 endDate: filters.endDate,
 format
 })
 
 if (filters.warehouse) params.set('warehouseCode', filters.warehouse)
 
 const response = await fetch(withBasePath(`/api/finance/storage-ledger/export?${params}`), {
 credentials: 'include',
 })
 
 if (!response.ok) {
 throw new Error(`Export failed: ${response.status}`)
 }
 
 if (format === 'csv') {
 const blob = await response.blob()
 const url = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `storage-ledger-${filters.startDate}-to-${filters.endDate}.csv`
 document.body.appendChild(a)
 a.click()
 window.URL.revokeObjectURL(url)
 document.body.removeChild(a)
 toast.success('Storage ledger exported successfully')
 } else {
 const data = await response.json()
 const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
 const url = window.URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = `storage-ledger-${filters.startDate}-to-${filters.endDate}.json`
 document.body.appendChild(a)
 a.click()
 window.URL.revokeObjectURL(url)
 document.body.removeChild(a)
 toast.success('Storage ledger exported successfully')
 }
 } catch (exportError) {
 const errorMessage = exportError instanceof Error ? exportError.message : 'Export failed'
 toast.error(errorMessage)
 }
 }, [filters])

 return {
 entries,
 summary,
 pagination,
 loading,
 error,
 refetch: () => fetchStorageData(1),
 loadPage,
 exportData
 }
}
