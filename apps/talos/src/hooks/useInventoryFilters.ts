import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePageState } from '@/lib/store'
import { getMovementTypeFromTransaction, type MovementType } from '@/lib/utils/movement-types'

export interface ColumnFiltersState {
  warehouse: string[]
  sku: string[]
  skuDescription: string
  lot: string[]
  lastTransaction: string
  movement: MovementType[]
  cartonsMin: string
  cartonsMax: string
  palletsMin: string
  palletsMax: string
  unitsMin: string
  unitsMax: string
}

export type ColumnFilterKey = keyof ColumnFiltersState
export type SortKey = 'warehouse' | 'sku' | 'lot' | 'cartons' | 'pallets' | 'units' | 'lastTransaction'

export interface SortConfig {
  key: SortKey
  direction: 'asc' | 'desc'
}

const createColumnFilterDefaults = (): ColumnFiltersState => ({
  warehouse: [],
  sku: [],
  skuDescription: '',
  lot: [],
  lastTransaction: '',
  movement: [],
  cartonsMin: '',
  cartonsMax: '',
  palletsMin: '',
  palletsMax: '',
  unitsMin: '',
  unitsMax: '',
})

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

export interface InventoryBalance {
  id: string
  warehouseId: string | null
  warehouse: {
    code: string
    name: string
  }
  skuId: string | null
  sku: {
    skuCode: string
    description: string
    unitsPerCarton: number
  }
  lotRef: string
  currentCartons: number
  currentPallets: number
  currentUnits: number
  storageCartonsPerPallet?: number
  shippingCartonsPerPallet?: number
  lastTransactionDate: string | null
  lastTransactionId?: string
  lastTransactionType?: string
  lastTransactionReference?: string | null
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  fulfillmentOrderId?: string | null
  fulfillmentOrderNumber?: string | null
  receiveTransaction?: {
    createdBy?: {
      fullName: string
    }
    transactionDate: string
  }
}

interface UseInventoryFiltersOptions {
  pageKey: string
  balances: InventoryBalance[]
  formatTimestamp?: (value: string | Date | null | undefined) => string | null
}

