export type FinancialLedgerFilters = {
  startDate: string
  endDate: string
  warehouseCode: string
  category: string
}

export function createDefaultFinancialLedgerFilters(): FinancialLedgerFilters {
  return {
    startDate: '',
    endDate: '',
    warehouseCode: '',
    category: '',
  }
}

export function buildFinancialLedgerQueryString(filters: FinancialLedgerFilters): string {
  const query = new URLSearchParams()

  if (filters.startDate.trim()) {
    query.set('startDate', filters.startDate.trim())
  }

  if (filters.endDate.trim()) {
    query.set('endDate', filters.endDate.trim())
  }

  if (filters.warehouseCode.trim()) {
    query.set('warehouseCode', filters.warehouseCode.trim())
  }

  if (filters.category.trim()) {
    query.set('category', filters.category.trim())
  }

  query.set('limit', '500')

  return query.toString()
}
