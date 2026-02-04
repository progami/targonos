'use client'

import { ChangeEvent, useEffect, useMemo, useState, type ComponentType } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/loading-spinner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Info,
  Loader2,
  Package2,
  RefreshCw,
  Truck,
  Upload,
  X,
  XCircle,
} from '@/lib/lucide-icons'
import { format } from 'date-fns'

type FulfillmentOrderStatus = 'DRAFT' | 'SHIPPED' | 'CANCELLED'

type FulfillmentOrderLine = {
  id: string
  skuCode: string
  skuDescription: string | null
  batchLot: string
  quantity: number
  status: string
}

type FulfillmentOrder = {
  id: string
  foNumber: string
  status: FulfillmentOrderStatus
  warehouseCode: string
  warehouseName: string
  destinationType: string
  destinationName: string | null
  destinationAddress: string | null
  destinationCountry: string | null
  shippingCarrier: string | null
  shippingMethod: string | null
  trackingNumber: string | null
  shippedDate: string | null
  deliveredDate: string | null
  externalReference: string | null
  amazonShipmentId: string | null
  amazonShipmentName: string | null
  amazonShipmentStatus: string | null
  amazonDestinationFulfillmentCenterId: string | null
  amazonLabelPrepType: string | null
  amazonBoxContentsSource: string | null
  amazonShipFromAddress: Record<string, unknown> | null
  amazonReferenceId: string | null
  amazonShipmentReference: string | null
  amazonShipperId: string | null
  amazonPickupNumber: string | null
  amazonPickupAppointmentId: string | null
  amazonDeliveryAppointmentId: string | null
  amazonLoadId: string | null
  amazonFreightBillNumber: string | null
  amazonBillOfLadingNumber: string | null
  amazonPickupWindowStart: string | null
  amazonPickupWindowEnd: string | null
  amazonDeliveryWindowStart: string | null
  amazonDeliveryWindowEnd: string | null
  amazonPickupAddress: string | null
  amazonPickupContactName: string | null
  amazonPickupContactPhone: string | null
  amazonDeliveryAddress: string | null
  amazonShipmentMode: string | null
  amazonBoxCount: number | null
  amazonPalletCount: number | null
  amazonCommodityDescription: string | null
  amazonDistanceMiles: number | null
  amazonBasePrice: number | null
  amazonFuelSurcharge: number | null
  amazonTotalPrice: number | null
  amazonCurrency: string | null
  notes: string | null
  createdAt: string
  lines: FulfillmentOrderLine[]
}

type FulfillmentOrderDocumentStage = 'PACKING' | 'SHIPPING' | 'DELIVERY'

type FulfillmentOrderDocumentSummary = {
  id: string
  stage: FulfillmentOrderDocumentStage
  documentType: string
  fileName: string
  contentType: string
  size: number
  uploadedAt: string
  uploadedByName: string | null
  s3Key: string
  viewUrl: string
}

const STATUS_BADGE_CLASSES: Record<FulfillmentOrderStatus, string> = {
  DRAFT: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600',
  SHIPPED: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
  CANCELLED: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
}

const DOCUMENT_REQUIREMENTS: Record<
  FulfillmentOrderDocumentStage,
  Array<{ id: string; label: string }>
> = {
  PACKING: [],
  SHIPPING: [
    { id: 'bill_of_lading', label: 'Bill of Lading (BOL)' },
    { id: 'invoice', label: 'Invoice' },
  ],
  DELIVERY: [{ id: 'proof_of_delivery', label: 'Proof of Delivery (POD)' }],
}

const DOCUMENT_STAGE_META: Record<
  FulfillmentOrderDocumentStage,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  PACKING: { label: 'Packing', icon: FileText },
  SHIPPING: { label: 'Shipping', icon: Truck },
  DELIVERY: { label: 'Delivery', icon: Check },
}

function formatDocumentTypeFallback(documentType: string) {
  const cleaned = documentType.trim().replace(/[_-]+/g, ' ')
  if (!cleaned) return 'Document'
  return cleaned.replace(/\b\w/g, match => match.toUpperCase())
}

function getDocumentLabel(stage: FulfillmentOrderDocumentStage, documentType: string) {
  const required = DOCUMENT_REQUIREMENTS[stage]
  const match = required.find(candidate => candidate.id === documentType)
  if (match) return match.label
  return formatDocumentTypeFallback(documentType)
}

function formatDateTimeDisplay(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return format(date, 'PPP p')
}

function formatDateTimeInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function formatAmazonAddress(address?: Record<string, unknown> | null) {
  if (!address) return '—'
  const getField = (key: string) => {
    const value = address[key]
    return typeof value === 'string' ? value.trim() : ''
  }

  const name = getField('Name')
  const line1 = getField('AddressLine1')
  const line2 = getField('AddressLine2')
  const city = getField('City')
  const state = getField('StateOrProvinceCode')
  const postal = getField('PostalCode')
  const country = getField('CountryCode')

  const cityState = [city, state].filter(Boolean).join(', ')
  const cityStatePostal = [cityState, postal].filter(Boolean).join(' ')

  const lines = [name, line1, line2, cityStatePostal, country].filter(Boolean)
  return lines.length > 0 ? lines.join(', ') : '—'
}

type FulfillmentOrderDetailTab =
  | 'details'
  | 'amazon'
  | 'lines'
  | 'freight'
  | 'documents'
  | 'shipping'

export default function FulfillmentOrderDetailPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams<{ id: string }>()

  const [order, setOrder] = useState<FulfillmentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const [activeTab, setActiveTab] = useState<FulfillmentOrderDetailTab>('details')
  const [freightExpanded, setFreightExpanded] = useState(true)

  const [shipForm, setShipForm] = useState({
    shippedDate: '',
    deliveredDate: '',
    shippingCarrier: '',
    shippingMethod: '',
    trackingNumber: '',
  })

  const [detailsForm, setDetailsForm] = useState({
    destinationName: '',
    destinationAddress: '',
    destinationCountry: '',
    externalReference: '',
    notes: '',
  })
  const [detailsSaving, setDetailsSaving] = useState(false)

  const [amazonShipmentIdDraft, setAmazonShipmentIdDraft] = useState('')
  const [amazonShipmentSaving, setAmazonShipmentSaving] = useState(false)
  const [amazonSyncing, setAmazonSyncing] = useState(false)

  // Amazon Freight form state
  const [amazonFreight, setAmazonFreight] = useState({
    shipmentReference: '',
    shipperId: '',
    pickupNumber: '',
    pickupAppointmentId: '',
    deliveryAppointmentId: '',
    loadId: '',
    freightBillNumber: '',
    billOfLadingNumber: '',
    pickupWindowStart: '',
    pickupWindowEnd: '',
    deliveryWindowStart: '',
    deliveryWindowEnd: '',
    pickupAddress: '',
    pickupContactName: '',
    pickupContactPhone: '',
    deliveryAddress: '',
    shipmentMode: '',
    boxCount: '',
    palletCount: '',
    commodityDescription: '',
    distanceMiles: '',
    basePrice: '',
    fuelSurcharge: '',
    totalPrice: '',
    currency: '',
  })
  const [amazonSaving, setAmazonSaving] = useState(false)

  const [documents, setDocuments] = useState<FulfillmentOrderDocumentSummary[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<Record<string, boolean>>({})
  const [inlinePreviewDocument, setInlinePreviewDocument] =
    useState<FulfillmentOrderDocumentSummary | null>(null)
  const [previewDocument, setPreviewDocument] = useState<FulfillmentOrderDocumentSummary | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal(
        '/login',
        `${window.location.origin}${withBasePath(`/operations/fulfillment-orders/${params.id}`)}`
      )
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
    }
  }, [session, status, router, params.id])

  const fetchOrder = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/fulfillment-orders/${params.id}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(payload?.error ?? 'Failed to load fulfillment order')
        return
      }

      const data = payload?.data as FulfillmentOrder | undefined
      if (!data) {
        toast.error('Fulfillment order not found')
        return
      }

      setOrder(data)
      setShipForm({
        shippedDate: data.shippedDate ? new Date(data.shippedDate).toISOString().slice(0, 16) : '',
        deliveredDate: data.deliveredDate
          ? new Date(data.deliveredDate).toISOString().slice(0, 16)
          : '',
        shippingCarrier: data.shippingCarrier ?? '',
        shippingMethod: data.shippingMethod ?? '',
        trackingNumber: data.trackingNumber ?? '',
      })
      setDetailsForm({
        destinationName: data.destinationName ?? '',
        destinationAddress: data.destinationAddress ?? '',
        destinationCountry: data.destinationCountry ?? '',
        externalReference: data.externalReference ?? '',
        notes: data.notes ?? '',
      })
      setAmazonShipmentIdDraft(data.amazonShipmentId ?? '')
      setAmazonFreight({
        shipmentReference: data.amazonShipmentReference ?? '',
        shipperId: data.amazonShipperId ?? '',
        pickupNumber: data.amazonPickupNumber ?? '',
        pickupAppointmentId: data.amazonPickupAppointmentId ?? '',
        deliveryAppointmentId: data.amazonDeliveryAppointmentId ?? '',
        loadId: data.amazonLoadId ?? '',
        freightBillNumber: data.amazonFreightBillNumber ?? '',
        billOfLadingNumber: data.amazonBillOfLadingNumber ?? '',
        pickupWindowStart: formatDateTimeInput(data.amazonPickupWindowStart ?? null),
        pickupWindowEnd: formatDateTimeInput(data.amazonPickupWindowEnd ?? null),
        deliveryWindowStart: formatDateTimeInput(data.amazonDeliveryWindowStart ?? null),
        deliveryWindowEnd: formatDateTimeInput(data.amazonDeliveryWindowEnd ?? null),
        pickupAddress: data.amazonPickupAddress ?? '',
        pickupContactName: data.amazonPickupContactName ?? '',
        pickupContactPhone: data.amazonPickupContactPhone ?? '',
        deliveryAddress: data.amazonDeliveryAddress ?? '',
        shipmentMode: data.amazonShipmentMode ?? '',
        boxCount: data.amazonBoxCount !== null ? String(data.amazonBoxCount) : '',
        palletCount: data.amazonPalletCount !== null ? String(data.amazonPalletCount) : '',
        commodityDescription: data.amazonCommodityDescription ?? '',
        distanceMiles: data.amazonDistanceMiles !== null ? String(data.amazonDistanceMiles) : '',
        basePrice: data.amazonBasePrice !== null ? String(data.amazonBasePrice) : '',
        fuelSurcharge: data.amazonFuelSurcharge !== null ? String(data.amazonFuelSurcharge) : '',
        totalPrice: data.amazonTotalPrice !== null ? String(data.amazonTotalPrice) : '',
        currency: data.amazonCurrency ?? '',
      })
    } catch (_error) {
      toast.error('Failed to load fulfillment order')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchOrder()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, params.id])

  useEffect(() => {
    if (!order?.id) return

    const loadDocuments = async () => {
      try {
        setDocumentsLoading(true)
        const response = await fetch(`/api/fulfillment-orders/${order.id}/documents`)
        if (!response.ok) {
          setDocuments([])
          return
        }

        const payload = await response.json().catch(() => null)
        const list = payload?.documents
        setDocuments(Array.isArray(list) ? (list as FulfillmentOrderDocumentSummary[]) : [])
      } catch {
        setDocuments([])
      } finally {
        setDocumentsLoading(false)
      }
    }

    loadDocuments()
  }, [order?.id])

  const totalQuantity = useMemo(() => {
    return order?.lines?.reduce((sum, line) => sum + Number(line.quantity || 0), 0) ?? 0
  }, [order])

  const documentsByKey = useMemo(() => {
    const map = new Map<string, FulfillmentOrderDocumentSummary>()
    for (const doc of documents) {
      map.set(`${doc.stage}::${doc.documentType}`, doc)
    }
    return map
  }, [documents])

  const inlineStageMeta = inlinePreviewDocument ? DOCUMENT_STAGE_META[inlinePreviewDocument.stage] : null
  const InlineStageIcon = inlineStageMeta ? inlineStageMeta.icon : null
  const inlineIsPdf = Boolean(
    inlinePreviewDocument &&
      (inlinePreviewDocument.contentType === 'application/pdf' ||
        inlinePreviewDocument.fileName.toLowerCase().endsWith('.pdf'))
  )
  const inlineIsImage = Boolean(
    inlinePreviewDocument && inlinePreviewDocument.contentType.startsWith('image/')
  )

  const previewStageMeta = previewDocument ? DOCUMENT_STAGE_META[previewDocument.stage] : null
  const PreviewStageIcon = previewStageMeta ? previewStageMeta.icon : null

  const previewIsPdf = Boolean(
    previewDocument &&
      (previewDocument.contentType === 'application/pdf' ||
        previewDocument.fileName.toLowerCase().endsWith('.pdf'))
  )
  const previewIsImage = Boolean(previewDocument && previewDocument.contentType.startsWith('image/'))

  const isAmazonFBA = order?.destinationType === 'AMAZON_FBA'
  const canEdit = order?.status === 'DRAFT'

  const hasBillOfLading = Boolean(documentsByKey.get('SHIPPING::bill_of_lading'))

  const tabIssueCounts = useMemo(() => {
    const issues: Record<FulfillmentOrderDetailTab, number> = {
      details: 0,
      amazon: 0,
      lines: 0,
      freight: 0,
      documents: 0,
      shipping: 0,
    }

    if (!order) return issues

    if (!isAmazonFBA && !order.destinationName?.trim()) {
      issues.details += 1
    }

    if (isAmazonFBA && !order.amazonShipmentId?.trim()) {
      issues.amazon += 1
    }

    if (!order.lines || order.lines.length === 0) {
      issues.lines += 1
    }

    if (!hasBillOfLading) {
      issues.documents += 1
    }

    if (canEdit) {
      if (!shipForm.shippingCarrier.trim()) {
        issues.shipping += 1
      }
      if (!shipForm.shippingMethod.trim()) {
        issues.shipping += 1
      }
      if (!hasBillOfLading) {
        issues.shipping += 1
      }
      if (isAmazonFBA && !order.amazonShipmentId?.trim()) {
        issues.shipping += 1
      }
      if (!isAmazonFBA && !order.destinationName?.trim()) {
        issues.shipping += 1
      }
    }

    return issues
  }, [canEdit, hasBillOfLading, isAmazonFBA, order, shipForm.shippingCarrier, shipForm.shippingMethod])

  const handleDetailsSave = async () => {
    if (!order) return
    try {
      setDetailsSaving(true)
      const payload = {
        destinationName: detailsForm.destinationName,
        destinationAddress: detailsForm.destinationAddress,
        destinationCountry: detailsForm.destinationCountry,
        externalReference: detailsForm.externalReference,
        notes: detailsForm.notes,
      }

      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to save details')
        return
      }

      toast.success('Details saved')
      setOrder(data?.data ?? null)
    } catch (_error) {
      toast.error('Failed to save details')
    } finally {
      setDetailsSaving(false)
    }
  }

  const handleAmazonShipmentSave = async () => {
    if (!order) return
    if (!amazonShipmentIdDraft.trim()) {
      toast.error('Amazon shipment ID is required')
      return
    }

    try {
      setAmazonShipmentSaving(true)
      const payload = { amazonShipmentId: amazonShipmentIdDraft }
      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to save Amazon shipment ID')
        return
      }

      toast.success('Amazon shipment saved')
      setOrder(data?.data ?? null)
    } catch (_error) {
      toast.error('Failed to save Amazon shipment ID')
    } finally {
      setAmazonShipmentSaving(false)
    }
  }

  const handleAmazonSync = async () => {
    if (!order) return
    if (!order.amazonShipmentId?.trim()) {
      toast.error('Save an Amazon shipment ID first')
      return
    }

    try {
      setAmazonSyncing(true)
      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}/amazon-sync`, {
        method: 'POST',
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to sync Amazon shipment')
        return
      }

      toast.success('Amazon shipment synced')
      setOrder(data?.data ?? null)
    } catch (_error) {
      toast.error('Failed to sync Amazon shipment')
    } finally {
      setAmazonSyncing(false)
    }
  }

  const handleShip = async () => {
    if (!order) return
    try {
      if (isAmazonFBA && !order.amazonShipmentId?.trim()) {
        setActiveTab('amazon')
        toast.error('Amazon shipment ID is required')
        return
      }

      if (!isAmazonFBA && !order.destinationName?.trim()) {
        setActiveTab('details')
        toast.error('Destination name is required')
        return
      }

      if (!hasBillOfLading) {
        setActiveTab('documents')
        toast.error('Upload the Bill of Lading (BOL) before shipping')
        return
      }

      if (!shipForm.shippingCarrier.trim()) {
        setActiveTab('shipping')
        toast.error('Shipping carrier is required')
        return
      }

      if (!shipForm.shippingMethod.trim()) {
        setActiveTab('shipping')
        toast.error('Shipping method is required')
        return
      }

      setSubmitting(true)
      const payload = {
        targetStatus: 'SHIPPED',
        stageData: {
          shippedDate: shipForm.shippedDate
            ? new Date(shipForm.shippedDate).toISOString()
            : undefined,
          deliveredDate: shipForm.deliveredDate
            ? new Date(shipForm.deliveredDate).toISOString()
            : undefined,
          shippingCarrier: shipForm.shippingCarrier,
          shippingMethod: shipForm.shippingMethod,
          trackingNumber: shipForm.trackingNumber,
        },
      }

      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to ship fulfillment order')
        return
      }

      toast.success('Fulfillment order shipped')
      setOrder(data?.data ?? null)
    } catch (_error) {
      toast.error('Failed to ship fulfillment order')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!order) return
    try {
      setSubmitting(true)
      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStatus: 'CANCELLED', stageData: {} }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to cancel fulfillment order')
        return
      }
      toast.success('Fulfillment order cancelled')
      setOrder(data?.data ?? null)
      setShowCancelConfirm(false)
    } catch (_error) {
      toast.error('Failed to cancel fulfillment order')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAmazonSave = async () => {
    if (!order) return
    try {
      setAmazonSaving(true)
      const payload = {
        amazonShipmentReference: amazonFreight.shipmentReference,
        amazonShipperId: amazonFreight.shipperId,
        amazonPickupNumber: amazonFreight.pickupNumber,
        amazonPickupAppointmentId: amazonFreight.pickupAppointmentId,
        amazonDeliveryAppointmentId: amazonFreight.deliveryAppointmentId,
        amazonLoadId: amazonFreight.loadId,
        amazonFreightBillNumber: amazonFreight.freightBillNumber,
        amazonBillOfLadingNumber: amazonFreight.billOfLadingNumber,
        amazonPickupWindowStart: amazonFreight.pickupWindowStart,
        amazonPickupWindowEnd: amazonFreight.pickupWindowEnd,
        amazonDeliveryWindowStart: amazonFreight.deliveryWindowStart,
        amazonDeliveryWindowEnd: amazonFreight.deliveryWindowEnd,
        amazonPickupAddress: amazonFreight.pickupAddress,
        amazonPickupContactName: amazonFreight.pickupContactName,
        amazonPickupContactPhone: amazonFreight.pickupContactPhone,
        amazonDeliveryAddress: amazonFreight.deliveryAddress,
        amazonShipmentMode: amazonFreight.shipmentMode,
        amazonBoxCount: amazonFreight.boxCount,
        amazonPalletCount: amazonFreight.palletCount,
        amazonCommodityDescription: amazonFreight.commodityDescription,
        amazonDistanceMiles: amazonFreight.distanceMiles,
        amazonBasePrice: amazonFreight.basePrice,
        amazonFuelSurcharge: amazonFreight.fuelSurcharge,
        amazonTotalPrice: amazonFreight.totalPrice,
        amazonCurrency: amazonFreight.currency,
      }

      const response = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error ?? 'Failed to save Amazon freight details')
        return
      }

      toast.success('Amazon freight details saved')
      setOrder(data?.data ?? null)
    } catch (_error) {
      toast.error('Failed to save Amazon freight details')
    } finally {
      setAmazonSaving(false)
    }
  }

  const refreshDocuments = async () => {
    if (!order) return
    const response = await fetch(`/api/fulfillment-orders/${order.id}/documents`)
    if (!response.ok) {
      setDocuments([])
      return
    }

    const payload = await response.json().catch(() => null)
    const list = payload?.documents
    setDocuments(Array.isArray(list) ? (list as FulfillmentOrderDocumentSummary[]) : [])
  }

  const handleDocumentUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    stage: FulfillmentOrderDocumentStage,
    documentType: string
  ) => {
    const input = event.target
    const file = input.files?.[0]
    if (!order || !file) return

    const key = `${stage}::${documentType}`
    setUploadingDoc(prev => ({ ...prev, [key]: true }))

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('stage', stage)
      formData.append('documentType', documentType)

      const completeResponse = await fetchWithCSRF(`/api/fulfillment-orders/${order.id}/documents`, {
        method: 'POST',
        body: formData,
      })

      const payload = await completeResponse.json().catch(() => null)
      if (!completeResponse.ok) {
        const errorMessage = typeof payload?.error === 'string' ? payload.error : null
        const detailsMessage = typeof payload?.details === 'string' ? payload.details : null
        if (errorMessage && detailsMessage) {
          toast.error(`${errorMessage}: ${detailsMessage}`)
        } else if (errorMessage) {
          toast.error(errorMessage)
        } else {
          toast.error(`Failed to upload document (HTTP ${completeResponse.status})`)
        }
        return
      }

      await refreshDocuments()
      toast.success('Document uploaded')
    } catch {
      toast.error('Failed to upload document')
    } finally {
      setUploadingDoc(prev => ({ ...prev, [key]: false }))
      input.value = ''
    }
  }


  const renderDocumentStage = (stage: FulfillmentOrderDocumentStage, title: string) => {
    const required = DOCUMENT_REQUIREMENTS[stage]
    if (required.length === 0) return null

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h4>
          {documentsLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>
        <div className="space-y-2">
          {required.map(docType => {
            const key = `${stage}::${docType.id}`
            const existing = documentsByKey.get(key)
            const isUploading = Boolean(uploadingDoc[key])

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 dark:bg-slate-900 px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {existing ? (
                    <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="h-4 w-4 flex-shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{docType.label}</span>
                    {existing ? (
                      <button
                        type="button"
                        onClick={() => setInlinePreviewDocument(existing)}
                        className="block truncate text-xs text-primary hover:underline"
                        title={existing.fileName}
                      >
                        {existing.fileName}
                      </button>
                    ) : (
                      <span className="block text-xs text-muted-foreground">Not uploaded yet</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {existing && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreviewDocument(existing)}
                      className="h-8 w-8 p-0"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {existing && (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Open in new tab"
                    >
                      <a href={existing.viewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <label className="inline-flex items-center gap-2 rounded-md border bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    {existing ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={isUploading}
                      onChange={e => handleDocumentUpload(e, stage, docType.id)}
                    />
                    {isUploading && <span className="text-xs text-muted-foreground ml-1">…</span>}
                  </label>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (status === 'loading' || loading) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  if (!order) {
    return (
      <PageContainer>
        <PageHeaderSection
          title="Fulfillment Order"
          description="Operations"
          icon={FileText}
          backHref="/operations/fulfillment-orders"
          backLabel="Back"
        />
        <PageContent>
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-soft p-6 text-sm text-muted-foreground">
            Fulfillment order not found.
          </div>
        </PageContent>
      </PageContainer>
    )
  }

  return (
    <>
      <PageContainer>
        <PageHeaderSection
          title={order.foNumber}
          description="Fulfillment Order"
          icon={Truck}
          backHref="/operations/fulfillment-orders"
          backLabel="Back"
          actions={
            order.status === 'DRAFT' ? (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => setShowCancelConfirm(true)}
                disabled={submitting}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            ) : null
          }
        />
        <PageContent>
          <div className="flex flex-col gap-6">
            {/* Order Type (read-only) - matches new page structure */}
            <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Order Type</h3>
                  <div className="flex gap-3">
                    {(['AMAZON_FBA', 'CUSTOMER', 'TRANSFER'] as const).map(type => (
                      <div
                        key={type}
                        className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                          order.destinationType === type
                            ? 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-500 dark:border-cyan-600 text-cyan-700 dark:text-cyan-300'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                        }`}
                      >
                        {type === 'AMAZON_FBA'
                          ? 'Amazon FBA'
                          : type === 'CUSTOMER'
                            ? 'Customer'
                            : 'Transfer'}
                      </div>
                    ))}
                  </div>
                </div>
                <Badge className={STATUS_BADGE_CLASSES[order.status]}>
                  {order.status === 'DRAFT'
                    ? 'Draft'
                    : order.status === 'SHIPPED'
                      ? 'Shipped'
                      : 'Cancelled'}
                </Badge>
              </div>
            </div>

            {/* Workflow Tabs */}
            <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-sm">
              <div className="flex items-center border-b">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'details'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Info className="h-4 w-4" />
                  Details
                  {tabIssueCounts.details > 0 && (
                    <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                  )}
                  {activeTab === 'details' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>

                {isAmazonFBA && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('amazon')}
                    className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'amazon'
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Amazon
                    {tabIssueCounts.amazon > 0 && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
                    {activeTab === 'amazon' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('lines')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'lines'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Package2 className="h-4 w-4" />
                  Lines
                  <Badge variant="outline" className="text-xs ml-1">
                    {order.lines.length}
                  </Badge>
                  {tabIssueCounts.lines > 0 && (
                    <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                  )}
                  {activeTab === 'lines' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>

                {isAmazonFBA && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('freight')}
                    className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'freight'
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Truck className="h-4 w-4" />
                    Freight
                    {activeTab === 'freight' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('documents')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'documents'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Documents
                  {tabIssueCounts.documents > 0 && (
                    <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                  )}
                  {activeTab === 'documents' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('shipping')}
                  className={`relative flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'shipping'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  Shipping
                  {tabIssueCounts.shipping > 0 && (
                    <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                  )}
                  {activeTab === 'shipping' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              </div>
            </div>

            {/* Amazon Shipment Info (for Amazon FBA) - matches new page structure */}
            {activeTab === 'amazon' && isAmazonFBA && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
                <h3 className="text-sm font-semibold mb-4">Amazon Shipment</h3>
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1.5">
                        Amazon Shipment ID *
                        {!amazonShipmentIdDraft.trim() && (
                          <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                        )}
                      </label>
                      <Input
                        value={amazonShipmentIdDraft}
                        onChange={e => setAmazonShipmentIdDraft(e.target.value)}
                        disabled={!canEdit || amazonShipmentSaving || amazonSyncing}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={handleAmazonSync}
                        disabled={amazonSyncing || !order.amazonShipmentId}
                        className="gap-2"
                      >
                        {amazonSyncing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Syncing…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" />
                            Sync from Amazon
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleAmazonShipmentSave}
                        disabled={amazonShipmentSaving || !amazonShipmentIdDraft.trim()}
                        className="gap-2"
                      >
                        {amazonShipmentSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          'Save Shipment'
                        )}
                      </Button>
                    </div>
                  )}

                  <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-4">
                    {order.amazonShipmentId ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-foreground">Imported:</span>
                          <span className="text-muted-foreground">
                            {order.amazonShipmentId} → {order.amazonDestinationFulfillmentCenterId ?? 'N/A'}
                          </span>
                          {order.amazonShipmentName ? (
                            <span className="text-muted-foreground">({order.amazonShipmentName})</span>
                          ) : null}
                        </div>
                        <div className="grid gap-4 md:grid-cols-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">Status</div>
                            <div className="font-medium">{order.amazonShipmentStatus ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Label Prep</div>
                            <div className="font-medium">{order.amazonLabelPrepType ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Reference ID</div>
                            <div className="font-medium">{order.amazonReferenceId ?? '—'}</div>
                          </div>
                        </div>
                        {order.amazonShipFromAddress ? (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Ship From</div>
                            <div className="text-sm text-slate-600">
                              {formatAmazonAddress(order.amazonShipFromAddress)}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No Amazon shipment saved.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Warehouse</div>
                    <div className="text-sm font-medium">
                      {order.warehouseCode} — {order.warehouseName}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="text-sm font-medium">{formatDateTimeDisplay(order.createdAt)}</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">
                      Destination Name{isAmazonFBA ? '' : ' *'}
                      {!isAmazonFBA && !detailsForm.destinationName.trim() && (
                        <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                      )}
                    </label>
                    <Input
                      value={detailsForm.destinationName}
                      onChange={e =>
                        setDetailsForm(prev => ({ ...prev, destinationName: e.target.value }))
                      }
                      disabled={!canEdit || detailsSaving}
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Destination Country</label>
                    <Input
                      value={detailsForm.destinationCountry}
                      onChange={e =>
                        setDetailsForm(prev => ({ ...prev, destinationCountry: e.target.value }))
                      }
                      disabled={!canEdit || detailsSaving}
                      className="text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1.5">Destination Address</label>
                    <Input
                      value={detailsForm.destinationAddress}
                      onChange={e =>
                        setDetailsForm(prev => ({ ...prev, destinationAddress: e.target.value }))
                      }
                      disabled={!canEdit || detailsSaving}
                      className="text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1.5">External Reference</label>
                    <Input
                      value={detailsForm.externalReference}
                      onChange={e =>
                        setDetailsForm(prev => ({ ...prev, externalReference: e.target.value }))
                      }
                      disabled={!canEdit || detailsSaving}
                      className="text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1.5">Notes</label>
                    <Textarea
                      value={detailsForm.notes}
                      onChange={e => setDetailsForm(prev => ({ ...prev, notes: e.target.value }))}
                      disabled={!canEdit || detailsSaving}
                      className="min-h-[96px] text-sm"
                    />
                  </div>
                </div>

                {canEdit && (
                  <div className="flex justify-end border-t pt-4 mt-5">
                    <Button onClick={handleDetailsSave} disabled={detailsSaving} className="gap-2">
                      {detailsSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save Details'
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Line Items Section - matches new page structure */}
            {activeTab === 'lines' && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Line Items</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.lines.length} item{order.lines.length !== 1 ? 's' : ''} ·{' '}
                    {totalQuantity.toLocaleString()} cartons
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-white dark:bg-slate-800 overflow-hidden">
                <div className="grid grid-cols-14 gap-2 text-xs font-medium text-muted-foreground p-3 border-b bg-slate-50/50 dark:bg-slate-900/50">
                  <div className="col-span-3">SKU</div>
                  <div className="col-span-3">Batch</div>
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2">Status</div>
                </div>

                <div className="divide-y divide-border">
                  {order.lines.map(line => (
                    <div key={line.id} className="grid grid-cols-14 gap-2 items-center p-3">
                      <div className="col-span-3">
                        <span className="text-sm font-semibold text-foreground">{line.skuCode}</span>
                      </div>
                      <div className="col-span-3">
                        <span className="text-sm text-muted-foreground uppercase">{line.batchLot}</span>
                      </div>
                      <div className="col-span-4">
                        <span
                          className="text-sm text-muted-foreground truncate"
                          title={line.skuDescription ?? undefined}
                        >
                          {line.skuDescription || '—'}
                        </span>
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="text-sm font-semibold tabular-nums">
                          {line.quantity.toLocaleString()}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-sm text-muted-foreground">{line.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            )}

            {/* Collapsible Freight Section (for Amazon FBA) - matches new page structure */}
            {activeTab === 'freight' && isAmazonFBA && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFreightExpanded(!freightExpanded)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Freight & Logistics</span>
                    {canEdit && (
                      <Badge variant="outline" className="text-xs">
                        Editable
                      </Badge>
                    )}
                  </div>
                  {freightExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {freightExpanded && (
                  <div className="border-t px-5 py-4">
                    <div className="space-y-4">
                      <div className="mb-2">
                        <h3 className="text-sm font-semibold">Amazon Freight Details</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Freight booking, BOL, and delivery information
                        </p>
                      </div>

                      {/* Identifiers */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Shipment Identifiers
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Shipment Reference
                            </label>
                            <Input
                              value={amazonFreight.shipmentReference}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  shipmentReference: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Shipper ID</label>
                            <Input
                              value={amazonFreight.shipperId}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, shipperId: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Load ID</label>
                            <Input
                              value={amazonFreight.loadId}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, loadId: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pro/Freight Bill Number
                            </label>
                            <Input
                              value={amazonFreight.freightBillNumber}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  freightBillNumber: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1.5">BOL Number</label>
                            <Input
                              value={amazonFreight.billOfLadingNumber}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  billOfLadingNumber: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Appointments */}
                      <div className="space-y-3 pt-4 border-t">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Pickup & Delivery Appointments
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Number
                            </label>
                            <Input
                              value={amazonFreight.pickupNumber}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupNumber: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Appointment ID
                            </label>
                            <Input
                              value={amazonFreight.pickupAppointmentId}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupAppointmentId: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              ISA / Delivery Appointment ID
                            </label>
                            <Input
                              value={amazonFreight.deliveryAppointmentId}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  deliveryAppointmentId: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Window Start
                            </label>
                            <Input
                              type="datetime-local"
                              value={amazonFreight.pickupWindowStart}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupWindowStart: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Window End
                            </label>
                            <Input
                              type="datetime-local"
                              value={amazonFreight.pickupWindowEnd}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupWindowEnd: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Delivery Window Start
                            </label>
                            <Input
                              type="datetime-local"
                              value={amazonFreight.deliveryWindowStart}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  deliveryWindowStart: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Delivery Window End
                            </label>
                            <Input
                              type="datetime-local"
                              value={amazonFreight.deliveryWindowEnd}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  deliveryWindowEnd: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Pickup & Delivery Details */}
                      <div className="space-y-3 pt-4 border-t">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Pickup & Delivery Details
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Contact Name
                            </label>
                            <Input
                              value={amazonFreight.pickupContactName}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupContactName: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Contact Phone
                            </label>
                            <Input
                              value={amazonFreight.pickupContactPhone}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupContactPhone: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1.5">
                              Pickup Address
                            </label>
                            <Textarea
                              value={amazonFreight.pickupAddress}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  pickupAddress: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Shipment Mode
                            </label>
                            <Input
                              value={amazonFreight.shipmentMode}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  shipmentMode: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1.5">
                              Delivery Address
                            </label>
                            <Textarea
                              value={amazonFreight.deliveryAddress}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  deliveryAddress: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Cargo & Pricing */}
                      <div className="space-y-3 pt-4 border-t">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Cargo & Pricing
                        </h4>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Box Count</label>
                            <Input
                              type="number"
                              min="0"
                              value={amazonFreight.boxCount}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, boxCount: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Pallet Count</label>
                            <Input
                              type="number"
                              min="0"
                              value={amazonFreight.palletCount}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, palletCount: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1.5">
                              Commodity Description
                            </label>
                            <Textarea
                              value={amazonFreight.commodityDescription}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  commodityDescription: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              rows={2}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Distance (miles)
                            </label>
                            <Input
                              type="number"
                              min="0"
                              value={amazonFreight.distanceMiles}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  distanceMiles: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Currency</label>
                            <Input
                              value={amazonFreight.currency}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, currency: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">Base Price</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={amazonFreight.basePrice}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, basePrice: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1.5">
                              Fuel Surcharge
                            </label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={amazonFreight.fuelSurcharge}
                              onChange={e =>
                                setAmazonFreight(prev => ({
                                  ...prev,
                                  fuelSurcharge: e.target.value,
                                }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-1.5">Total Price</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={amazonFreight.totalPrice}
                              onChange={e =>
                                setAmazonFreight(prev => ({ ...prev, totalPrice: e.target.value }))
                              }
                              disabled={!canEdit}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Save Button */}
                      {canEdit && (
                        <div className="flex justify-end pt-4 border-t">
                          <Button
                            onClick={handleAmazonSave}
                            disabled={amazonSaving}
                            className="gap-2"
                          >
                            {amazonSaving ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving…
                              </>
                            ) : (
                              'Save Freight Details'
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Documents Section */}
            {activeTab === 'documents' && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Documents</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload BOL, POD, and invoice files
                  </p>
                </div>
                {documentsLoading && (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                )}
              </div>
              <div className="space-y-6">
                {renderDocumentStage('SHIPPING', 'Shipping Documents')}
                {renderDocumentStage('DELIVERY', 'Delivery Documents')}
                {inlinePreviewDocument && inlineStageMeta && (
                  <div className="rounded-xl border bg-slate-50 dark:bg-slate-900 overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-white/60 dark:bg-slate-800/60 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {InlineStageIcon && <InlineStageIcon className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {inlinePreviewDocument.fileName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {inlineStageMeta.label} •{' '}
                              {getDocumentLabel(inlinePreviewDocument.stage, inlinePreviewDocument.documentType)}{' '}
                              • Uploaded {formatDateTimeDisplay(inlinePreviewDocument.uploadedAt)}
                              {inlinePreviewDocument.uploadedByName
                                ? ` by ${inlinePreviewDocument.uploadedByName}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewDocument(inlinePreviewDocument)}
                          title="Full screen preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button asChild variant="ghost" size="icon" title="Open in new tab">
                          <a href={inlinePreviewDocument.viewUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setInlinePreviewDocument(null)}
                          aria-label="Close inline preview"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-700">
                      <div className="h-[480px] w-full">
                        {inlineIsImage ? (
                          <div
                            className="h-full w-full bg-center bg-no-repeat bg-contain"
                            style={{ backgroundImage: `url(${inlinePreviewDocument.viewUrl})` }}
                          />
                        ) : inlineIsPdf ? (
                          <iframe
                            title={inlinePreviewDocument.fileName}
                            src={inlinePreviewDocument.viewUrl}
                            className="h-full w-full"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                            <div className="rounded-full border bg-white dark:bg-slate-800 p-3 text-slate-700 dark:text-slate-300 shadow-sm">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Preview not available
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Open the file in a new tab to view or download.
                              </p>
                            </div>
                            <Button asChild className="gap-2">
                              <a href={inlinePreviewDocument.viewUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Open file
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Shipping Section */}
            {activeTab === 'shipping' && (
              <div className="rounded-xl border bg-white dark:bg-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">Shipping</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Shipped: {formatDateTimeDisplay(order.shippedDate)} · Delivered:{' '}
                    {formatDateTimeDisplay(order.deliveredDate)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Shipped Date</label>
                  <Input
                    type="datetime-local"
                    value={shipForm.shippedDate}
                    onChange={e => setShipForm(prev => ({ ...prev, shippedDate: e.target.value }))}
                    disabled={!canEdit || submitting}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Delivered Date</label>
                  <Input
                    type="datetime-local"
                    value={shipForm.deliveredDate}
                    onChange={e =>
                      setShipForm(prev => ({ ...prev, deliveredDate: e.target.value }))
                    }
                    disabled={!canEdit || submitting}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Shipping Carrier *
                    {canEdit && !shipForm.shippingCarrier.trim() && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
                  </label>
                  <Input
                    value={shipForm.shippingCarrier}
                    onChange={e =>
                      setShipForm(prev => ({ ...prev, shippingCarrier: e.target.value }))
                    }
                    disabled={!canEdit || submitting}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Shipping Method *
                    {canEdit && !shipForm.shippingMethod.trim() && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
                  </label>
                  <Input
                    value={shipForm.shippingMethod}
                    onChange={e =>
                      setShipForm(prev => ({ ...prev, shippingMethod: e.target.value }))
                    }
                    disabled={!canEdit || submitting}
                    className="text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1.5">Tracking Number</label>
                  <Input
                    value={shipForm.trackingNumber}
                    onChange={e =>
                      setShipForm(prev => ({ ...prev, trackingNumber: e.target.value }))
                    }
                    disabled={!canEdit || submitting}
                    className="text-sm"
                  />
                </div>

                {canEdit && (
                  <div className="md:col-span-2 flex justify-end">
                    <Button onClick={handleShip} disabled={submitting} className="gap-2">
                      <Truck className="h-4 w-4" />
                      {submitting ? 'Shipping…' : 'Mark Shipped'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </PageContent>
      </PageContainer>

      {previewDocument && previewStageMeta && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-500 bg-opacity-75 transition-opacity"
              onClick={() => setPreviewDocument(null)}
            />

            <div className="relative w-full max-w-5xl overflow-hidden rounded-xl bg-white dark:bg-slate-800 text-left shadow-xl">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {PreviewStageIcon && <PreviewStageIcon className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{previewDocument.fileName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {previewStageMeta.label} • {getDocumentLabel(previewDocument.stage, previewDocument.documentType)} • Uploaded{' '}
                        {formatDateTimeDisplay(previewDocument.uploadedAt)}
                        {previewDocument.uploadedByName ? ` by ${previewDocument.uploadedByName}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <a href={previewDocument.viewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setPreviewDocument(null)}
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700">
                <div className="h-[75vh] w-full">
                  {previewIsImage ? (
                    <div
                      className="h-full w-full bg-center bg-no-repeat bg-contain"
                      style={{ backgroundImage: `url(${previewDocument.viewUrl})` }}
                    />
                  ) : previewIsPdf ? (
                    <iframe title={previewDocument.fileName} src={previewDocument.viewUrl} className="h-full w-full" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                      <div className="rounded-full border bg-white dark:bg-slate-800 p-3 text-slate-700 dark:text-slate-300 shadow-sm">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Preview not available</p>
                        <p className="mt-1 text-xs text-muted-foreground">Open the file in a new tab to view or download.</p>
                      </div>
                      <Button asChild className="gap-2">
                        <a href={previewDocument.viewUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open file
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Cancel fulfillment order?"
        message="This will cancel the order. No inventory will be shipped."
        confirmText="Cancel Order"
        cancelText="Keep"
        type="danger"
        onConfirm={() => {
          void handleCancel()
        }}
      />
    </>
  )
}
