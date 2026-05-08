'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { useSession } from '@/hooks/usePortalSession'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { PageLoading } from '@/components/ui/loading-spinner'
import { Badge } from '@/components/ui/badge'
import { FileText, Search } from '@/lib/lucide-icons'
import { buildAppCallbackUrl, redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { getMovementTypeFromTransaction } from '@/lib/utils/movement-types'

type TransactionRow = {
  id: string
  transactionDate: string
  transactionType: string
  referenceId: string | null
  warehouseCode: string
  warehouseName: string
  skuCode: string
  skuDescription: string
  lotRef: string
  cartonsIn: number
  cartonsOut: number
  storagePalletsIn: number
  shippingPalletsOut: number
  unitsPerCarton: number
  createdBy?: {
    fullName?: string | null
  }
}

type TransactionsResponse = {
  transactions: TransactionRow[]
}

const TRANSACTION_DATE_FORMAT = 'MMM d, yyyy h:mm a'

function formatTransactionDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date'
  }
  return format(date, TRANSACTION_DATE_FORMAT)
}

function getTransactionCartons(row: TransactionRow) {
  const movementType = getMovementTypeFromTransaction(row.transactionType)
  if (movementType === 'negative') {
    return row.cartonsOut
  }
  return row.cartonsIn
}

function getTransactionPallets(row: TransactionRow) {
  const movementType = getMovementTypeFromTransaction(row.transactionType)
  if (movementType === 'negative') {
    return row.shippingPalletsOut
  }
  return row.storagePalletsIn
}

function getMovementBadge(row: TransactionRow) {
  const movementType = getMovementTypeFromTransaction(row.transactionType)
  if (movementType === 'positive') {
    return { label: 'Inbound', variant: 'success' as const }
  }
  if (movementType === 'negative') {
    return { label: 'Outbound', variant: 'danger' as const }
  }
  return { label: 'Flat', variant: 'neutral' as const }
}

export default function TransactionsIndexPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', buildAppCallbackUrl('/operations/transactions'))
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }
  }, [router, session, status])

  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)

      const response = await fetch(withBasePath('/api/transactions?limit=1000'), {
        credentials: 'include',
      })
      const payload = (await response.json()) as TransactionsResponse | { error: string }

      if (!response.ok) {
        if ('error' in payload && typeof payload.error === 'string') {
          throw new Error(payload.error)
        }
        throw new Error('Transactions request failed')
      }

      if (!('transactions' in payload) || !Array.isArray(payload.transactions)) {
        throw new Error('Transactions payload missing rows')
      }

      setTransactions(payload.transactions)
    } catch (error) {
      setLoadError(error instanceof Error ? error : new Error('Failed to load transactions'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTransactions()
    }
  }, [fetchTransactions, status])

  const filteredTransactions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (query.length === 0) {
      return transactions
    }

    return transactions.filter(row => {
      const fields = [
        row.referenceId,
        row.transactionType,
        row.warehouseCode,
        row.warehouseName,
        row.skuCode,
        row.skuDescription,
        row.lotRef,
        row.createdBy?.fullName,
      ]

      return fields.some(value => {
        if (typeof value !== 'string') {
          return false
        }
        return value.toLowerCase().includes(query)
      })
    })
  }, [searchTerm, transactions])

  if (status === 'loading') {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  if (!session || !['staff', 'admin'].includes(session.user.role)) {
    return null
  }

  if (loadError !== null) {
    throw loadError
  }

  if (loading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection title="Transactions" description="Operations" icon={FileText} />
      <PageContent className="flex-1 overflow-hidden px-4 py-6 sm:px-6 lg:px-8 flex flex-col">
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-white shadow-soft dark:bg-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="text-sm text-muted-foreground">
              Showing {filteredTransactions.length.toLocaleString()} of{' '}
              {transactions.length.toLocaleString()} transactions
            </div>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search transactions"
                className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto scrollbar-gutter-stable">
            <table className="w-full min-w-[1220px] table-auto text-sm">
              <thead>
                <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Ref ID
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Warehouse
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    SKU / Lot
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Cartons
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Pallets
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Units
                  </th>
                </tr>
              </thead>
              <tbody>
                {!loading && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                )}

                {filteredTransactions.map(row => {
                  const movement = getMovementBadge(row)
                  const cartons = getTransactionCartons(row)
                  const units = cartons * row.unitsPerCarton
                  const pallets = getTransactionPallets(row)

                  return (
                    <tr
                      key={row.id}
                      className="border-t border-slate-200 align-top hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {formatTransactionDate(row.transactionDate)}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/operations/transactions/${row.id}`}
                          className="text-primary hover:underline"
                          prefetch={false}
                        >
                          {row.referenceId ?? row.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge variant={movement.variant} className="uppercase text-[10px]">
                          {movement.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{row.warehouseCode}</div>
                        <div className="text-xs text-muted-foreground whitespace-normal break-words leading-5">
                          {row.warehouseName}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-foreground">
                          {row.skuCode}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {row.lotRef}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-normal break-words leading-5">
                          {row.skuDescription}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {cartons.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {pallets.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {units.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </PageContent>
    </PageContainer>
  )
}
