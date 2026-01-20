'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/loading-spinner'
import {
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  Upload,
} from '@/lib/lucide-icons'

type IncompleteTransaction = {
  id: string
  transactionType: 'RECEIVE' | 'SHIP' | 'ADJUST_IN' | 'ADJUST_OUT'
  skuCode: string
  transactionDate: string
  missingFields: string[]
}

type AttachmentCategory = {
  id: string
  label: string
}

const RECEIVE_CATEGORIES: AttachmentCategory[] = [
  { id: 'commercial_invoice', label: 'Commercial Invoice' },
  { id: 'bill_of_lading', label: 'Bill of Lading' },
  { id: 'packing_list', label: 'Packing List' },
  { id: 'movement_note', label: 'Movement Note' },
  { id: 'cube_master', label: 'Cube Master' },
  { id: 'transaction_certificate', label: 'TC GRS' },
  { id: 'custom_declaration', label: 'CDS' },
]

const SHIP_CATEGORIES: AttachmentCategory[] = [
  { id: 'packing_list', label: 'Packing List' },
  { id: 'movement_note', label: 'Movement Note' },
]

const ADJUSTMENT_CATEGORIES: AttachmentCategory[] = [{ id: 'proof_of_pickup', label: 'Proof of Pickup' }]

function getCategoriesForType(type: IncompleteTransaction['transactionType']): AttachmentCategory[] {
  if (type === 'RECEIVE') return RECEIVE_CATEGORIES
  if (type === 'SHIP') return SHIP_CATEGORIES
  return ADJUSTMENT_CATEGORIES
}

function titleCaseMissingField(value: string): string {
  if (value === 'tracking_number') return 'Tracking Number'
  if (value === 'pickup_date') return 'Pickup Date'
  if (value === 'attachments') return 'Attachments'
  return value
}

export default function InventoryIncompletePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<IncompleteTransaction[]>([])

  const [trackingDraft, setTrackingDraft] = useState<Record<string, string>>({})
  const [pickupDraft, setPickupDraft] = useState<Record<string, string>>({})

  const loadTransactions = useCallback(async () => {
    try {
      const response = await fetch('/api/inventory/incomplete', { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load incomplete transactions')
      }

      const data = (await response.json()) as IncompleteTransaction[]
      setTransactions(data)

      const nextTracking: Record<string, string> = {}
      const nextPickup: Record<string, string> = {}

      for (const tx of data) {
        if (tx.missingFields.includes('tracking_number')) {
          nextTracking[tx.id] = ''
        }
        if (tx.missingFields.includes('pickup_date')) {
          nextPickup[tx.id] = ''
        }
      }

      setTrackingDraft(nextTracking)
      setPickupDraft(nextPickup)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load incomplete transactions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/operations/inventory/incomplete')}`)
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }

    setLoading(true)
    void loadTransactions()
  }, [loadTransactions, router, session, status])

  const isEmpty = !loading && transactions.length === 0

  const summary = useMemo(() => {
    const receiveCount = transactions.filter(tx => tx.transactionType === 'RECEIVE').length
    const shipCount = transactions.filter(tx => tx.transactionType === 'SHIP').length
    const otherCount = transactions.length - receiveCount - shipCount

    return { receiveCount, shipCount, otherCount }
  }, [transactions])

  const handleUpload = async (transactionId: string, documentType: string, file: File) => {
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('documentType', documentType)

      const response = await fetchWithCSRF(`/api/transactions/${transactionId}/attachments`, {
        method: 'POST',
        body,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Upload failed')
      }

      toast.success('Document uploaded')
      void loadTransactions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    }
  }

  const handleSaveMetadata = async (transactionId: string) => {
    try {
      const payload: Record<string, unknown> = {}

      const trackingNumber = trackingDraft[transactionId]
      if (trackingNumber !== undefined) {
        payload.trackingNumber = trackingNumber.trim() ? trackingNumber.trim() : null
      }

      const pickupDate = pickupDraft[transactionId]
      if (pickupDate !== undefined) {
        payload.pickupDate = pickupDate
      }

      const response = await fetchWithCSRF(`/api/transactions/${transactionId}/attributes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const bodyJson = await response.json().catch(() => null)
        throw new Error(bodyJson?.error ?? 'Failed to update transaction')
      }

      toast.success('Transaction updated')
      void loadTransactions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update transaction')
    }
  }

  if (status === 'loading' || loading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title="Incomplete Transactions"
        description="Operations"
        icon={AlertTriangle}
        backHref={withBasePath('/operations/inventory')}
        backLabel="Inventory"
        metadata={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{transactions.length} total</Badge>
            {summary.receiveCount > 0 ? <Badge variant="default">{summary.receiveCount} RECEIVE</Badge> : null}
            {summary.shipCount > 0 ? <Badge variant="default">{summary.shipCount} SHIP</Badge> : null}
            {summary.otherCount > 0 ? <Badge variant="secondary">{summary.otherCount} other</Badge> : null}
          </div>
        }
      />

      <PageContent className="flex flex-col gap-6">
        {isEmpty ? (
          <div className="rounded-xl border bg-white dark:bg-slate-800 p-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">All set</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No incomplete transactions found for your warehouse.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map(tx => {
              const missingLabels = tx.missingFields.map(titleCaseMissingField)
              const categories = getCategoriesForType(tx.transactionType)

              const showTracking = tx.missingFields.includes('tracking_number')
              const showPickup = tx.missingFields.includes('pickup_date')

              return (
                <div key={tx.id} className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft">
                  <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={tx.transactionType === 'RECEIVE' ? 'success' : 'info'}>
                          {tx.transactionType}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">{tx.skuCode}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(tx.transactionDate).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {missingLabels.map(label => (
                          <span
                            key={label}
                            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        <span className="font-mono">{tx.id}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={withBasePath(`/operations/transactions/${tx.id}`)} prefetch={false}>
                          View transaction
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Metadata</h3>

                      {showTracking ? (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Tracking number</label>
                          <Input
                            value={trackingDraft[tx.id] ?? ''}
                            onChange={event =>
                              setTrackingDraft(prev => ({ ...prev, [tx.id]: event.target.value }))
                            }
                            placeholder="Enter tracking number"
                          />
                        </div>
                      ) : null}

                      {showPickup ? (
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Pickup date</label>
                          <Input
                            type="date"
                            value={pickupDraft[tx.id] ?? ''}
                            onChange={event => setPickupDraft(prev => ({ ...prev, [tx.id]: event.target.value }))}
                          />
                        </div>
                      ) : null}

                      {(showTracking || showPickup) ? (
                        <div>
                          <Button type="button" onClick={() => handleSaveMetadata(tx.id)} size="sm">
                            Save metadata
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No missing metadata for this transaction.</p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-foreground">Attachments</h3>

                      <div className="rounded-lg border bg-muted/10">
                        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                          {categories.map(category => {
                            return (
                              <div key={category.id} className="rounded-lg border bg-white dark:bg-slate-900 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground">{category.label}</p>
                                    <p className="mt-1 text-xs text-muted-foreground font-mono">{category.id}</p>
                                  </div>
                                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="mt-3">
                                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                                    <Upload className="h-4 w-4" />
                                    Upload
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={event => {
                                        const file = event.target.files?.[0]
                                        if (!file) return
                                        void handleUpload(tx.id, category.id, file)
                                        event.target.value = ''
                                      }}
                                    />
                                  </label>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Uploads go to S3 via `POST /api/transactions/:id/attachments`.
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageContent>
    </PageContainer>
  )
}
