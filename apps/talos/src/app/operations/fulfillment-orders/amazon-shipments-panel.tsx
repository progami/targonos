'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, RefreshCw, Search, Truck } from '@/lib/lucide-icons'
import {
  AMAZON_INBOUND_SHIPMENT_STATUSES,
  normalizeInboundShipmentListRow,
  type AmazonInboundShipmentListRow,
  type AmazonInboundShipmentStatus,
} from '@/lib/amazon/inbound-shipments'
import { withBasePath } from '@/lib/utils/base-path'

const STATUS_BADGE_CLASSES: Record<AmazonInboundShipmentStatus, string> = {
  WORKING:
    'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
  READY_TO_SHIP:
    'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800',
  SHIPPED:
    'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  IN_TRANSIT:
    'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
  RECEIVING:
    'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  DELIVERED:
    'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800',
  CHECKED_IN:
    'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800',
  CLOSED:
    'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  CANCELLED:
    'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
  DELETED:
    'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
  ERROR:
    'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value) {
    throw new Error(`Amazon shipments response missing ${label}`)
  }

  if (typeof value !== 'object') {
    throw new Error(`Amazon shipments response missing ${label}`)
  }

  if (Array.isArray(value)) {
    throw new Error(`Amazon shipments response missing ${label}`)
  }

  return value as Record<string, unknown>
}

function parseShipmentsPayload(payload: unknown): AmazonInboundShipmentListRow[] {
  const root = expectRecord(payload, 'root object')
  const data = expectRecord(root.data, 'data')

  if (!Array.isArray(data.shipments)) {
    throw new Error('Amazon shipments response missing data.shipments')
  }

  return data.shipments.map(shipment => normalizeInboundShipmentListRow(shipment))
}

function extractErrorMessage(payload: unknown, status: number): string {
  const record = expectRecord(payload, 'error payload')
  if (typeof record.error === 'string' && record.error.trim().length > 0) {
    return record.error.trim()
  }

  return `Failed to load Amazon shipments (${status})`
}

function formatOptionalText(value: string): string {
  if (value.length === 0) {
    return '—'
  }

  return value
}

function formatCasesRequired(value: boolean | null): string {
  if (value === null) {
    return '—'
  }

  return value ? 'Yes' : 'No'
}

function readCount(
  counts: Map<AmazonInboundShipmentStatus, number>,
  status: AmazonInboundShipmentStatus
): number {
  const count = counts.get(status)
  if (count === undefined) {
    throw new Error(`Missing Amazon shipment status count for ${status}`)
  }

  return count
}

export function AmazonShipmentsPanel() {
  const [shipments, setShipments] = useState<AmazonInboundShipmentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchShipments = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(withBasePath('/api/amazon/inbound-shipments'), {
        credentials: 'include',
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, response.status))
      }

      setShipments(parseShipmentsPayload(payload))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Amazon shipments'
      setShipments([])
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchShipments()
  }, [fetchShipments])

  const filteredShipments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (term.length === 0) {
      return shipments
    }

    return shipments.filter(shipment => {
      const searchableValues = [
        shipment.shipmentId,
        shipment.shipmentName,
        shipment.shipmentStatus,
        shipment.destinationFulfillmentCenterId,
      ]

      return searchableValues.some(value => value.toLowerCase().includes(term))
    })
  }, [shipments, searchTerm])

  const statusCounts = useMemo(() => {
    const counts = new Map<AmazonInboundShipmentStatus, number>()
    for (const status of AMAZON_INBOUND_SHIPMENT_STATUSES) {
      counts.set(status, 0)
    }

    for (const shipment of shipments) {
      const count = counts.get(shipment.shipmentStatus)
      if (count === undefined) {
        throw new Error(`Missing Amazon shipment status count for ${shipment.shipmentStatus}`)
      }
      counts.set(shipment.shipmentStatus, count + 1)
    }

    return counts
  }, [shipments])

  const nonZeroStatusCounts = useMemo(
    () =>
      AMAZON_INBOUND_SHIPMENT_STATUSES.map(status => ({
        status,
        count: readCount(statusCounts, status),
      })).filter(item => item.count > 0),
    [statusCounts]
  )

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Amazon Shipments</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Shipments returned by Fulfillment Inbound SP-API for the active tenant.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search shipment, name, status, FC"
              className="pl-9 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => void fetchShipments()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{shipments.length}</span> total
        </span>
        {nonZeroStatusCounts.map(item => (
          <span key={item.status}>
            <span className="font-semibold text-foreground">{item.count}</span>{' '}
            {item.status.toLowerCase().replaceAll('_', ' ')}
          </span>
        ))}
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border bg-white shadow-soft dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-auto text-sm">
            <thead>
              <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Shipment ID
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Name
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  FC
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Label Prep
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Box Source
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Cases
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Need By
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading Amazon shipments…
                    </span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-red-700 dark:text-red-300">
                    {error}
                  </td>
                </tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    {searchTerm.trim().length > 0
                      ? 'No Amazon shipments match your search.'
                      : 'No Amazon shipments returned by SP-API.'}
                  </td>
                </tr>
              ) : (
                filteredShipments.map(shipment => (
                  <tr
                    key={shipment.shipmentId}
                    className="border-t border-slate-200 hover:bg-slate-50/50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                      {shipment.shipmentId}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatOptionalText(shipment.shipmentName)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Badge className={STATUS_BADGE_CLASSES[shipment.shipmentStatus]}>
                        {shipment.shipmentStatus}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatOptionalText(shipment.destinationFulfillmentCenterId)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatOptionalText(shipment.labelPrepType)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatOptionalText(shipment.boxContentsSource)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatCasesRequired(shipment.areCasesRequired)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatOptionalText(shipment.confirmedNeedByDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