export function useInventoryFilters({
  pageKey,
  balances,
  formatTimestamp,
}: UseInventoryFiltersOptions) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => createColumnFilterDefaults())
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const pageState = usePageState(pageKey)

  // Restore persisted state after hydration
  useEffect(() => {
    setHydrated(true)
    const persistedFilters = pageState.custom?.columnFilters as ColumnFiltersState | undefined
    const persistedSort = pageState.sort
    if (persistedFilters) {
      setColumnFilters(prev => ({ ...prev, ...persistedFilters }))
    }
    if (persistedSort) {
      setSortConfig({ key: persistedSort.field as SortKey, direction: persistedSort.direction })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist column filters when they change
  useEffect(() => {
    if (hydrated) {
      pageState.setCustom('columnFilters', columnFilters)
    }
  }, [columnFilters, hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist sort config when it changes
  useEffect(() => {
    if (hydrated && sortConfig) {
      pageState.setSort(sortConfig.key, sortConfig.direction)
    }
  }, [sortConfig, hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSort = useCallback((key: SortKey) => {
    setSortConfig(current => {
      if (current?.key === key) {
        if (current.direction === 'asc') {
          return { key, direction: 'desc' }
        }
        return null
      }
      return { key, direction: 'asc' }
    })
  }, [])

  const updateColumnFilter = useCallback(<K extends ColumnFilterKey>(key: K, value: ColumnFiltersState[K]) => {
    setColumnFilters(prev => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  const toggleMultiValueFilter = useCallback(
    (key: 'warehouse' | 'sku' | 'lot', value: string) => {
      setColumnFilters(prev => {
        const current = prev[key] as string[]
        const nextValues = current.includes(value)
          ? current.filter(item => item !== value)
          : [...current, value]
        return {
          ...prev,
          [key]: nextValues as ColumnFiltersState[typeof key],
        }
      })
    },
    []
  )

  const clearColumnFilter = useCallback((keys: ColumnFilterKey[]) => {
    setColumnFilters(prev => {
      const defaults = createColumnFilterDefaults()
      const next = { ...prev }
      for (const key of keys) {
        switch (key) {
          case 'warehouse':
            next.warehouse = defaults.warehouse
            break
          case 'sku':
            next.sku = defaults.sku
            break
          case 'skuDescription':
            next.skuDescription = defaults.skuDescription
            break
          case 'lot':
            next.lot = defaults.lot
            break
          case 'lastTransaction':
            next.lastTransaction = defaults.lastTransaction
            break
          case 'cartonsMin':
            next.cartonsMin = defaults.cartonsMin
            break
          case 'cartonsMax':
            next.cartonsMax = defaults.cartonsMax
            break
          case 'palletsMin':
            next.palletsMin = defaults.palletsMin
            break
          case 'palletsMax':
            next.palletsMax = defaults.palletsMax
            break
          case 'unitsMin':
            next.unitsMin = defaults.unitsMin
            break
          case 'unitsMax':
            next.unitsMax = defaults.unitsMax
            break
          case 'movement':
            next.movement = defaults.movement
            break
          default:
            break
        }
      }
      return next
    })
  }, [])

  const isFilterActive = useCallback(
    (keys: ColumnFilterKey[]) =>
      keys.some(key => {
        const value = columnFilters[key]
        return Array.isArray(value) ? value.length > 0 : value.trim().length > 0
      }),
    [columnFilters]
  )

  const uniqueWarehouseOptions = useMemo(() => {
    const map = new Map<string, string>()
    balances.forEach((balance) => {
      const code = balance.warehouse.code?.trim() || balance.warehouse.name?.trim()
      if (!code) return
      if (!map.has(code)) {
        map.set(code, code)
      }
    })
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [balances])

  const uniqueSkuOptions = useMemo(() => {
    const map = new Map<string, string>()
    balances.forEach(balance => {
      const code = balance.sku.skuCode?.trim()
      if (!code) return
      if (!map.has(code)) {
        const description = balance.sku.description?.trim()
        map.set(code, description ? `${code} — ${description}` : code)
      }
    })
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [balances])

  const uniqueLotOptions = useMemo(() => {
    const set = new Set<string>()
    balances.forEach(balance => {
      const lotRef = balance.lotRef?.trim()
      if (lotRef) {
        set.add(lotRef)
      }
    })
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b)).map(value => ({
      value,
      label: value,
    }))
  }, [balances])

  const balanceDateToTime = (value: string | null) => {
    if (!value) {
      return 0
    }
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const processedBalances = useMemo(() => {
    const filtered = balances.filter(balance => {
      const movementType = getMovementTypeFromTransaction(balance.lastTransactionType)

      if (columnFilters.warehouse.length > 0) {
        const warehouseIdentifier = (balance.warehouse.code || balance.warehouse.name || balance.warehouseId)?.toString().trim()
        if (!warehouseIdentifier || !columnFilters.warehouse.includes(warehouseIdentifier)) {
          return false
        }
      }

      if (columnFilters.sku.length > 0) {
        const skuCode = balance.sku.skuCode?.trim()
        if (!skuCode || !columnFilters.sku.includes(skuCode)) {
          return false
        }
      }

      if (columnFilters.skuDescription) {
        const description = balance.sku.description?.trim().toLowerCase() ?? ''
        if (!description.includes(columnFilters.skuDescription.toLowerCase())) {
          return false
        }
      }

      if (columnFilters.lot.length > 0) {
        const lotRef = balance.lotRef?.trim()
        if (!lotRef || !columnFilters.lot.includes(lotRef)) {
          return false
        }
      }

      if (columnFilters.movement.length > 0 && !columnFilters.movement.includes(movementType)) {
        return false
      }

      if (columnFilters.lastTransaction && formatTimestamp) {
        const lastTransactionDisplay = formatTimestamp(balance.lastTransactionDate) ?? 'N/A'
        const filterValue = columnFilters.lastTransaction.toLowerCase()
        const typeMatch = balance.lastTransactionType
          ? balance.lastTransactionType.toLowerCase().includes(filterValue)
          : false
        if (
          !lastTransactionDisplay.toLowerCase().includes(filterValue) &&
          !typeMatch
        ) {
          return false
        }
      }

      const cartonsMin = parseNumber(columnFilters.cartonsMin)
      const cartonsMax = parseNumber(columnFilters.cartonsMax)
      if (cartonsMin !== null && balance.currentCartons < cartonsMin) {
        return false
      }
      if (cartonsMax !== null && balance.currentCartons > cartonsMax) {
        return false
      }

      const palletsMin = parseNumber(columnFilters.palletsMin)
      const palletsMax = parseNumber(columnFilters.palletsMax)
      if (palletsMin !== null && balance.currentPallets < palletsMin) {
        return false
      }
      if (palletsMax !== null && balance.currentPallets > palletsMax) {
        return false
      }

      const unitsMin = parseNumber(columnFilters.unitsMin)
      const unitsMax = parseNumber(columnFilters.unitsMax)
      if (unitsMin !== null && balance.currentUnits < unitsMin) {
        return false
      }
      if (unitsMax !== null && balance.currentUnits > unitsMax) {
        return false
      }

      return true
    })

    if (!sortConfig) {
      return filtered
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0

      switch (sortConfig.key) {
        case 'warehouse':
          comparison = (a.warehouse.code?.trim() || a.warehouse.name?.trim() || '').localeCompare(
            b.warehouse.code?.trim() || b.warehouse.name?.trim() || '',
            undefined,
            { sensitivity: 'base' }
          )
          break
        case 'sku':
          comparison = `${a.sku.skuCode} ${a.sku.description}`.localeCompare(
            `${b.sku.skuCode} ${b.sku.description}`,
            undefined,
            { sensitivity: 'base' }
          )
          break
        case 'lot':
          comparison = a.lotRef.localeCompare(b.lotRef, undefined, { sensitivity: 'base' })
          break
        case 'cartons':
          comparison = a.currentCartons - b.currentCartons
          break
        case 'pallets':
          comparison = a.currentPallets - b.currentPallets
          break
        case 'units':
          comparison = a.currentUnits - b.currentUnits
          break
        case 'lastTransaction': {
          const timeA = balanceDateToTime(a.lastTransactionDate)
          const timeB = balanceDateToTime(b.lastTransactionDate)
          comparison = timeA - timeB
          break
        }
        default:
          comparison = 0
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [balances, columnFilters, sortConfig, formatTimestamp])

  return {
    columnFilters,
    sortConfig,
    handleSort,
    updateColumnFilter,
    toggleMultiValueFilter,
    clearColumnFilter,
    isFilterActive,
    uniqueWarehouseOptions,
    uniqueSkuOptions,
    uniqueLotOptions,
    processedBalances,
  }
}
