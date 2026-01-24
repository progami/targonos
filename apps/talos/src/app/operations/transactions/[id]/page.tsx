'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import {
  Package2,
  Truck,
  Loader2,
  FileText,
  DollarSign,
  Paperclip,
} from '@/lib/lucide-icons'
import { TabbedContainer, TabPanel } from '@/components/ui/tabbed-container'
import { type ApiAttachment } from '@/components/operations/edit-attachments-tab'

const INVENTORY_LEDGER_PATH = '/operations/inventory'

interface TransactionData {
  id: string
  transactionId: string
  transactionType: 'RECEIVE' | 'SHIP' | 'ADJUST_IN' | 'ADJUST_OUT'
  transactionDate: string
  referenceId: string
  warehouseId: string
  warehouse: {
    id: string
    code: string
    name: string
  }
  shipName?: string
  trackingNumber?: string
  supplier?: string
  pickupDate?: string
  skuCode: string
  cartonsIn: number
  cartonsOut: number
  attachments?: Record<string, ApiAttachment | null>
  calculatedCosts?: Array<{
    id: string
    costCategory?: string
    quantity?: number
    unitRate?: number
    totalCost?: number
    category?: string
    description?: string
    rate?: number
    amount?: number
  }>
  costs?: Array<{
    id?: string
    costType?: string
    costName?: string
    quantity?: number
    unitRate?: number
    totalCost?: number
  }>
  createdBy?: {
    fullName?: string
    email?: string
  }
  history?: Array<Record<string, unknown>>
  lineItems: Array<{
    id: string
    skuId: string
    sku: {
      id: string
      skuCode: string
      description: string
      unitsPerCarton: number
    }
    batchLot: string
    cartonsIn: number
    cartonsOut: number
    storagePalletsIn: number
    shippingPalletsOut: number
    storageCartonsPerPallet?: number
    shippingCartonsPerPallet?: number
    unitsPerCarton?: number
  }>
}

export default function TransactionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [transaction, setTransaction] = useState<TransactionData | null>(null)
  const [activeTab, setActiveTab] = useState('details')
  const [_skus, setSkus] = useState<Array<{ id: string; skuCode: string; description: string }>>([])
  useEffect(() => {
    loadTransaction()
    loadSkus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const loadTransaction = async () => {
    try {
      const response = await fetch(`/api/transactions/${params.id}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to load transaction')
      }

      const data = await response.json()

      // Transform the transaction data to match the expected format
      // Since the API returns a single transaction, we need to create lineItems array
      const attachmentsRecord: Record<string, ApiAttachment | null> =
        data.attachments && !Array.isArray(data.attachments)
          ? (data.attachments as Record<string, ApiAttachment | null>)
          : {}

      const transformedData: TransactionData = {
        ...data,
        transactionId: data.transactionId || data.referenceId || data.id,
        warehouseId: data.warehouse?.id || data.warehouseId,
        skuCode: data.skuCode || data.sku?.skuCode || '',
        cartonsIn: data.cartonsIn ?? 0,
        cartonsOut: data.cartonsOut ?? 0,
        lineItems: data.lineItems || data.transactionLines || [],
        costs: data.costs || [],
        attachments: attachmentsRecord,
        createdBy: data.createdBy || { fullName: 'System User', email: 'system@warehouse.com' },
        history: data.history || [],
        referenceId: data.referenceId || '',
        shipName: data.shipName || '',
        trackingNumber: data.trackingNumber || '',
        supplier: data.supplier || '',
      }

      setTransaction(transformedData)
    } catch (_error) {
      // Error loading transaction
      toast.error('Failed to load transaction')
    } finally {
      setLoading(false)
    }
  }

  const loadSkus = async () => {
    try {
      const response = await fetch('/api/skus', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setSkus(data.skus || [])
      }
    } catch (_error) {
      // Failed to load SKUs
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeaderSection
          title="Transaction Details"
          description="Operations"
          icon={FileText}
          backHref={INVENTORY_LEDGER_PATH}
          backLabel="Back"
        />
        <PageContent className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </PageContent>
      </PageContainer>
    )
  }

  if (!transaction) {
    return (
      <PageContainer>
        <PageHeaderSection
          title="Transaction Details"
          description="Operations"
          icon={FileText}
          backHref={INVENTORY_LEDGER_PATH}
          backLabel="Back"
        />
        <PageContent>
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft p-6 text-sm text-muted-foreground">
            Transaction not found.
          </div>
        </PageContent>
      </PageContainer>
    )
  }

  const isReceive = transaction.transactionType === 'RECEIVE'
  const isShip = transaction.transactionType === 'SHIP'

  // Convert line items to the format expected by cargo tabs
  const cargoItems = transaction.lineItems.map(item => ({
    id: item.id,
    skuCode: item.sku?.skuCode || '',
    skuId: item.skuId,
    batchLot: item.batchLot,
    cartons: isReceive ? item.cartonsIn : item.cartonsOut,
    units: (isReceive ? item.cartonsIn : item.cartonsOut) * (item.unitsPerCarton || 0),
    unitsPerCarton: item.unitsPerCarton || item.sku?.unitsPerCarton || 0,
    storagePalletsIn: item.storagePalletsIn || 0,
    shippingPalletsOut: item.shippingPalletsOut || 0,
    storageCartonsPerPallet: item.storageCartonsPerPallet || 0,
    shippingCartonsPerPallet: item.shippingCartonsPerPallet || 0,
    configLoaded: true,
    loadingBatch: false,
  }))

  // Tab configuration based on transaction type
  const tabConfig = [
    { id: 'details', label: 'Transaction Details', icon: <FileText className="h-4 w-4" /> },
    { id: 'cargo', label: 'Cargo', icon: <Package2 className="h-4 w-4" /> },
    { id: 'costs', label: 'Costs', icon: <DollarSign className="h-4 w-4" /> },
    { id: 'attachments', label: 'Attachments', icon: <Paperclip className="h-4 w-4" /> },
  ]

  return (
    <PageContainer>
      <PageHeaderSection
        title="Transaction Details"
        description="Operations"
        icon={isReceive ? Package2 : Truck}
        backHref={INVENTORY_LEDGER_PATH}
        backLabel="Back"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push(INVENTORY_LEDGER_PATH)}
          >
            Close
          </Button>
        }
        metadata={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                isReceive ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300'
              }`}
            >
              {transaction.transactionType}
            </span>
            <span className="px-2 py-1 text-xs font-mono text-muted-foreground bg-slate-100 dark:bg-slate-700 rounded">
              {transaction.id}
            </span>
          </div>
        }
      />
      <PageContent>
        <TabbedContainer tabs={tabConfig} defaultTab={activeTab} onChange={setActiveTab}>
        {/* Transaction Details Tab */}
        <TabPanel>
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={transaction.transactionDate?.split('T')[0] || ''}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {isReceive ? 'PI/CI Number' : 'CI/PI Number'}
                </label>
                <input
                  type="text"
                  value={transaction.referenceId || ''}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Warehouse</label>
                <input
                  type="text"
                  value={transaction.warehouse?.name || ''}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                  readOnly
                />
              </div>

              {isReceive && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Ship Name
                    </label>
                    <input
                      type="text"
                      value={transaction.shipName || ''}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Container Number
                    </label>
                    <input
                      type="text"
                      value={transaction.trackingNumber || ''}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={transaction.supplier || ''}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                      readOnly
                    />
                  </div>
                </>
              )}

              {isShip && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Pickup Date
                    </label>
                    <input
                      type="date"
                      value={transaction.pickupDate?.split('T')[0] || ''}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                      readOnly
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Tracking Number
                    </label>
                    <input
                      type="text"
                      value={transaction.trackingNumber || ''}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                      readOnly
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </TabPanel>

        {/* Cargo Tab - Using actual CargoTab component structure */}
        <TabPanel>
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Batch
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Cartons
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Units
                    </th>
                    {isReceive && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Storage Pallets In
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Storage Cartons/Pallet
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Shipping Cartons/Pallet
                        </th>
                      </>
                    )}
                    {isShip && (
                      <>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Shipping Pallets Out
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Shipping Cartons/Pallet
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {cargoItems.map((item, _index) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.skuCode}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                            readOnly
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="text"
                          value={item.batchLot}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                          readOnly
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="number"
                          value={item.cartons}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                          readOnly
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <input
                          type="number"
                          value={item.units}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                          readOnly
                        />
                      </td>
                      {isReceive && (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              value={item.storagePalletsIn}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                              readOnly
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              value={item.storageCartonsPerPallet}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                              readOnly
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              value={item.shippingCartonsPerPallet}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                              readOnly
                            />
                          </td>
                        </>
                      )}
                      {isShip && (
                        <>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              value={item.shippingPalletsOut}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                              readOnly
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              value={item.shippingCartonsPerPallet}
                              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                              readOnly
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabPanel>

        {/* Costs Tab */}
        <TabPanel>
          <div className="space-y-6">
            {!transaction.calculatedCosts || transaction.calculatedCosts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No costs recorded for this transaction</p>
                <p className="text-sm mt-2">Costs need to be saved when creating the transaction</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Cost Category
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Unit Rate
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                    {transaction.calculatedCosts.map((cost, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="text"
                            value={cost.costCategory ?? cost.category ?? ''}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                            readOnly
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            value={cost.quantity ?? 0}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                            readOnly
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            value={cost.unitRate ?? cost.rate ?? 0}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                            readOnly
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            value={cost.totalCost ?? cost.amount ?? 0}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-foreground"
                            readOnly
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabPanel>

        {/* Attachments Tab */}
        <TabPanel>
          <div className="space-y-4">
            {!transaction.attachments || Object.keys(transaction.attachments).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Paperclip className="h-12 w-12 mx-auto mb-4 text-slate-400 dark:text-slate-600" />
                <p className="text-lg font-medium text-foreground">No attachments</p>
                <p className="text-sm mt-2">No documents have been attached to this transaction</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-xl border">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <h3 className="text-lg font-semibold text-foreground">Transaction Documents</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(
                      transaction.attachments as Record<string, ApiAttachment | null>
                    ).map(([category, attachment]) => {
                      if (!attachment) return null

                      const categoryLabels: Record<string, string> = {
                        commercial_invoice: 'Commercial Invoice',
                        bill_of_lading: 'Bill of Lading',
                        packing_list: 'Packing List',
                        movement_note: 'Movement Note',
                        delivery_note: 'Movement Note',
                        cube_master: 'Cube Master',
                        transaction_certificate: 'TC GRS',
                        custom_declaration: 'CDS',
                        proof_of_pickup: 'Proof of Pickup',
                      }

                      return (
                        <div key={category} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm text-foreground">
                                {categoryLabels[category] || category}
                              </h4>
                              <div className="flex items-center gap-2 mt-2">
                                <Paperclip className="h-4 w-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                                <p className="text-sm text-foreground truncate">
                                  {attachment.fileName || attachment.name || 'Document'}
                                </p>
                              </div>
                              {attachment.size && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                </p>
                              )}
                            </div>
                            {attachment.s3Url && (
                              <a
                                href={attachment.s3Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 p-2 text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 rounded"
                                title="Download"
                              >
                                <svg
                                  className="h-5 w-5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabPanel>
        </TabbedContainer>
      </PageContent>
    </PageContainer>
  )
}
