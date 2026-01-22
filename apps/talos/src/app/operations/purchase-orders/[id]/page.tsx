'use client'

import Link from 'next/link'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ComponentType,
} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Check,
  ChevronRight,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  Factory,
  FileEdit,
  FileText,
  History,
  Info,
  Loader2,
  Package2,
  PackageX,
  Plus,
  Send,
  Ship,
  Trash2,
  Warehouse,
  Upload,
  X,
  XCircle,
} from '@/lib/lucide-icons'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PO_STATUS_LABELS } from '@/lib/constants/status-mappings'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'

// 5-Stage State Machine Types
type POStageStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'SHIPPED'
  | 'REJECTED'
  | 'CANCELLED'

interface PurchaseOrderLineSummary {
  id: string
  skuCode: string
  skuDescription: string | null
  batchLot: string | null
  cartonDimensionsCm?: string | null
  cartonSide1Cm?: number | null
  cartonSide2Cm?: number | null
  cartonSide3Cm?: number | null
  cartonWeightKg?: number | null
  packagingType?: string | null
  unitsOrdered: number
  unitsPerCarton: number
  quantity: number
  unitCost: number | null
  totalCost: number | null
  currency?: string
  status: 'PENDING' | 'POSTED' | 'CANCELLED'
  postedQuantity: number
  quantityReceived?: number | null
  lineNotes?: string | null
  createdAt: string
  updatedAt: string
}

interface SkuSummary {
  id: string
  skuCode: string
  description: string
}

interface BatchOption {
  batchCode: string
  unitsPerCarton: number | null
  cartonDimensionsCm: string | null
  cartonSide1Cm: number | null
  cartonSide2Cm: number | null
  cartonSide3Cm: number | null
  cartonWeightKg: number | null
  packagingType: string | null
}

function buildBatchPackagingMeta(options: {
  batch: BatchOption
  unitsOrdered: number
  unitsPerCarton: number | null
}): { text: string; tone: 'muted' | 'warning' } | null {
  const unitsOrdered = Number(options.unitsOrdered)
  const unitsPerCarton =
    options.unitsPerCarton && options.unitsPerCarton > 0 ? options.unitsPerCarton : null
  const cartons =
    unitsPerCarton && unitsOrdered > 0 ? Math.ceil(unitsOrdered / unitsPerCarton) : null

  const cartonTriplet = resolveDimensionTripletCm({
    side1Cm: options.batch.cartonSide1Cm,
    side2Cm: options.batch.cartonSide2Cm,
    side3Cm: options.batch.cartonSide3Cm,
    legacy: options.batch.cartonDimensionsCm,
  })

  const parts: string[] = []

  if (!cartonTriplet) {
    parts.push('Carton dims not set')

    if (options.batch.cartonWeightKg) {
      parts.push(`KG/ctn: ${options.batch.cartonWeightKg.toFixed(2)}`)
      if (cartons) {
        parts.push(`KG: ${(options.batch.cartonWeightKg * cartons).toFixed(2)}`)
      }
    }

    if (options.batch.packagingType) {
      parts.push(`Pkg: ${options.batch.packagingType}`)
    }

    return { tone: 'warning', text: parts.join(' • ') }
  }

  parts.push(`Carton: ${formatDimensionTripletCm(cartonTriplet)} cm`)
  const cbmPerCarton =
    (cartonTriplet.side1Cm * cartonTriplet.side2Cm * cartonTriplet.side3Cm) / 1_000_000
  parts.push(`CBM/ctn: ${cbmPerCarton.toFixed(3)}`)
  if (cartons) {
    parts.push(`CBM: ${(cbmPerCarton * cartons).toFixed(3)}`)
  }

  if (options.batch.cartonWeightKg) {
    parts.push(`KG/ctn: ${options.batch.cartonWeightKg.toFixed(2)}`)
    if (cartons) {
      parts.push(`KG: ${(options.batch.cartonWeightKg * cartons).toFixed(2)}`)
    }
  }

  if (options.batch.packagingType) {
    parts.push(`Pkg: ${options.batch.packagingType}`)
  }

  return { tone: 'muted', text: parts.join(' • ') }
}

type LinePackagingDetails = {
  cartonDims: string | null
  cbmPerCarton: string | null
  cbmTotal: string | null
  kgPerCarton: string | null
  kgTotal: string | null
  packagingType: string | null
  hasWarning: boolean
}

function buildLinePackagingDetails(line: PurchaseOrderLineSummary): LinePackagingDetails | null {
  if (!line.batchLot?.trim()) return null
  if (!Number.isFinite(line.quantity) || line.quantity <= 0) return null

  const cartonTriplet = resolveDimensionTripletCm({
    side1Cm: line.cartonSide1Cm ?? null,
    side2Cm: line.cartonSide2Cm ?? null,
    side3Cm: line.cartonSide3Cm ?? null,
    legacy: line.cartonDimensionsCm ?? null,
  })

  const hasWarning = !cartonTriplet && !line.cartonWeightKg && !line.packagingType

  let cbmPerCarton: number | null = null
  if (cartonTriplet) {
    cbmPerCarton =
      (cartonTriplet.side1Cm * cartonTriplet.side2Cm * cartonTriplet.side3Cm) / 1_000_000
  }

  return {
    cartonDims: cartonTriplet ? `${formatDimensionTripletCm(cartonTriplet)} cm` : null,
    cbmPerCarton: cbmPerCarton !== null ? cbmPerCarton.toFixed(3) : null,
    cbmTotal: cbmPerCarton !== null ? (cbmPerCarton * line.quantity).toFixed(3) : null,
    kgPerCarton: line.cartonWeightKg ? line.cartonWeightKg.toFixed(2) : null,
    kgTotal: line.cartonWeightKg ? (line.cartonWeightKg * line.quantity).toFixed(2) : null,
    packagingType: line.packagingType ?? null,
    hasWarning,
  }
}

interface StageApproval {
  stage: string
  approvedAt: string | null
  approvedBy: string | null
}

interface AuditLogUserSummary {
  id: string
  fullName: string | null
}

interface AuditLogEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  oldValue: unknown | null
  newValue: unknown | null
  changedBy: AuditLogUserSummary | null
  createdAt: string
}

interface StageData {
  manufacturing: {
    proformaInvoiceNumber: string | null
    proformaInvoiceDate: string | null
    factoryName: string | null
    manufacturingStartDate: string | null
    expectedCompletionDate: string | null
    actualCompletionDate: string | null
    totalWeightKg: number | null
    totalVolumeCbm: number | null
    totalCartons: number | null
    totalPallets: number | null
    packagingNotes: string | null
    // Legacy
    proformaInvoiceId: string | null
    proformaInvoiceData: unknown
    manufacturingStart: string | null
    manufacturingEnd: string | null
    cargoDetails: unknown
  }
  ocean: {
    houseBillOfLading: string | null
    masterBillOfLading: string | null
    commercialInvoiceNumber: string | null
    packingListRef: string | null
    vesselName: string | null
    voyageNumber: string | null
    portOfLoading: string | null
    portOfDischarge: string | null
    estimatedDeparture: string | null
    estimatedArrival: string | null
    actualDeparture: string | null
    actualArrival: string | null
    // Legacy
    commercialInvoiceId: string | null
  }
  warehouse: {
    warehouseCode: string | null
    warehouseName: string | null
    customsEntryNumber: string | null
    customsClearedDate: string | null
    dutyAmount: number | null
    dutyCurrency: string | null
    surrenderBlDate: string | null
    transactionCertNumber: string | null
    receivedDate: string | null
    discrepancyNotes: string | null
    // Legacy
    warehouseInvoiceId: string | null
    surrenderBL: string | null
    transactionCertificate: string | null
    customsDeclaration: string | null
  }
  shipped: {
    shipToName: string | null
    shipToAddress: string | null
    shipToCity: string | null
    shipToCountry: string | null
    shipToPostalCode: string | null
    shippingCarrier: string | null
    shippingMethod: string | null
    trackingNumber: string | null
    shippedDate: string | null
    proofOfDeliveryRef: string | null
    deliveredDate: string | null
    // Legacy
    proofOfDelivery: string | null
    shippedAt: string | null
    shippedBy: string | null
  }
}

interface PurchaseOrderSummary {
  id: string
  orderNumber: string
  poNumber: string | null
  type: 'PURCHASE' | 'ADJUSTMENT'
  status: POStageStatus
  isLegacy: boolean
  warehouseCode: string | null
  warehouseName: string | null
  counterpartyName: string | null
  expectedDate: string | null
  incoterms: string | null
  paymentTerms: string | null
  createdAt: string
  updatedAt: string
  notes?: string | null
  createdByName: string | null
  lines: PurchaseOrderLineSummary[]
  stageData: StageData
  approvalHistory: StageApproval[]
}

type PurchaseOrderDocumentStage = 'ISSUED' | 'MANUFACTURING' | 'OCEAN' | 'WAREHOUSE' | 'SHIPPED'

interface PurchaseOrderDocumentSummary {
  id: string
  stage: PurchaseOrderDocumentStage
  documentType: string
  fileName: string
  contentType: string
  size: number
  uploadedAt: string
  uploadedByName: string | null
  s3Key: string
  viewUrl: string
}

type CostRateSummary = {
  id: string
  costName: string
  costValue: number
  unitOfMeasure: string
}

type PurchaseOrderForwardingCostSummary = {
  id: string
  purchaseOrderId: string
  warehouse: { code: string; name: string }
  costRateId: string | null
  costName: string
  quantity: number
  unitRate: number
  totalCost: number
  currency: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  createdById: string | null
  createdByName: string | null
}

const STAGE_DOCUMENTS: Record<
  Exclude<PurchaseOrderDocumentStage, 'SHIPPED'>,
  Array<{ id: string; label: string }>
> = {
  ISSUED: [{ id: 'proforma_invoice', label: 'Signed PI / Proforma Invoice' }],
  MANUFACTURING: [{ id: 'box_artwork', label: 'Box Artwork' }],
  OCEAN: [
    { id: 'commercial_invoice', label: 'Commercial Invoice' },
    { id: 'bill_of_lading', label: 'Bill of Lading' },
    { id: 'packing_list', label: 'Packing List' },
  ],
  WAREHOUSE: [
    { id: 'movement_note', label: 'Movement Note / Warehouse Receipt' },
    { id: 'custom_declaration', label: 'Customs Declaration (CDS)' },
  ],
}

const DOCUMENT_STAGE_META: Record<
  PurchaseOrderDocumentStage,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  ISSUED: { label: 'Issued', icon: Send },
  MANUFACTURING: { label: 'Manufacturing', icon: Factory },
  OCEAN: { label: 'In Transit', icon: Ship },
  WAREHOUSE: { label: 'At Warehouse', icon: Warehouse },
  SHIPPED: { label: 'Shipped', icon: Package2 },
}

function formatDocumentTypeFallback(documentType: string) {
  const cleaned = documentType.trim().replace(/[_-]+/g, ' ')
  if (!cleaned) return 'Document'
  return cleaned.replace(/\b\w/g, match => match.toUpperCase())
}

function getDocumentLabel(stage: PurchaseOrderDocumentStage, documentType: string) {
  if (stage !== 'SHIPPED') {
    const required = STAGE_DOCUMENTS[stage] ?? []
    const match = required.find(candidate => candidate.id === documentType)
    if (match) return match.label
  }

  return formatDocumentTypeFallback(documentType)
}

// Stage configuration
const STAGES = [
  { value: 'DRAFT', label: 'Draft', icon: FileEdit, color: 'slate' },
  { value: 'ISSUED', label: 'Issued', icon: Send, color: 'emerald' },
  { value: 'MANUFACTURING', label: 'Manufacturing', icon: Factory, color: 'amber' },
  { value: 'OCEAN', label: 'In Transit', icon: Ship, color: 'blue' },
  { value: 'WAREHOUSE', label: 'At Warehouse', icon: Warehouse, color: 'purple' },
] as const

const INCOTERMS_OPTIONS = [
  'EXW',
  'FOB',
  'FCA',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
] as const

function formatStatusLabel(status: POStageStatus) {
  return PO_STATUS_LABELS[status] ?? status
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString()
}

function toAuditRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.trim().length ? value : '—'
  if (typeof value === 'number')
    return Number.isFinite(value) ? value.toLocaleString() : String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  try {
    const json = JSON.stringify(value)
    if (!json) return '—'
    return json.length > 140 ? `${json.slice(0, 137)}…` : json
  } catch {
    return String(value)
  }
}

function formatAuditFieldLabel(field: string): string {
  return field
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/_/g, ' ')
    .replaceAll(/\b\w/g, char => char.toUpperCase())
}

function describeAuditAction(action: string, newValue: Record<string, unknown> | null): string {
  switch (action) {
    case 'CREATE':
      return 'Created purchase order'
    case 'UPDATE_DETAILS':
      return 'Updated order details'
    case 'STATUS_TRANSITION': {
      const fromStatus = newValue?.fromStatus
      const toStatus = newValue?.toStatus
      if (typeof fromStatus === 'string' && typeof toStatus === 'string') {
        return `Stage: ${fromStatus} → ${toStatus}`
      }
      return 'Updated stage'
    }
    case 'LINE_ADD':
      return 'Added line item'
    case 'LINE_UPDATE':
      return 'Updated line item'
    case 'LINE_DELETE':
      return 'Removed line item'
    case 'CONTAINER_ADD':
      return 'Added container'
    case 'CONTAINER_UPDATE':
      return 'Updated container'
    case 'CONTAINER_DELETE':
      return 'Removed container'
    case 'DOCUMENT_UPLOAD':
      return 'Uploaded document'
    case 'DOCUMENT_REPLACE':
      return 'Replaced document'
    case 'VOID':
      return 'Voided purchase order'
    default:
      return action.replaceAll('_', ' ')
  }
}

function getAuditActionTheme(action: string): {
  Icon: ComponentType<{ className?: string }>
  wrapperClassName: string
  iconClassName: string
} {
  switch (action) {
    case 'CREATE':
      return {
        Icon: FileEdit,
        wrapperClassName: 'bg-emerald-50 border-emerald-200',
        iconClassName: 'text-emerald-700',
      }
    case 'UPDATE_DETAILS':
      return {
        Icon: FileEdit,
        wrapperClassName: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        iconClassName: 'text-slate-700 dark:text-slate-300',
      }
    case 'STATUS_TRANSITION':
      return {
        Icon: Send,
        wrapperClassName: 'bg-indigo-50 border-indigo-200',
        iconClassName: 'text-indigo-700',
      }
    case 'LINE_ADD':
    case 'LINE_UPDATE':
      return {
        Icon: Package2,
        wrapperClassName: 'bg-blue-50 border-blue-200',
        iconClassName: 'text-blue-700',
      }
    case 'LINE_DELETE':
      return {
        Icon: PackageX,
        wrapperClassName: 'bg-blue-50 border-blue-200',
        iconClassName: 'text-blue-700',
      }
    case 'CONTAINER_ADD':
    case 'CONTAINER_UPDATE':
    case 'CONTAINER_DELETE':
      return {
        Icon: Ship,
        wrapperClassName: 'bg-purple-50 border-purple-200',
        iconClassName: 'text-purple-700',
      }
    case 'DOCUMENT_UPLOAD':
    case 'DOCUMENT_REPLACE':
      return {
        Icon: Upload,
        wrapperClassName: 'bg-amber-50 border-amber-200',
        iconClassName: 'text-amber-800',
      }
    case 'VOID':
      return {
        Icon: XCircle,
        wrapperClassName: 'bg-rose-50 border-rose-200',
        iconClassName: 'text-rose-700',
      }
    default:
      return {
        Icon: History,
        wrapperClassName: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        iconClassName: 'text-slate-700 dark:text-slate-300',
      }
  }
}

function describeAuditChanges(entry: AuditLogEntry): string[] {
  const oldValue = toAuditRecord(entry.oldValue)
  const newValue = toAuditRecord(entry.newValue)

  switch (entry.action) {
    case 'LINE_ADD': {
      if (!newValue) return []
      const skuCode = newValue.skuCode
      const batchLot = newValue.batchLot
      const quantity = newValue.quantity
      const currency = newValue.currency
      const unitCost = newValue.unitCost
      const detail = [
        typeof skuCode === 'string' ? `SKU ${skuCode}` : null,
        typeof batchLot === 'string' ? `Batch ${batchLot}` : null,
        typeof quantity === 'number' ? `Qty ${quantity.toLocaleString()}` : null,
        unitCost != null && typeof currency === 'string'
          ? `Unit ${formatAuditValue(unitCost)} ${currency}`
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' • ')
      return detail ? [detail] : []
    }
    case 'LINE_DELETE': {
      if (!oldValue) return []
      const skuCode = oldValue.skuCode
      const batchLot = oldValue.batchLot
      const quantity = oldValue.quantity
      const detail = [
        typeof skuCode === 'string' ? `SKU ${skuCode}` : null,
        typeof batchLot === 'string' ? `Batch ${batchLot}` : null,
        typeof quantity === 'number' ? `Qty ${quantity.toLocaleString()}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' • ')
      return detail ? [detail] : []
    }
    case 'CONTAINER_ADD':
    case 'CONTAINER_DELETE': {
      const value = entry.action === 'CONTAINER_DELETE' ? oldValue : newValue
      if (!value) return []
      const number = value.containerNumber
      const size = value.containerSize
      const seal = value.sealNumber
      const detail = [
        typeof number === 'string' ? `#${number}` : null,
        typeof size === 'string' ? size : null,
        typeof seal === 'string' && seal.trim() ? `Seal ${seal}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' • ')
      return detail ? [detail] : []
    }
    case 'DOCUMENT_UPLOAD':
    case 'DOCUMENT_REPLACE': {
      if (!newValue) return []
      const stage = newValue.stage
      const documentType = newValue.documentType
      const fileName = newValue.fileName
      const detail = [
        typeof stage === 'string' ? stage : null,
        typeof documentType === 'string' ? documentType : null,
        typeof fileName === 'string' ? fileName : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' • ')
      return detail ? [detail] : []
    }
  }

  if (!oldValue && !newValue) return []

  const skipKeys = new Set([
    'approvedBy',
    'fromStatus',
    'toStatus',
    'status',
    'lineId',
    'containerId',
    'documentId',
    'deleted',
  ])

  const keys = new Set<string>([...Object.keys(oldValue ?? {}), ...Object.keys(newValue ?? {})])
  const changes: string[] = []

  for (const key of keys) {
    if (skipKeys.has(key)) continue
    const before = oldValue?.[key]
    const after = newValue?.[key]
    if (before === after) continue
    changes.push(
      `${formatAuditFieldLabel(key)}: ${formatAuditValue(before)} → ${formatAuditValue(after)}`
    )
  }

  return changes
}

function formatDateOnly(value: string | null) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

export default function PurchaseOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<PurchaseOrderSummary | null>(null)
  const [tenantDestination, setTenantDestination] = useState<string>('')
  const [tenantCurrency, setTenantCurrency] = useState<string>('USD')
  const [transitioning, setTransitioning] = useState(false)
  const [orderInfoEditing, setOrderInfoEditing] = useState(false)
  const [orderInfoSaving, setOrderInfoSaving] = useState(false)
  const [orderInfoDraft, setOrderInfoDraft] = useState({
    counterpartyName: '',
    expectedDate: '',
    incoterms: '',
    paymentTerms: '',
    notes: '',
  })

  // Stage transition form data
  const [stageFormData, setStageFormData] = useState<Record<string, string>>({})
  const [warehouses, setWarehouses] = useState<Array<{ id: string; code: string; name: string }>>(
    []
  )
  const [warehousesLoading, setWarehousesLoading] = useState(false)
  const [documents, setDocuments] = useState<PurchaseOrderDocumentSummary[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<Record<string, boolean>>({})
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)

  const [forwardingCosts, setForwardingCosts] = useState<PurchaseOrderForwardingCostSummary[]>(
    []
  )
  const [forwardingCostsLoading, setForwardingCostsLoading] = useState(false)
  const [forwardingRates, setForwardingRates] = useState<CostRateSummary[]>([])
  const [forwardingRatesLoading, setForwardingRatesLoading] = useState(false)
  const [forwardingWarehouseCode, setForwardingWarehouseCode] = useState('')
  const [newForwardingCostDraft, setNewForwardingCostDraft] = useState({
    costName: '',
    quantity: '',
    notes: '',
    currency: '',
  })
  const [forwardingCostSubmitting, setForwardingCostSubmitting] = useState(false)
  const [editingForwardingCostId, setEditingForwardingCostId] = useState<string | null>(null)
  const [editingForwardingCostDraft, setEditingForwardingCostDraft] = useState({
    costName: '',
    quantity: '',
    notes: '',
    currency: '',
  })
  const [forwardingCostDeletingId, setForwardingCostDeletingId] = useState<string | null>(null)

  const [skus, setSkus] = useState<SkuSummary[]>([])
  const [skusLoading, setSkusLoading] = useState(false)
  const [batchesBySkuId, setBatchesBySkuId] = useState<Record<string, BatchOption[]>>({})
  const [batchesLoadingBySkuId, setBatchesLoadingBySkuId] = useState<Record<string, boolean>>({})
  const [addLineOpen, setAddLineOpen] = useState(false)
  const [addLineSubmitting, setAddLineSubmitting] = useState(false)
  const [newLineDraft, setNewLineDraft] = useState({
    skuId: '',
    batchLot: '',
    unitsOrdered: 1,
    unitsPerCarton: null as number | null,
    totalCost: '',
    notes: '',
  })
  const [editLineOpen, setEditLineOpen] = useState(false)
  const [editLineSubmitting, setEditLineSubmitting] = useState(false)
  const [editingLine, setEditingLine] = useState<PurchaseOrderLineSummary | null>(null)
  const [editLineDraft, setEditLineDraft] = useState({
    batchLot: '',
    unitsOrdered: 1,
    unitsPerCarton: null as number | null,
    totalCost: '',
    notes: '',
  })

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'cancel' | 'reject' | 'delete-line' | null
    title: string
    message: string
    lineId?: string | null
  }>({ open: false, type: null, title: '', message: '', lineId: null })

  // Stage-based navigation - which stage view is currently selected
  const [selectedStageView, setSelectedStageView] = useState<string | null>(null)

  // Bottom section tabs
  const [activeBottomTab, setActiveBottomTab] = useState<
    'cargo' | 'costs' | 'documents' | 'details' | 'history'
  >('details')
  const [cargoSubTab, setCargoSubTab] = useState<'details' | 'attributes'>('details')
  const [previewDocument, setPreviewDocument] = useState<PurchaseOrderDocumentSummary | null>(null)

  // Advance stage modal
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      redirectToPortal(
        '/login',
        `${window.location.origin}${withBasePath(`/operations/purchase-orders/${params.id}`)}`
      )
      return
    }
    if (!['staff', 'admin'].includes(session.user.role)) {
      router.push('/dashboard')
      return
    }

    const loadWarehouses = async () => {
      try {
        setWarehousesLoading(true)
        const response = await fetch('/api/warehouses')
        if (!response.ok) return
        const payload: unknown = await response.json().catch(() => null)

        const listCandidate: unknown =
          payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
            ? (payload as { data?: unknown }).data
            : payload

        if (!Array.isArray(listCandidate)) {
          setWarehouses([])
          return
        }

        const parsed = listCandidate
          .map((item): { id: string; code: string; name: string } | null => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null
            const record = item as Record<string, unknown>
            const id = record.id
            const code = record.code
            const name = record.name
            if (typeof id !== 'string' || typeof code !== 'string' || typeof name !== 'string') return null
            if (!id.trim()) return null
            if (!code.trim() || !name.trim()) return null
            return { id, code, name }
          })
          .filter((value): value is { id: string; code: string; name: string } => value !== null)

        setWarehouses(parsed)
      } catch (_error) {
        // Non-blocking; warehouse can still be selected later via API if needed.
      } finally {
        setWarehousesLoading(false)
      }
    }

    const loadTenant = async () => {
      try {
        const response = await fetch('/api/tenant/current')
        if (!response.ok) return
        const payload = await response.json().catch(() => null)
        const currency = payload?.current?.currency
        const tenantName = payload?.current?.name
        const tenantCode = payload?.current?.displayName ?? payload?.current?.code
        if (typeof currency === 'string' && currency.trim()) {
          setTenantCurrency(currency.trim().toUpperCase())
        }
        if (typeof tenantName !== 'string' || !tenantName.trim()) return
        const label =
          typeof tenantCode === 'string' && tenantCode.trim()
            ? `${tenantName.trim()} (${tenantCode.trim().toUpperCase()})`
            : tenantName.trim()
        setTenantDestination(label)
      } catch {
        // Non-blocking
      }
    }

    const loadOrder = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/purchase-orders/${params.id}`)
        if (!response.ok) {
          throw new Error('Failed to load purchase order')
        }
        const data = await response.json()
        setOrder(data)
      } catch (_error) {
        toast.error('Failed to load purchase order')
        router.push('/operations/purchase-orders')
      } finally {
        setLoading(false)
      }
    }

    loadWarehouses()
    loadTenant()
    loadOrder()
  }, [params.id, router, session, status])

  useEffect(() => {
    if (!order) return
    if (orderInfoEditing) return

    setOrderInfoDraft({
      counterpartyName: order.counterpartyName ?? '',
      expectedDate: formatDateOnly(order.expectedDate),
      incoterms: order.incoterms ?? '',
      paymentTerms: order.paymentTerms ?? '',
      notes: order.notes ?? '',
    })
  }, [order, orderInfoEditing])

  const refreshDocuments = useCallback(async () => {
    const orderId = order?.id
    if (!orderId) return

    try {
      setDocumentsLoading(true)
      const response = await fetch(`/api/purchase-orders/${orderId}/documents`)
      if (!response.ok) {
        setDocuments([])
        return
      }

      const payload = await response.json().catch(() => null)
      const list = payload?.documents
      setDocuments(Array.isArray(list) ? (list as PurchaseOrderDocumentSummary[]) : [])
    } catch {
      setDocuments([])
    } finally {
      setDocumentsLoading(false)
    }
  }, [order?.id])

  useEffect(() => {
    void refreshDocuments()
  }, [refreshDocuments])

  const refreshAuditLogs = useCallback(async () => {
    const orderId = order?.id
    if (!orderId) return

    try {
      setAuditLogsLoading(true)
      const response = await fetch(
        `/api/audit-logs?entityType=PurchaseOrder&entityId=${encodeURIComponent(orderId)}&limit=200`
      )

      if (!response.ok) {
        setAuditLogs([])
        return
      }

      const payload = await response.json().catch(() => null)
      const list = payload?.logs
      setAuditLogs(Array.isArray(list) ? (list as AuditLogEntry[]) : [])
    } catch {
      setAuditLogs([])
    } finally {
      setAuditLogsLoading(false)
    }
  }, [order?.id])

  useEffect(() => {
    void refreshAuditLogs()
  }, [refreshAuditLogs])

  useEffect(() => {
    const selected = forwardingWarehouseCode.trim()
    if (selected) return
    const next = order?.warehouseCode
    if (!next) return
    setForwardingWarehouseCode(next)
  }, [forwardingWarehouseCode, order?.warehouseCode])

  const refreshForwardingCosts = useCallback(async () => {
    const orderId = order?.id
    if (!orderId) return

    try {
      setForwardingCostsLoading(true)
      const response = await fetch(`/api/purchase-orders/${orderId}/forwarding-costs`)
      if (!response.ok) {
        setForwardingCosts([])
        return
      }

      const payload = await response.json().catch(() => null)
      const list = payload?.data
      setForwardingCosts(Array.isArray(list) ? (list as PurchaseOrderForwardingCostSummary[]) : [])
    } catch {
      setForwardingCosts([])
    } finally {
      setForwardingCostsLoading(false)
    }
  }, [order?.id])

  useEffect(() => {
    void refreshForwardingCosts()
  }, [refreshForwardingCosts])

  const selectedForwardingWarehouse = useMemo(() => {
    const code = forwardingWarehouseCode.trim()
    if (!code) return null
    const match = warehouses.find(row => row.code === code)
    if (!match) return null
    return match
  }, [forwardingWarehouseCode, warehouses])

  const forwardingWarehouseId = selectedForwardingWarehouse ? selectedForwardingWarehouse.id : null

  useEffect(() => {
    if (!forwardingWarehouseId) {
      setForwardingRates([])
      return
    }

    const loadRates = async () => {
      try {
        setForwardingRatesLoading(true)
        const response = await fetch(
          `/api/rates?warehouseId=${encodeURIComponent(forwardingWarehouseId)}&costCategory=Forwarding&activeOnly=true`
        )

        if (!response.ok) {
          setForwardingRates([])
          return
        }

        const payload: unknown = await response.json().catch(() => null)
        if (!Array.isArray(payload)) {
          setForwardingRates([])
          return
        }

        const byName = new Map<string, CostRateSummary>()
        for (const item of payload) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue
          const record = item as Record<string, unknown>
          const id = record.id
          const costName = record.costName
          const unitOfMeasure = record.unitOfMeasure
          const rawValue = record.costValue

          if (typeof id !== 'string') continue
          if (typeof costName !== 'string') continue
          if (typeof unitOfMeasure !== 'string') continue

          const parsedValue = typeof rawValue === 'number' ? rawValue : Number(rawValue)
          if (!Number.isFinite(parsedValue)) continue

          if (!byName.has(costName)) {
            byName.set(costName, {
              id,
              costName,
              unitOfMeasure,
              costValue: parsedValue,
            })
          }
        }

        const nextRates = Array.from(byName.values()).sort((a, b) => a.costName.localeCompare(b.costName))
        setForwardingRates(nextRates)
      } catch {
        setForwardingRates([])
      } finally {
        setForwardingRatesLoading(false)
      }
    }

    void loadRates()
  }, [forwardingWarehouseId])

  const forwardingRateByName = useMemo(() => {
    const map = new Map<string, CostRateSummary>()
    for (const rate of forwardingRates) {
      map.set(rate.costName, rate)
    }
    return map
  }, [forwardingRates])

  const forwardingSubtotal = useMemo(
    () => forwardingCosts.reduce((sum, row) => sum + Number(row.totalCost), 0),
    [forwardingCosts]
  )

  const createForwardingCost = useCallback(async () => {
    if (!order) return
    if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
      toast.error('Cargo costs can be edited during In Transit or At Warehouse stages')
      return
    }

    const warehouseCode = forwardingWarehouseCode.trim()
    if (!warehouseCode) {
      toast.error('Select a warehouse to use its forwarding rates')
      return
    }

    const costName = newForwardingCostDraft.costName.trim()
    if (!costName) {
      toast.error('Select a cost type')
      return
    }

    const quantity = Number(newForwardingCostDraft.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }

    try {
      setForwardingCostSubmitting(true)
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/forwarding-costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseCode,
          costName,
          quantity,
          notes: newForwardingCostDraft.notes,
          currency: newForwardingCostDraft.currency,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const errorMessage = typeof payload?.error === 'string' ? payload.error : null
        const detailsMessage = typeof payload?.details === 'string' ? payload.details : null
        if (errorMessage && detailsMessage) {
          toast.error(`${errorMessage}: ${detailsMessage}`)
        } else if (errorMessage) {
          toast.error(errorMessage)
        } else {
          toast.error(`Failed to add cargo cost (HTTP ${response.status})`)
        }
        return
      }

      const created = (await response.json()) as PurchaseOrderForwardingCostSummary
      setForwardingCosts(prev => [...prev, created])
      setNewForwardingCostDraft({ costName: '', quantity: '', notes: '', currency: '' })
      toast.success('Cargo cost added')
    } catch {
      toast.error('Failed to add cargo cost')
    } finally {
      setForwardingCostSubmitting(false)
    }
  }, [
    forwardingWarehouseCode,
    newForwardingCostDraft.costName,
    newForwardingCostDraft.currency,
    newForwardingCostDraft.notes,
    newForwardingCostDraft.quantity,
    order,
  ])

  const startEditForwardingCost = useCallback((row: PurchaseOrderForwardingCostSummary) => {
    setEditingForwardingCostId(row.id)
    setEditingForwardingCostDraft({
      costName: row.costName,
      quantity: String(row.quantity),
      notes: row.notes ?? '',
      currency: row.currency ?? '',
    })
  }, [])

  const cancelEditForwardingCost = useCallback(() => {
    setEditingForwardingCostId(null)
    setEditingForwardingCostDraft({ costName: '', quantity: '', notes: '', currency: '' })
  }, [])

  const saveEditForwardingCost = useCallback(async () => {
    if (!order) return
    if (!editingForwardingCostId) return
    if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
      toast.error('Cargo costs can be edited during In Transit or At Warehouse stages')
      return
    }

    const costName = editingForwardingCostDraft.costName.trim()
    if (!costName) {
      toast.error('Select a cost type')
      return
    }

    const quantity = Number(editingForwardingCostDraft.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Quantity must be a positive number')
      return
    }

    try {
      setForwardingCostSubmitting(true)
      const response = await fetchWithCSRF(
        `/api/purchase-orders/${order.id}/forwarding-costs/${editingForwardingCostId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            costName,
            quantity,
            notes: editingForwardingCostDraft.notes,
            currency: editingForwardingCostDraft.currency,
          }),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const errorMessage = typeof payload?.error === 'string' ? payload.error : null
        const detailsMessage = typeof payload?.details === 'string' ? payload.details : null
        if (errorMessage && detailsMessage) {
          toast.error(`${errorMessage}: ${detailsMessage}`)
        } else if (errorMessage) {
          toast.error(errorMessage)
        } else {
          toast.error(`Failed to update cargo cost (HTTP ${response.status})`)
        }
        return
      }

      const updated = (await response.json()) as PurchaseOrderForwardingCostSummary
      setForwardingCosts(prev => prev.map(row => (row.id === updated.id ? updated : row)))
      cancelEditForwardingCost()
      toast.success('Cargo cost updated')
    } catch {
      toast.error('Failed to update cargo cost')
    } finally {
      setForwardingCostSubmitting(false)
    }
  }, [
    cancelEditForwardingCost,
    editingForwardingCostDraft.costName,
    editingForwardingCostDraft.currency,
    editingForwardingCostDraft.notes,
    editingForwardingCostDraft.quantity,
    editingForwardingCostId,
    order,
  ])

  const deleteForwardingCost = useCallback(
    async (row: PurchaseOrderForwardingCostSummary) => {
      if (!order) return
      if (order.status !== 'OCEAN' && order.status !== 'WAREHOUSE') {
        toast.error('Cargo costs can be edited during In Transit or At Warehouse stages')
        return
      }

      try {
        setForwardingCostDeletingId(row.id)
        const response = await fetchWithCSRF(
          `/api/purchase-orders/${order.id}/forwarding-costs/${row.id}`,
          {
            method: 'DELETE',
          }
        )

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const errorMessage = typeof payload?.error === 'string' ? payload.error : null
          if (errorMessage) {
            toast.error(errorMessage)
          } else {
            toast.error(`Failed to delete cargo cost (HTTP ${response.status})`)
          }
          return
        }

        setForwardingCosts(prev => prev.filter(item => item.id !== row.id))
        toast.success('Cargo cost deleted')
      } catch {
        toast.error('Failed to delete cargo cost')
      } finally {
        setForwardingCostDeletingId(null)
      }
    },
    [order]
  )

  const handleDocumentUpload = useCallback(
    async (
      event: ChangeEvent<HTMLInputElement>,
      stage: PurchaseOrderDocumentStage,
      documentType: string
    ) => {
      const orderId = order?.id
      const input = event.target
      const file = input.files?.[0]
      if (!orderId || !file) return

      const key = `${stage}::${documentType}`
      setUploadingDoc(prev => ({ ...prev, [key]: true }))

      try {
        // Step 1: Request presigned URL for direct S3 upload
        const presignedResponse = await fetchWithCSRF(
          `/api/purchase-orders/${orderId}/documents/presigned-url`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
              stage,
              documentType,
            }),
          }
        )

        if (!presignedResponse.ok) {
          const payload = await presignedResponse.json().catch(() => null)
          const errorMessage = typeof payload?.error === 'string' ? payload.error : null
          throw new Error(errorMessage ?? `Failed to get upload URL (HTTP ${presignedResponse.status})`)
        }

        const { uploadUrl, s3Key } = await presignedResponse.json()

        // Step 2: Upload file directly to S3 (bypasses Next.js body size limits)
        const s3Response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        })

        if (!s3Response.ok) {
          throw new Error(`Failed to upload to storage (HTTP ${s3Response.status})`)
        }

        // Step 3: Register the uploaded document with the backend
        const completeResponse = await fetchWithCSRF(`/api/purchase-orders/${orderId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage,
            documentType,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            s3Key,
          }),
        })

        if (!completeResponse.ok) {
          const payload = await completeResponse.json().catch(() => null)
          const errorMessage = typeof payload?.error === 'string' ? payload.error : null
          const detailsMessage = typeof payload?.details === 'string' ? payload.details : null
          if (errorMessage && detailsMessage) {
            toast.error(`${errorMessage}: ${detailsMessage}`)
          } else if (errorMessage) {
            toast.error(errorMessage)
          } else {
            toast.error(`Failed to register document (HTTP ${completeResponse.status})`)
          }
          return
        }

        await refreshDocuments()
        void refreshAuditLogs()
        toast.success('Document uploaded')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload document')
      } finally {
        setUploadingDoc(prev => ({ ...prev, [key]: false }))
        input.value = ''
      }
    },
    [order?.id, refreshAuditLogs, refreshDocuments]
  )

  const ensureSkusLoaded = useCallback(async () => {
    if (skusLoading || skus.length > 0) return

    try {
      setSkusLoading(true)
      const response = await fetch('/api/skus')
      if (!response.ok) {
        setSkus([])
        return
      }
      const payload = await response.json().catch(() => null)
      setSkus(Array.isArray(payload) ? (payload as SkuSummary[]) : [])
    } catch {
      setSkus([])
    } finally {
      setSkusLoading(false)
    }
  }, [skus.length, skusLoading])

  const ensureSkuBatchesLoaded = useCallback(
    async (skuId: string) => {
      if (!skuId) return
      if (batchesBySkuId[skuId]) return
      if (batchesLoadingBySkuId[skuId]) return

      setBatchesLoadingBySkuId(prev => ({ ...prev, [skuId]: true }))
      try {
        const response = await fetch(`/api/skus/${encodeURIComponent(skuId)}/batches`, {
          credentials: 'include',
        })

        if (!response.ok) {
          setBatchesBySkuId(prev => ({ ...prev, [skuId]: [] }))
          return
        }

        const payload = await response.json().catch(() => null)
        const batches = Array.isArray(payload?.batches) ? payload.batches : []
        const coercePositiveInt = (value: unknown): number | null => {
          if (typeof value === 'number') {
            return Number.isInteger(value) && value > 0 ? value : null
          }
          if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value.trim())
            return Number.isInteger(parsed) && parsed > 0 ? parsed : null
          }
          return null
        }
        const coercePositiveNumber = (value: unknown): number | null => {
          if (typeof value === 'number') {
            return Number.isFinite(value) && value > 0 ? value : null
          }
          if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value.trim())
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null
          }
          return null
        }
        const coerceString = (value: unknown): string | null => {
          if (typeof value !== 'string') return null
          const trimmed = value.trim()
          return trimmed ? trimmed : null
        }

        const parsedBatches: BatchOption[] = batches
          .map((batch: Record<string, unknown>): BatchOption | null => {
            const batchCode = String(batch?.batchCode ?? '')
              .trim()
              .toUpperCase()
            if (!batchCode || batchCode === 'DEFAULT') return null

            return {
              batchCode,
              unitsPerCarton: coercePositiveInt(batch?.unitsPerCarton),
              cartonDimensionsCm: coerceString(batch?.cartonDimensionsCm),
              cartonSide1Cm: coercePositiveNumber(batch?.cartonSide1Cm),
              cartonSide2Cm: coercePositiveNumber(batch?.cartonSide2Cm),
              cartonSide3Cm: coercePositiveNumber(batch?.cartonSide3Cm),
              cartonWeightKg: coercePositiveNumber(batch?.cartonWeightKg),
              packagingType: (() => {
                const raw = coerceString(batch?.packagingType)
                return raw ? raw.toUpperCase() : null
              })(),
            }
          })
          .filter((batch): batch is BatchOption => Boolean(batch))

        const unique = Array.from(
          new Map(parsedBatches.map(batch => [batch.batchCode, batch])).values()
        )

        setBatchesBySkuId(prev => ({ ...prev, [skuId]: unique }))
      } catch {
        setBatchesBySkuId(prev => ({ ...prev, [skuId]: [] }))
      } finally {
        setBatchesLoadingBySkuId(prev => ({ ...prev, [skuId]: false }))
      }
    },
    [batchesBySkuId, batchesLoadingBySkuId]
  )

  useEffect(() => {
    if (!editLineOpen || !editingLine) return

    const skuRecord =
      skus.find(
        sku => sku.skuCode.trim().toUpperCase() === editingLine.skuCode.trim().toUpperCase()
      ) ?? null

    if (!skuRecord) {
      void ensureSkusLoaded()
      return
    }

    void ensureSkuBatchesLoaded(skuRecord.id)
  }, [editLineOpen, editingLine, ensureSkuBatchesLoaded, ensureSkusLoaded, skus])

  useEffect(() => {
    if (!newLineDraft.skuId) return
    const options = batchesBySkuId[newLineDraft.skuId]
    if (!options || options.length === 0) return
    if (
      newLineDraft.batchLot &&
      options.some(option => option.batchCode === newLineDraft.batchLot)
    ) {
      return
    }

    setNewLineDraft(prev => {
      if (prev.skuId !== newLineDraft.skuId) return prev
      const selected = options[0]
      return {
        ...prev,
        batchLot: selected.batchCode,
        unitsPerCarton: selected.unitsPerCarton ?? null,
      }
    })
  }, [batchesBySkuId, newLineDraft.batchLot, newLineDraft.skuId])

  useEffect(() => {
    if (!addLineOpen) return
    void ensureSkusLoaded()
  }, [addLineOpen, ensureSkusLoaded])

  const currentStageIndex = useMemo(() => {
    if (!order) return 0
    const idx = STAGES.findIndex(s => s.value === order.status)
    if (idx >= 0) return idx
    if (order.status === 'SHIPPED') return STAGES.length - 1
    return 0
  }, [order])

  // The stage view being displayed (defaults to current stage)
  const activeViewStage = useMemo(() => {
    if (selectedStageView) return selectedStageView
    if (!order) return 'DRAFT'
    return order.status
  }, [selectedStageView, order])

  // Can user click on a stage to view it?
  const canViewStage = (stageValue: string) => {
    if (!order || order.status === 'CANCELLED') return false
    const targetIdx = STAGES.findIndex(s => s.value === stageValue)
    if (targetIdx < 0) return false
    // Can view completed stages and current stage only
    return targetIdx <= currentStageIndex
  }

  const nextStage = useMemo(() => {
    if (!order || order.status === 'CANCELLED') return null
    const idx = STAGES.findIndex(s => s.value === order.status)
    if (idx >= 0 && idx < STAGES.length - 1) {
      return STAGES[idx + 1]
    }
    return null
  }, [order])

  const nextStageDocsComplete = useMemo(() => {
    if (!order || !nextStage) return true
    const stage = nextStage.value as keyof typeof STAGE_DOCUMENTS
    const required = STAGE_DOCUMENTS[stage] ?? []
    if (required.length === 0) return true

    return required.every(req =>
      documents.some(doc => doc.stage === stage && doc.documentType === req.id)
    )
  }, [documents, nextStage, order])

  useEffect(() => {
    if (!advanceModalOpen || !order || !nextStage) return
    if (nextStage.value !== 'MANUFACTURING') return

    setStageFormData(prev => {
      if (prev.totalCartons?.trim()) return prev
      const cartons = order.lines.reduce((sum, line) => sum + line.quantity, 0)
      if (cartons <= 0) return prev
      return { ...prev, totalCartons: String(cartons) }
    })
  }, [advanceModalOpen, nextStage, order])

  const handleTransition = async (targetStatus: POStageStatus) => {
    if (!order || transitioning) return

    // Show confirmation dialog for cancel
    if (targetStatus === 'CANCELLED') {
      setConfirmDialog({
        open: true,
        type: 'cancel',
        title: 'Cancel Order',
        message: 'Are you sure you want to cancel this order? This cannot be undone.',
      })
      return
    }

    if (targetStatus === 'REJECTED') {
      setConfirmDialog({
        open: true,
        type: 'reject',
        title: 'Mark as Rejected',
        message:
          'Mark this PO as rejected by the supplier? You can reopen it as a draft to revise and re-issue.',
      })
      return
    }

    await executeTransition(targetStatus)
  }

  const executeTransition = async (targetStatus: POStageStatus): Promise<boolean> => {
    if (!order || transitioning) return false

    try {
      setTransitioning(true)
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStatus,
          stageData: stageFormData,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        toast.error(payload?.error ?? 'Failed to transition order')
        return false
      }

      const updated = await response.json()
      setOrder(updated)
      setStageFormData({}) // Clear form
      void refreshAuditLogs()
      toast.success(`Order moved to ${formatStatusLabel(targetStatus)}`)
      return true
    } catch (_error) {
      toast.error('Failed to transition order')
      return false
    } finally {
      setTransitioning(false)
    }
  }

  const handleConfirmDialogConfirm = async () => {
    if (confirmDialog.type === 'cancel') {
      await executeTransition('CANCELLED')
    }
    if (confirmDialog.type === 'reject') {
      await executeTransition('REJECTED')
    }
    if (confirmDialog.type === 'delete-line' && confirmDialog.lineId) {
      await handleDeleteLine(confirmDialog.lineId)
    }
    setConfirmDialog({ open: false, type: null, title: '', message: '', lineId: null })
  }

  const handleConfirmDialogClose = () => {
    setConfirmDialog({ open: false, type: null, title: '', message: '', lineId: null })
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Loading purchase order...</span>
        </div>
      </div>
    )
  }

  if (!order) {
    return null
  }

  const totalUnits = order.lines.reduce((sum, line) => sum + (line.unitsOrdered ?? 0), 0)
  const totalCartons = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const isTerminal =
    order.status === 'SHIPPED' || order.status === 'CANCELLED' || order.status === 'REJECTED'
  const canEdit = !isTerminal && order.status === 'DRAFT'
  const canEditForwardingCosts =
    !isTerminal && (order.status === 'OCEAN' || order.status === 'WAREHOUSE')

  const draftForwardingRate = forwardingRateByName.get(newForwardingCostDraft.costName.trim())
  const draftForwardingUnitRate = draftForwardingRate ? draftForwardingRate.costValue : null
  const draftForwardingQuantity = Number(newForwardingCostDraft.quantity)
  const draftForwardingTotal =
    draftForwardingUnitRate !== null &&
    Number.isFinite(draftForwardingQuantity) &&
    draftForwardingQuantity > 0
      ? Number((draftForwardingUnitRate * draftForwardingQuantity).toFixed(2))
      : null

  const editingForwardingRate = forwardingRateByName.get(editingForwardingCostDraft.costName.trim())
  const editingForwardingUnitRate = editingForwardingRate ? editingForwardingRate.costValue : null
  const editingForwardingQuantity = Number(editingForwardingCostDraft.quantity)
  const editingForwardingTotal =
    editingForwardingUnitRate !== null &&
    Number.isFinite(editingForwardingQuantity) &&
    editingForwardingQuantity > 0
      ? Number((editingForwardingUnitRate * editingForwardingQuantity).toFixed(2))
      : null
  const canDownloadPdf = true
  const documentsCount = documents.length
  const historyCount = auditLogs.length || order.approvalHistory?.length || 0
  const selectedSku = newLineDraft.skuId
    ? skus.find(sku => sku.id === newLineDraft.skuId)
    : undefined
  const documentStages: PurchaseOrderDocumentStage[] = [
    'ISSUED',
    'MANUFACTURING',
    'OCEAN',
    'WAREHOUSE',
  ]
  if (documents.some(doc => doc.stage === 'SHIPPED')) {
    documentStages.push('SHIPPED')
  }
  const previewStageMeta = previewDocument ? DOCUMENT_STAGE_META[previewDocument.stage] : null
  const PreviewStageIcon = previewStageMeta ? previewStageMeta.icon : null
  const previewIsPdf = Boolean(
    previewDocument &&
      (previewDocument.contentType === 'application/pdf' ||
        previewDocument.fileName.toLowerCase().endsWith('.pdf'))
  )
  const previewIsImage = Boolean(
    previewDocument && previewDocument.contentType.startsWith('image/')
  )

  const handleSaveOrderInfo = async () => {
    if (!order) return
    if (!orderInfoDraft.counterpartyName.trim()) {
      toast.error('Supplier is required')
      return
    }

    try {
      setOrderInfoSaving(true)
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterpartyName: orderInfoDraft.counterpartyName.trim(),
          expectedDate: orderInfoDraft.expectedDate.trim()
            ? orderInfoDraft.expectedDate.trim()
            : null,
          incoterms: orderInfoDraft.incoterms.trim() ? orderInfoDraft.incoterms.trim() : null,
          paymentTerms: orderInfoDraft.paymentTerms.trim()
            ? orderInfoDraft.paymentTerms.trim()
            : null,
          notes: orderInfoDraft.notes.trim() ? orderInfoDraft.notes.trim() : null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to save order details')
      }

      const updated = await response.json()
      setOrder(updated)
      setOrderInfoEditing(false)
      void refreshAuditLogs()
      toast.success('Order details updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save order details')
    } finally {
      setOrderInfoSaving(false)
    }
  }

  const openLineEditor = (line: PurchaseOrderLineSummary) => {
    setEditingLine(line)
    setEditLineDraft({
      batchLot: line.batchLot ?? '',
      unitsOrdered: line.unitsOrdered,
      unitsPerCarton: line.unitsPerCarton,
      totalCost: line.totalCost !== null ? String(line.totalCost) : '',
      notes: line.lineNotes ?? '',
    })
    setEditLineOpen(true)
  }

  const handleSaveLineEdit = async () => {
    if (!order || !editingLine) return

    const batchLot = editLineDraft.batchLot.trim().toUpperCase()
    if (!batchLot || batchLot === 'DEFAULT') {
      toast.error('Batch is required')
      return
    }

    const unitsOrdered = Number(editLineDraft.unitsOrdered)
    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) {
      toast.error('Please enter a valid units ordered value')
      return
    }

    const unitsPerCarton = editLineDraft.unitsPerCarton
    if (!unitsPerCarton || !Number.isInteger(unitsPerCarton) || unitsPerCarton <= 0) {
      toast.error('Please enter a valid units per carton value')
      return
    }

    const totalCostInput = editLineDraft.totalCost.trim()
    const totalCost =
      totalCostInput.length === 0
        ? null
        : (() => {
            const parsed = Number(totalCostInput)
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
          })()

    if (totalCostInput.length > 0 && totalCost === null) {
      toast.error('Please enter a valid total cost')
      return
    }

    setEditLineSubmitting(true)
    try {
      const response = await fetchWithCSRF(
        `/api/purchase-orders/${order.id}/lines/${editingLine.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchLot,
            unitsOrdered,
            unitsPerCarton,
            totalCost,
            notes: editLineDraft.notes.trim().length ? editLineDraft.notes.trim() : null,
          }),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to update line item')
      }

      const updatedLine = await response.json()
      setOrder(prev =>
        prev
          ? {
              ...prev,
              lines: prev.lines.map(line => (line.id === updatedLine.id ? updatedLine : line)),
            }
          : prev
      )
      setEditLineOpen(false)
      setEditingLine(null)
      void refreshAuditLogs()
      toast.success('Line item updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update line item')
    } finally {
      setEditLineSubmitting(false)
    }
  }

  const handleDeleteLine = async (lineId: string) => {
    if (!order) return

    try {
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/lines/${lineId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to remove line item')
      }

      setOrder(prev =>
        prev ? { ...prev, lines: prev.lines.filter(line => line.id !== lineId) } : prev
      )
      if (editingLine?.id === lineId) {
        setEditLineOpen(false)
        setEditingLine(null)
      }
      void refreshAuditLogs()
      toast.success('Line item removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove line item')
    }
  }

  const handleAddLineItem = async () => {
    if (!order) return
    if (!selectedSku) {
      toast.error('Please select a SKU')
      return
    }

    const batchLot = newLineDraft.batchLot.trim()
    if (!batchLot) {
      toast.error('Please select a batch')
      return
    }

    const unitsOrdered = Number(newLineDraft.unitsOrdered)
    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) {
      toast.error('Please enter a valid units ordered value')
      return
    }

    const unitsPerCarton = newLineDraft.unitsPerCarton
    if (!unitsPerCarton || !Number.isInteger(unitsPerCarton) || unitsPerCarton <= 0) {
      toast.error('Please enter a valid units per carton value')
      return
    }

    const totalCostInput = newLineDraft.totalCost.trim()
    const totalCost =
      totalCostInput.length === 0
        ? undefined
        : (() => {
            const parsed = Number(totalCostInput)
            return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
          })()

    if (totalCost === null) {
      toast.error('Please enter a valid total cost')
      return
    }

    setAddLineSubmitting(true)
    try {
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuCode: selectedSku.skuCode,
          skuDescription: selectedSku.description,
          batchLot,
          unitsOrdered,
          unitsPerCarton,
          totalCost,
          currency: tenantCurrency,
          notes: newLineDraft.notes.trim() ? newLineDraft.notes.trim() : undefined,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to add line item')
      }

      const createdLine = (await response.json()) as PurchaseOrderLineSummary
      setOrder(prev => (prev ? { ...prev, lines: [...prev.lines, createdLine] } : prev))
      toast.success('Line item added')
      setAddLineOpen(false)
      setNewLineDraft({
        skuId: '',
        batchLot: '',
        unitsOrdered: 1,
        unitsPerCarton: null,
        totalCost: '',
        notes: '',
      })
      void refreshAuditLogs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add line item')
    } finally {
      setAddLineSubmitting(false)
    }
  }

  const handleDownloadPdf = () => {
    if (!order) return
    // Open the HTML-based PO document in a new tab for printing
    window.open(withBasePath(`/api/purchase-orders/${order.id}/pdf`), '_blank')
  }

  // Stage-specific form fields based on next stage
  const renderStageTransitionForm = () => {
    if (!nextStage) return null

    const fields: Array<{
      key: string
      label: string
      type: 'text' | 'date' | 'select' | 'number'
      placeholder?: string
      options?: Array<{ value: string; label: string }>
      disabled?: boolean
    }> = []

    const intro =
      nextStage.value === 'ISSUED'
        ? (() => {
            const missingFields = [
              !order?.expectedDate ? 'Cargo ready date' : null,
              !order?.incoterms ? 'Incoterms' : null,
              !order?.paymentTerms ? 'Payment terms' : null,
            ].filter((value): value is string => value !== null)

            fields.push(
              {
                key: 'proformaInvoiceNumber',
                label: 'Proforma Invoice Number (PI #)',
                type: 'text',
              },
              { key: 'proformaInvoiceDate', label: 'Proforma Invoice Date', type: 'date' }
            )

            return (
              <div className="space-y-3">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Marking this PO as issued means the supplier accepted it (signed PI received).
                  This locks draft edits.
                </p>
                {missingFields.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Missing required details: {missingFields.join(', ')}. Set them in Order Details.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload the signed PI and enter its reference number before advancing.
                </p>
              </div>
            )
          })()
        : null

    switch (nextStage.value) {
      case 'MANUFACTURING':
        fields.push(
          { key: 'manufacturingStartDate', label: 'Manufacturing Start Date', type: 'date' },
          { key: 'expectedCompletionDate', label: 'Expected Completion Date', type: 'date' },
          { key: 'packagingNotes', label: 'Packaging Notes', type: 'text' }
        )
        break
      case 'OCEAN':
        fields.push(
          { key: 'houseBillOfLading', label: 'House Bill of Lading', type: 'text' },
          { key: 'commercialInvoiceNumber', label: 'Commercial Invoice Number', type: 'text' },
          { key: 'packingListRef', label: 'Packing List Reference', type: 'text' },
          { key: 'vesselName', label: 'Vessel Name', type: 'text' },
          { key: 'portOfLoading', label: 'Port of Loading', type: 'text' },
          { key: 'portOfDischarge', label: 'Port of Discharge', type: 'text' }
        )
        break
      case 'WAREHOUSE':
        fields.push(
          {
            key: 'warehouseCode',
            label: 'Warehouse',
            type: 'select',
            options: warehouses.map(w => ({ value: w.code, label: `${w.name} (${w.code})` })),
            disabled: warehousesLoading || warehouses.length === 0,
          },
          {
            key: 'receiveType',
            label: 'Inbound Type',
            type: 'select',
            options: [
              { value: 'LCL', label: 'LCL' },
              { value: 'CONTAINER_20', label: "20' Container" },
              { value: 'CONTAINER_40', label: "40' Container" },
              { value: 'CONTAINER_40_HQ', label: "40' HQ Container" },
              { value: 'CONTAINER_45_HQ', label: "45' HQ Container" },
            ],
          },
          { key: 'customsEntryNumber', label: 'Customs Entry Number', type: 'text' },
          { key: 'customsClearedDate', label: 'Customs Cleared Date', type: 'date' },
          { key: 'receivedDate', label: 'Received Date', type: 'date' }
        )
        break
    }

    if (fields.length === 0) return null

    const docStage = nextStage.value as keyof typeof STAGE_DOCUMENTS
    const requiredDocs = STAGE_DOCUMENTS[docStage] ?? []

    const docsByType = new Map<string, PurchaseOrderDocumentSummary>(
      documents
        .filter(doc => doc.stage === docStage)
        .map(doc => [`${doc.stage}::${doc.documentType}`, doc])
    )

    return (
      <div className="space-y-5">
        {intro}
        <div className="grid grid-cols-1 gap-4">
          {fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{field.label}</label>
              {field.type === 'select' ? (
                <select
                  value={stageFormData[field.key] || ''}
                  onChange={e => {
                    const value = e.target.value
                    setStageFormData(prev => ({ ...prev, [field.key]: value }))
                  }}
                  disabled={field.disabled}
                  className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm disabled:opacity-50"
                >
                  <option value="">
                    {field.key === 'warehouseCode'
                      ? warehousesLoading
                        ? 'Loading warehouses…'
                        : 'Select warehouse'
                      : `Select ${field.label.toLowerCase()}`}
                  </option>
                  {field.options?.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type}
                  value={stageFormData[field.key] || ''}
                  onChange={e =>
                    setStageFormData(prev => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.type === 'date' ? '' : `Enter ${field.label.toLowerCase()}`}
                />
              )}
            </div>
          ))}
        </div>

        {requiredDocs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Required Documents</h5>
              {documentsLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
            </div>
            <div className="space-y-2">
              {requiredDocs.map(doc => {
                const key = `${docStage}::${doc.id}`
                const existing = docsByType.get(key)
                const isUploading = Boolean(uploadingDoc[key])

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 dark:bg-slate-700 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {existing ? (
                        <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      )}
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{doc.label}</span>
                        {existing ? (
                          <a
                            href={existing.viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-xs text-primary hover:underline"
                            title={existing.fileName}
                          >
                            {existing.fileName}
                          </a>
                        ) : (
                          <span className="block text-xs text-muted-foreground">
                            Not uploaded yet
                          </span>
                        )}
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-md border bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer transition-colors flex-shrink-0">
                      <Upload className="h-3.5 w-3.5" />
                      {existing ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        className="hidden"
                        disabled={isUploading}
                        onChange={e => void handleDocumentUpload(e, docStage, doc.id)}
                      />
                      {isUploading && <span className="text-xs text-muted-foreground ml-1">…</span>}
                    </label>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title={order.poNumber || order.orderNumber}
        description="Operations"
        icon={Package2}
        backHref="/operations/purchase-orders"
        backLabel="Back"
        actions={
          <>
            {canDownloadPdf && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                PDF
              </Button>
            )}
            {!isTerminal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTransition('CANCELLED')}
                disabled={transitioning}
                className="text-rose-500 hover:text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        }
      />
      <PageContent>
        <div className="flex flex-col gap-6">
          {/* Stage Progress Bar */}
          {!order.isLegacy && order.status !== 'CANCELLED' && order.status !== 'REJECTED' && (
            <div className="rounded-xl border bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Order Progress</h2>

              {/* Stage Progress - Clickable Navigation */}
              <div className="flex items-center justify-between relative">
                {/* Progress line */}
                <div className="absolute top-5 left-0 right-0 h-1 bg-slate-200 mx-8" />
                <div
                  className="absolute top-5 left-0 h-1 bg-emerald-500 transition-all duration-300 mx-8"
                  style={{
                    width: `calc(${(currentStageIndex / (STAGES.length - 1)) * 100}% - 4rem)`,
                  }}
                />

                {STAGES.map((stage, index) => {
                  const isCompleted = index < currentStageIndex
                  const isCurrent = index === currentStageIndex
                  const isClickable = canViewStage(stage.value)
                  const isViewing = activeViewStage === stage.value
                  const Icon = stage.icon

                  return (
                    <button
                      key={stage.value}
                      type="button"
                      onClick={() => isClickable && setSelectedStageView(stage.value)}
                      disabled={!isClickable}
                      className={`flex flex-col items-center relative z-10 transition-all ${
                        isClickable ? 'cursor-pointer group' : 'cursor-not-allowed'
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          isViewing ? 'ring-2 ring-offset-2 ring-emerald-400' : ''
                        } ${
                          isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white group-hover:bg-emerald-600'
                            : isCurrent
                              ? 'bg-white border-emerald-500 text-emerald-600 group-hover:bg-emerald-50 animate-pulse'
                              : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <span
                        className={`mt-2 text-xs font-medium transition-colors ${
                          isViewing
                            ? 'text-emerald-600'
                            : isCompleted || isCurrent
                              ? 'text-slate-900 dark:text-slate-100 group-hover:text-emerald-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {stage.label}
                      </span>
                      {isCurrent && (
                        <span className="mt-0.5 text-[10px] font-medium text-emerald-600 uppercase tracking-wider">
                          Current
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Action Buttons - All grouped together */}
              <div className="flex flex-wrap items-center gap-2 mt-6">
                {/* Primary: Advance */}
                {nextStage && (
                  <Button
                    onClick={() => setAdvanceModalOpen(true)}
                    disabled={transitioning}
                    className="gap-2"
                  >
                    Advance to {nextStage.label}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}

              </div>

              {order.status === 'WAREHOUSE' && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Shipping is handled via Fulfillment Orders
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Create a fulfillment order (FO) to ship inventory out of this warehouse.
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href="/operations/fulfillment-orders/new" prefetch={false}>
                      Create Fulfillment Order
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Cancelled banner */}
          {order.status === 'CANCELLED' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                This order has been cancelled and cannot be modified.
              </p>
            </div>
          )}

          {/* Rejected banner */}
          {order.status === 'REJECTED' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                This PO was rejected by the supplier. Reopen it as a draft to revise and re-issue.
              </p>
              <Button
                variant="outline"
                onClick={() => handleTransition('DRAFT')}
                disabled={transitioning}
                className="gap-2"
              >
                <FileEdit className="h-4 w-4" />
                Reopen Draft
              </Button>
            </div>
          )}

          {/* Details, Cargo, Documents & History Tabs */}
          <div className="rounded-xl border bg-white dark:bg-slate-800 shadow-sm">
            {/* Tab Headers */}
            <div className="flex items-center border-b">
              <button
                type="button"
                onClick={() => setActiveBottomTab('details')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeBottomTab === 'details'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Info className="h-4 w-4" />
                Details
                {activeBottomTab === 'details' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab('cargo')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeBottomTab === 'cargo'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Package2 className="h-4 w-4" />
                Cargo
                <Badge variant="outline" className="text-xs ml-1">
                  {order.lines.length}
                </Badge>
                {activeBottomTab === 'cargo' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab('costs')}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeBottomTab === 'costs'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <DollarSign className="h-4 w-4" />
                Costs
                {activeBottomTab === 'costs' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveBottomTab('documents')
                  void refreshDocuments()
                }}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeBottomTab === 'documents'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="h-4 w-4" />
                Documents
                {documentsCount > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">
                    {documentsCount}
                  </Badge>
                )}
                {activeBottomTab === 'documents' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveBottomTab('history')
                  void refreshAuditLogs()
                }}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeBottomTab === 'history'
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="h-4 w-4" />
                History
                {historyCount > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">
                    {historyCount}
                  </Badge>
                )}
                {activeBottomTab === 'history' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              {/* Spacer to push total to the right when cargo tab is active */}
              {activeBottomTab === 'cargo' && (
                <div className="ml-auto flex items-center gap-3 pr-6">
                  <span className="text-sm text-muted-foreground">
                    Total: {totalUnits.toLocaleString()} units · {totalCartons.toLocaleString()}{' '}
                    cartons
                  </span>
                  {canEdit && (
                    <Popover open={addLineOpen} onOpenChange={setAddLineOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" size="sm" variant="outline" className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add SKU
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[420px] space-y-4">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add line item</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Add another SKU to this purchase order.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            SKU
                          </label>
                          <select
                            value={newLineDraft.skuId}
                            onChange={e => {
                              const skuId = e.target.value
                              setNewLineDraft(prev => ({
                                ...prev,
                                skuId,
                                batchLot: '',
                                unitsOrdered: 1,
                                unitsPerCarton: null,
                                totalCost: '',
                                notes: '',
                              }))
                              void ensureSkuBatchesLoaded(skuId)
                            }}
                            disabled={skusLoading || addLineSubmitting}
                            className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                          >
                            <option value="">Select SKU</option>
                            {skus.map(sku => (
                              <option key={sku.id} value={sku.id}>
                                {sku.skuCode}
                              </option>
                            ))}
                          </select>
                          {selectedSku?.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {selectedSku.description}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Batch
                          </label>
                          <select
                            value={newLineDraft.batchLot}
                            onChange={e => {
                              const batchLot = e.target.value
                              setNewLineDraft(prev => {
                                const batches = prev.skuId ? (batchesBySkuId[prev.skuId] ?? []) : []
                                const selected = batches.find(batch => batch.batchCode === batchLot)
                                return {
                                  ...prev,
                                  batchLot,
                                  unitsPerCarton: selected?.unitsPerCarton ?? null,
                                }
                              })
                            }}
                            disabled={!newLineDraft.skuId || addLineSubmitting}
                            className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm disabled:opacity-50"
                          >
                            {!newLineDraft.skuId ? (
                              <option value="">Select SKU first</option>
                            ) : batchesLoadingBySkuId[newLineDraft.skuId] ? (
                              <option value="">Loading…</option>
                            ) : (batchesBySkuId[newLineDraft.skuId]?.length ?? 0) > 0 ? (
                              batchesBySkuId[newLineDraft.skuId].map(batch => (
                                <option key={batch.batchCode} value={batch.batchCode}>
                                  {batch.batchCode}
                                </option>
                              ))
                            ) : (
                              <option value="">No batches found</option>
                            )}
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Units
                            </label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={newLineDraft.unitsOrdered}
                              onChange={e =>
                                setNewLineDraft(prev => ({
                                  ...prev,
                                  unitsOrdered: parseInt(e.target.value) || 0,
                                }))
                              }
                              disabled={addLineSubmitting}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Units/Ctn
                            </label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={newLineDraft.unitsPerCarton ?? ''}
                              onChange={e =>
                                setNewLineDraft(prev => ({
                                  ...prev,
                                  unitsPerCarton: (() => {
                                    const parsed = Number.parseInt(e.target.value, 10)
                                    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
                                  })(),
                                }))
                              }
                              disabled={
                                !newLineDraft.skuId || !newLineDraft.batchLot || addLineSubmitting
                              }
                              placeholder="—"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Cartons
                            </label>
                            <Input
                              value={(() => {
                                if (!newLineDraft.unitsPerCarton) return '—'
                                if (newLineDraft.unitsOrdered <= 0) return '—'
                                return String(
                                  Math.ceil(newLineDraft.unitsOrdered / newLineDraft.unitsPerCarton)
                                )
                              })()}
                              readOnly
                              disabled
                              className="bg-muted/30 text-muted-foreground"
                            />
                          </div>
                        </div>
                        {(() => {
                          if (!newLineDraft.skuId || !newLineDraft.batchLot) return null
                          const options = batchesBySkuId[newLineDraft.skuId] ?? []
                          const batch =
                            options.find(option => option.batchCode === newLineDraft.batchLot) ??
                            null
                          if (!batch) return null

                          const meta = buildBatchPackagingMeta({
                            batch,
                            unitsOrdered: newLineDraft.unitsOrdered,
                            unitsPerCarton: newLineDraft.unitsPerCarton,
                          })

                          if (!meta) return null

                          return (
                            <p
                              className={`mt-1 text-[11px] ${
                                meta.tone === 'warning' ? 'text-amber-600' : 'text-muted-foreground'
                              }`}
                            >
                              {meta.text}
                            </p>
                          )
                        })()}

                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Total Cost
                          </label>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={newLineDraft.totalCost}
                              onChange={e =>
                                setNewLineDraft(prev => ({ ...prev, totalCost: e.target.value }))
                              }
                              placeholder="0.00"
                              className="pr-12"
                              disabled={addLineSubmitting}
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-xs font-medium text-muted-foreground">
                              {tenantCurrency}
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Unit:{' '}
                            {(() => {
                              const trimmed = newLineDraft.totalCost.trim()
                              if (!trimmed) return '—'
                              const parsed = Number(trimmed)
                              if (!Number.isFinite(parsed) || parsed < 0) return '—'
                              if (
                                !Number.isInteger(newLineDraft.unitsOrdered) ||
                                newLineDraft.unitsOrdered <= 0
                              )
                                return '—'
                              return (parsed / newLineDraft.unitsOrdered).toFixed(4)
                            })()}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Notes
                          </label>
                          <Input
                            value={newLineDraft.notes}
                            onChange={e =>
                              setNewLineDraft(prev => ({ ...prev, notes: e.target.value }))
                            }
                            placeholder="Optional"
                            disabled={addLineSubmitting}
                          />
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setAddLineOpen(false)}
                            disabled={addLineSubmitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleAddLineItem()}
                            disabled={
                              !newLineDraft.skuId ||
                              !newLineDraft.batchLot ||
                              !newLineDraft.unitsPerCarton ||
                              newLineDraft.unitsOrdered <= 0 ||
                              addLineSubmitting
                            }
                            className="gap-2"
                          >
                            {addLineSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Add
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}
            </div>

            {/* Tab Content */}
            {activeBottomTab === 'cargo' && (
              <div>
                {/* Summary Stats */}
                <div className="border-b bg-slate-50/50 dark:bg-slate-700/50 px-4 py-3">
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Units
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {totalUnits.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Cartons
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {totalCartons.toLocaleString()}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Pallets
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {order.stageData.manufacturing?.totalPallets?.toLocaleString() ?? '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Weight (kg)
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {order.stageData.manufacturing?.totalWeightKg?.toLocaleString() ?? '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Volume (CBM)
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {order.stageData.manufacturing?.totalVolumeCbm?.toLocaleString() ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex border-b bg-slate-50/50 dark:bg-slate-700/50">
                  <button
                    type="button"
                    onClick={() => setCargoSubTab('details')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      cargoSubTab === 'details'
                        ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-600 bg-white dark:bg-slate-800 -mb-px'
                        : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setCargoSubTab('attributes')}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      cargoSubTab === 'attributes'
                        ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-600 bg-white dark:bg-slate-800 -mb-px'
                        : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    <Package2 className="h-4 w-4" />
                    Attributes
                  </button>
                </div>

                {/* Details Sub-tab */}
                {cargoSubTab === 'details' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">SKU</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">Batch</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Description</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units/Ctn</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Cartons</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Total</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Unit Cost</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Notes</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Received</th>
                          {canEdit && <th className="w-[60px]"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canEdit ? 11 : 10}
                              className="px-3 py-6 text-center text-muted-foreground"
                            >
                              No lines added to this order yet.
                            </td>
                          </tr>
                        ) : (
                          order.lines.map((line) => (
                            <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                              <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap min-w-[100px]">
                                {line.skuCode}
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap min-w-[100px]">
                                {line.batchLot || '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[180px] truncate">
                                {line.skuDescription || '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                {line.unitsOrdered.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {line.unitsPerCarton.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                {line.quantity.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                {line.totalCost !== null
                                  ? `${line.totalCost.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })} ${(line.currency || tenantCurrency).toUpperCase()}`
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {line.unitCost !== null
                                  ? Number(line.unitCost).toFixed(4)
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                                {line.lineNotes || '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {(line.quantityReceived ?? line.postedQuantity).toLocaleString()}
                              </td>
                              {canEdit && (
                                <td className="px-2 py-2 whitespace-nowrap text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={() => openLineEditor(line)}
                                      title="Edit line"
                                    >
                                      <FileEdit className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                      onClick={() =>
                                        setConfirmDialog({
                                          open: true,
                                          type: 'delete-line',
                                          title: 'Remove line item',
                                          message: `Remove SKU ${line.skuCode} (${line.batchLot || '—'}) from this draft PO?`,
                                          lineId: line.id,
                                        })
                                      }
                                      title="Remove line"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Attributes Sub-tab */}
                {cargoSubTab === 'attributes' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">SKU</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">Batch</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Carton Size</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">CBM/ctn</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">CBM Total</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">KG/ctn</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">KG Total</th>
                          <th className="text-center font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Pkg Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                              No lines added to this order yet.
                            </td>
                          </tr>
                        ) : (
                          order.lines.map((line) => {
                            const pkg = buildLinePackagingDetails(line)
                            return (
                              <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap min-w-[100px]">
                                  {line.skuCode}
                                </td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap min-w-[100px]">
                                  {line.batchLot || '—'}
                                </td>
                                <td className="px-3 py-2 text-foreground whitespace-nowrap">
                                  {pkg?.cartonDims ? (
                                    pkg.cartonDims
                                  ) : (
                                    <span className="text-amber-600">Not set</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                  {pkg?.cbmPerCarton ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground whitespace-nowrap">
                                  {pkg?.cbmTotal ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                  {pkg?.kgPerCarton ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground whitespace-nowrap">
                                  {pkg?.kgTotal ?? <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center whitespace-nowrap">
                                  {pkg?.packagingType ? (
                                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                      {pkg.packagingType}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeBottomTab === 'documents' && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Stage</th>
                      <th className="px-4 py-2 text-left font-semibold">Document Type</th>
                      <th className="px-4 py-2 text-left font-semibold">File</th>
                      <th className="px-4 py-2 text-left font-semibold">Uploaded</th>
                      <th className="px-4 py-2 text-left font-semibold">Status</th>
                      <th className="px-4 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const allRows: Array<{
                        stage: string
                        stageLabel: string
                        documentType: string
                        label: string
                        doc: PurchaseOrderDocumentSummary | undefined
                      }> = []

                      documentStages.forEach(stage => {
                        const stageDocs = documents.filter(doc => doc.stage === stage)
                        const requiredDocs =
                          stage === 'SHIPPED' ? [] : (STAGE_DOCUMENTS[stage] ?? [])
                        const requiredIds = new Set(requiredDocs.map(doc => doc.id))
                        const docsByType = new Map(stageDocs.map(doc => [doc.documentType, doc]))
                        const otherDocs = stageDocs.filter(
                          doc => !requiredIds.has(doc.documentType)
                        )
                        const meta = DOCUMENT_STAGE_META[stage]

                        requiredDocs.forEach(doc => {
                          allRows.push({
                            stage,
                            stageLabel: meta.label,
                            documentType: doc.id,
                            label: doc.label,
                            doc: docsByType.get(doc.id),
                          })
                        })
                        otherDocs.forEach(doc => {
                          allRows.push({
                            stage,
                            stageLabel: meta.label,
                            documentType: doc.documentType,
                            label: getDocumentLabel(stage, doc.documentType),
                            doc,
                          })
                        })
                      })

                      if (allRows.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                              No documents configured for this order.
                            </td>
                          </tr>
                        )
                      }

                      return allRows.map(row => {
                        const key = `${row.stage}::${row.documentType}`
                        const existing = row.doc
                        const isUploading = Boolean(uploadingDoc[key])

                        return (
                          <tr key={key} className="border-t hover:bg-muted/10">
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {row.stageLabel}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                              {row.label}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap max-w-[200px]">
                              {existing ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDocument(existing)}
                                  className="text-primary hover:underline truncate block max-w-full"
                                  title={existing.fileName}
                                >
                                  {existing.fileName}
                                </button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {existing ? formatDateOnly(existing.uploadedAt) : '—'}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={
                                  existing
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : ''
                                }
                              >
                                {existing ? 'UPLOADED' : 'PENDING'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                {existing && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setPreviewDocument(existing)}
                                    className="h-7 w-7 p-0"
                                    title="Preview"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {existing && (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    title="Open in new tab"
                                  >
                                    <a href={existing.viewUrl} target="_blank" rel="noreferrer">
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                )}
                                {(row.stage !== 'SHIPPED' || existing) && (
                                  <label
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted cursor-pointer"
                                    title={existing ? 'Replace' : 'Upload'}
                                  >
                                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                                    <input
                                      type="file"
                                      className="hidden"
                                      disabled={isUploading}
                                      onChange={e =>
                                        void handleDocumentUpload(
                                          e,
                                          row.stage as PurchaseOrderDocumentStage,
                                          row.documentType
                                        )
                                      }
                                    />
                                  </label>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            )}

            {activeBottomTab === 'costs' && (
              <div className="p-6">
                {/* Product Costs Section */}
                <div className="mb-6">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Product Costs
                  </h4>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="text-left px-4 py-2 font-medium">SKU</th>
                          <th className="text-left px-4 py-2 font-medium">Batch</th>
                          <th className="text-right px-4 py-2 font-medium">Qty</th>
                          <th className="text-right px-4 py-2 font-medium">Unit Cost</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map(line => {
                          const unitCost = line.totalCost && line.unitsOrdered > 0
                            ? line.totalCost / line.unitsOrdered
                            : null
                          return (
                            <tr key={line.id} className="border-t border-slate-100 dark:border-slate-700">
                              <td className="px-4 py-2 font-medium text-foreground">{line.skuCode}</td>
                              <td className="px-4 py-2 text-muted-foreground">{line.batchLot || '—'}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{line.unitsOrdered.toLocaleString()}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                {unitCost !== null ? `${tenantCurrency} ${unitCost.toFixed(4)}` : '—'}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-medium">
                                {line.totalCost !== null ? `${line.currency || tenantCurrency} ${line.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
                          <td colSpan={4} className="px-4 py-2 text-right font-medium text-muted-foreground">Product Subtotal</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">
                            {tenantCurrency} {order.lines.reduce((sum, line) => sum + (line.totalCost || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Cargo Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Cargo Costs
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {forwardingCosts.length} item{forwardingCosts.length === 1 ? '' : 's'}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Warehouse
                          </p>
                          <select
                            value={forwardingWarehouseCode}
                            onChange={e => setForwardingWarehouseCode(e.target.value)}
                            disabled={
                              !canEditForwardingCosts ||
                              warehousesLoading ||
                              (order.status === 'WAREHOUSE' && Boolean(order.warehouseCode))
                            }
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm disabled:opacity-50"
                          >
                            <option value="">
                              {warehousesLoading ? 'Loading warehouses…' : 'Select warehouse'}
                            </option>
                            {warehouses.map(w => (
                              <option key={w.code} value={w.code}>
                                {w.name} ({w.code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Cost Type
                          </p>
                          <select
                            value={newForwardingCostDraft.costName}
                            onChange={e =>
                              setNewForwardingCostDraft(prev => ({ ...prev, costName: e.target.value }))
                            }
                            disabled={
                              !canEditForwardingCosts ||
                              forwardingRatesLoading ||
                              forwardingRates.length === 0 ||
                              !forwardingWarehouseId
                            }
                            className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm disabled:opacity-50"
                          >
                            <option value="">
                              {!forwardingWarehouseId
                                ? 'Select warehouse first'
                                : forwardingRatesLoading
                                  ? 'Loading rates…'
                                  : forwardingRates.length === 0
                                    ? 'No forwarding rates'
                                    : 'Select cost type'}
                            </option>
                            {forwardingRates.map(rate => (
                              <option key={rate.id} value={rate.costName}>
                                {rate.costName} ({rate.unitOfMeasure})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Quantity
                          </p>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={newForwardingCostDraft.quantity}
                            onChange={e =>
                              setNewForwardingCostDraft(prev => ({ ...prev, quantity: e.target.value }))
                            }
                            disabled={!canEditForwardingCosts}
                            placeholder="0"
                          />
                        </div>

                        <div className="flex items-end">
                          <Button
                            type="button"
                            className="w-full gap-2"
                            onClick={() => void createForwardingCost()}
                            disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                          >
                            {forwardingCostSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Add Cost
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Notes (Optional)
                          </p>
                          <Input
                            value={newForwardingCostDraft.notes}
                            onChange={e =>
                              setNewForwardingCostDraft(prev => ({ ...prev, notes: e.target.value }))
                            }
                            disabled={!canEditForwardingCosts}
                            placeholder="e.g. invoice #, vendor"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Currency (Optional)
                          </p>
                          <Input
                            value={newForwardingCostDraft.currency}
                            onChange={e =>
                              setNewForwardingCostDraft(prev => ({ ...prev, currency: e.target.value }))
                            }
                            disabled={!canEditForwardingCosts}
                            placeholder={tenantCurrency}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <p>
                          Unit rate:{' '}
                          {draftForwardingUnitRate !== null
                            ? `${tenantCurrency} ${draftForwardingUnitRate.toFixed(4)}`
                            : '—'}
                        </p>
                        <p className="tabular-nums">
                          Total:{' '}
                          {draftForwardingTotal !== null
                            ? `${tenantCurrency} ${draftForwardingTotal.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '—'}
                        </p>
                      </div>

                      {!canEditForwardingCosts && (
                        <p className="text-xs text-muted-foreground">
                          Cargo costs are editable during In Transit or At Warehouse stages.
                        </p>
                      )}
                    </div>

                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white dark:bg-slate-900 text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="text-left px-4 py-2 font-medium">Cost</th>
                          <th className="text-right px-4 py-2 font-medium">Qty</th>
                          <th className="text-right px-4 py-2 font-medium">Unit Rate</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                          <th className="text-left px-4 py-2 font-medium">Notes</th>
                          <th className="text-right px-4 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forwardingCostsLoading ? (
                          <tr className="border-t border-slate-100 dark:border-slate-700">
                            <td colSpan={6} className="px-4 py-3 text-sm text-muted-foreground">
                              Loading cargo costs...
                            </td>
                          </tr>
                        ) : forwardingCosts.length === 0 ? (
                          <tr className="border-t border-slate-100 dark:border-slate-700">
                            <td colSpan={6} className="px-4 py-3 text-sm text-muted-foreground">
                              No cargo costs added.
                            </td>
                          </tr>
                        ) : (
                          forwardingCosts.map(row => {
                            const currencyLabel = row.currency ? row.currency : tenantCurrency
                            const isEditing = editingForwardingCostId === row.id
                            const isDeleting = forwardingCostDeletingId === row.id

                            return (
                              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-700">
                                <td className="px-4 py-2">
                                  {isEditing ? (
                                    <select
                                      value={editingForwardingCostDraft.costName}
                                      onChange={e =>
                                        setEditingForwardingCostDraft(prev => ({
                                          ...prev,
                                          costName: e.target.value,
                                        }))
                                      }
                                      disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                                      className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm disabled:opacity-50"
                                    >
                                      {forwardingRates.every(rate => rate.costName !== row.costName) && (
                                        <option value={row.costName}>{row.costName}</option>
                                      )}
                                      {forwardingRates.map(rate => (
                                        <option key={rate.id} value={rate.costName}>
                                          {rate.costName} ({rate.unitOfMeasure})
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <p className="font-medium text-foreground">{row.costName}</p>
                                  )}
                                </td>

                                <td className="px-4 py-2 text-right tabular-nums">
                                  {isEditing ? (
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editingForwardingCostDraft.quantity}
                                      onChange={e =>
                                        setEditingForwardingCostDraft(prev => ({
                                          ...prev,
                                          quantity: e.target.value,
                                        }))
                                      }
                                      disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                                    />
                                  ) : (
                                    row.quantity.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 4,
                                    })
                                  )}
                                </td>

                                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                                  {isEditing ? (
                                    editingForwardingUnitRate !== null
                                      ? `${currencyLabel} ${editingForwardingUnitRate.toFixed(4)}`
                                      : '—'
                                  ) : (
                                    `${currencyLabel} ${row.unitRate.toFixed(4)}`
                                  )}
                                </td>

                                <td className="px-4 py-2 text-right tabular-nums font-medium">
                                  {isEditing ? (
                                    editingForwardingTotal !== null
                                      ? `${currencyLabel} ${editingForwardingTotal.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}`
                                      : '—'
                                  ) : (
                                    `${currencyLabel} ${row.totalCost.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  )}
                                </td>

                                <td className="px-4 py-2">
                                  {isEditing ? (
                                    <Input
                                      value={editingForwardingCostDraft.notes}
                                      onChange={e =>
                                        setEditingForwardingCostDraft(prev => ({
                                          ...prev,
                                          notes: e.target.value,
                                        }))
                                      }
                                      disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                                      placeholder="Notes"
                                    />
                                  ) : (
                                    <p className="text-muted-foreground">{row.notes ? row.notes : '—'}</p>
                                  )}
                                </td>

                                <td className="px-4 py-2 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {isEditing ? (
                                      <>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={cancelEditForwardingCost}
                                          disabled={forwardingCostSubmitting}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() => void saveEditForwardingCost()}
                                          disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                                          className="gap-2"
                                        >
                                          {forwardingCostSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                          Save
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => startEditForwardingCost(row)}
                                          disabled={!canEditForwardingCosts || forwardingCostSubmitting}
                                          className="gap-2"
                                        >
                                          <FileEdit className="h-4 w-4" />
                                          Edit
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const confirmed = window.confirm('Delete this cargo cost?')
                                            if (!confirmed) return
                                            void deleteForwardingCost(row)
                                          }}
                                          disabled={!canEditForwardingCosts || isDeleting}
                                          className="gap-2"
                                        >
                                          {isDeleting ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Trash2 className="h-4 w-4" />
                                          )}
                                          Delete
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50">
                          <td colSpan={3} className="px-4 py-2 text-right font-medium text-muted-foreground">
                            Cargo Subtotal
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">
                            {tenantCurrency}{' '}
                            {forwardingSubtotal.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Inbound Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Inbound Costs
                  </h4>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Inbound costs will be calculated when the PO is received at warehouse.
                    </p>
                  </div>
                </div>

                {/* Storage Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Storage Costs
                  </h4>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Storage costs accrue daily based on warehouse rates.
                    </p>
                  </div>
                </div>

                {/* Outbound Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Outbound Costs
                  </h4>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Outbound costs will be calculated when inventory is shipped.
                    </p>
                  </div>
                </div>

                {/* Customs/Duty Section */}
                {order.stageData.warehouse?.dutyAmount != null && (
                  <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                      Customs & Duty
                    </h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Duty Amount
                        </p>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {order.stageData.warehouse.dutyCurrency || 'USD'} {order.stageData.warehouse.dutyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cost Summary */}
                <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Cost Summary
                  </h4>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 text-muted-foreground">Product Costs</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {tenantCurrency} {order.lines.reduce((sum, line) => sum + (line.totalCost || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 text-muted-foreground">Cargo Costs</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">
                            {forwardingSubtotal > 0
                              ? `${tenantCurrency} ${forwardingSubtotal.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 text-muted-foreground">Inbound Costs</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        </tr>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 text-muted-foreground">Storage Costs</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        </tr>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 text-muted-foreground">Outbound Costs</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        </tr>
                        {order.stageData.warehouse?.dutyAmount != null && (
                          <tr className="border-b border-slate-100 dark:border-slate-700">
                            <td className="px-4 py-2 text-muted-foreground">Customs & Duty</td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium">
                              {order.stageData.warehouse.dutyCurrency || 'USD'} {order.stageData.warehouse.dutyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <td className="px-4 py-3 font-semibold">Total Cost</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-lg">
                            {tenantCurrency} {(
                              order.lines.reduce((sum, line) => sum + (line.totalCost || 0), 0) +
                              forwardingSubtotal +
                              (order.stageData.warehouse?.dutyAmount || 0)
                            ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeBottomTab === 'details' && (
              <div className="p-6">
                {/* Order Info Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Order Info
                    </h4>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {orderInfoEditing ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setOrderInfoEditing(false)}
                              disabled={orderInfoSaving}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleSaveOrderInfo()}
                              disabled={orderInfoSaving || !orderInfoDraft.counterpartyName.trim()}
                              className="gap-2"
                            >
                              {orderInfoSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                              Save
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setOrderInfoEditing(true)}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        PO Number
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {order.poNumber || order.orderNumber}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Supplier
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Input
                          value={orderInfoDraft.counterpartyName}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              counterpartyName: e.target.value,
                            }))
                          }
                          placeholder="Supplier"
                          disabled={orderInfoSaving}
                        />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {order.counterpartyName || '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Destination
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tenantDestination || '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cargo Ready Date
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Input
                          type="date"
                          value={orderInfoDraft.expectedDate}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              expectedDate: e.target.value,
                            }))
                          }
                          disabled={orderInfoSaving}
                        />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {order.expectedDate ? formatDateOnly(order.expectedDate) : '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Incoterms
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <select
                          value={orderInfoDraft.incoterms}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              incoterms: e.target.value,
                            }))
                          }
                          disabled={orderInfoSaving}
                          className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                        >
                          <option value="">Select incoterms</option>
                          {INCOTERMS_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {order.incoterms || '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Payment Terms
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Input
                          value={orderInfoDraft.paymentTerms}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              paymentTerms: e.target.value,
                            }))
                          }
                          placeholder="Payment terms"
                          disabled={orderInfoSaving}
                        />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {order.paymentTerms || '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Created
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatDateOnly(order.createdAt) || '—'}
                        {order.createdByName ? ` by ${order.createdByName}` : ''}
                      </p>
                    </div>
                  </div>
                  {(order.notes || (canEdit && orderInfoEditing)) && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Notes
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Textarea
                          value={orderInfoDraft.notes}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({ ...prev, notes: e.target.value }))
                          }
                          placeholder="Optional internal notes..."
                          disabled={orderInfoSaving}
                          className="min-h-[88px]"
                        />
                      ) : (
                        <p className="text-sm text-slate-700 dark:text-slate-300">{order.notes}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Manufacturing Section */}
                {(() => {
                  const mfg = order.stageData.manufacturing
                  const hasData =
                    mfg?.proformaInvoiceNumber ||
                    mfg?.manufacturingStartDate ||
                    mfg?.totalCartons ||
                    mfg?.totalWeightKg
                  if (!hasData) return null
                  return (
                    <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        Manufacturing
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Proforma Invoice
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.proformaInvoiceNumber || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Start Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(mfg?.manufacturingStartDate || mfg?.manufacturingStart) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Expected Completion
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(mfg?.expectedCompletionDate) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Cartons
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalCartons?.toLocaleString() || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Pallets
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalPallets?.toLocaleString() || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Weight (kg)
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalWeightKg?.toLocaleString() || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Volume (CBM)
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalVolumeCbm?.toLocaleString() || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* In Transit Section */}
                {(() => {
                  const ocean = order.stageData.ocean
                  const hasData =
                    ocean?.houseBillOfLading ||
                    ocean?.masterBillOfLading ||
                    ocean?.vesselName ||
                    ocean?.portOfLoading ||
                    ocean?.estimatedDeparture
                  if (!hasData) return null
                  return (
                    <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        In Transit
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            House B/L
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.houseBillOfLading || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Master B/L
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.masterBillOfLading || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Vessel
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.vesselName || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Voyage
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.voyageNumber || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Port of Loading
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.portOfLoading || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Port of Discharge
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.portOfDischarge || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            ETD
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(ocean?.estimatedDeparture) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            ETA
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(ocean?.estimatedArrival) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Commercial Invoice
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ocean?.commercialInvoiceNumber || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Warehouse Section */}
                {(() => {
                  const wh = order.stageData.warehouse
                  const hasData =
                    wh?.warehouseName ||
                    wh?.warehouseCode ||
                    wh?.customsEntryNumber ||
                    wh?.customsClearedDate ||
                    wh?.receivedDate
                  if (!hasData) return null
                  return (
                    <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        Warehouse
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Warehouse
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {wh?.warehouseName || wh?.warehouseCode || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Customs Entry
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {wh?.customsEntryNumber || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Customs Cleared
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(wh?.customsClearedDate) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Duty Amount
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {wh?.dutyAmount != null
                              ? `${wh.dutyAmount.toLocaleString()} ${wh.dutyCurrency || ''}`
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Received Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(wh?.receivedDate) || '—'}
                          </p>
                        </div>
                      </div>
                      {wh?.discrepancyNotes && (
                        <div className="mt-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                            Discrepancy Notes
                          </p>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{wh.discrepancyNotes}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Shipped Section */}
                {(() => {
                  const shipped = order.stageData.shipped
                  const hasData =
                    shipped?.shipToName ||
                    shipped?.shippingCarrier ||
                    shipped?.trackingNumber ||
                    shipped?.shippedDate
                  if (!hasData) return null
                  return (
                    <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        Shipped
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        <div className="space-y-1 col-span-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Ship To
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {[
                              shipped?.shipToName,
                              shipped?.shipToAddress,
                              shipped?.shipToCity,
                              shipped?.shipToCountry,
                            ]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Carrier
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {shipped?.shippingCarrier || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Method
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {shipped?.shippingMethod || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Tracking
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {shipped?.trackingNumber || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Shipped Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(shipped?.shippedDate || shipped?.shippedAt) || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Delivered Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatDateOnly(shipped?.deliveredDate) || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {activeBottomTab === 'history' && (
              <div className="overflow-x-auto">
                {auditLogsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading history…
                  </div>
                ) : (
                  <table className="min-w-full table-auto text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2"></th>
                        <th className="px-4 py-2 text-left font-semibold">Action</th>
                        <th className="px-4 py-2 text-left font-semibold">Changes</th>
                        <th className="px-4 py-2 text-left font-semibold">By</th>
                        <th className="px-4 py-2 text-left font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length > 0 ? (
                        auditLogs.map(entry => {
                          const newValue = toAuditRecord(entry.newValue)
                          const title = describeAuditAction(entry.action, newValue)
                          const changes = describeAuditChanges(entry)
                          const actor = entry.changedBy?.fullName || 'Unknown'
                          const { Icon, iconClassName } = getAuditActionTheme(entry.action)

                          return (
                            <tr key={entry.id} className="border-t hover:bg-muted/10">
                              <td className="px-4 py-2.5">
                                <Icon className={`h-4 w-4 ${iconClassName}`} />
                              </td>
                              <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                                {title}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-[300px]">
                                {changes.length > 0 ? (
                                  <span className="line-clamp-2" title={changes.join(', ')}>
                                    {changes.join(', ')}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {actor}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                                {formatDateOnly(entry.createdAt)}
                              </td>
                            </tr>
                          )
                        })
                      ) : order.approvalHistory && order.approvalHistory.length > 0 ? (
                        order.approvalHistory.map((approval, index) => (
                          <tr key={index} className="border-t hover:bg-muted/10">
                            <td className="px-4 py-2.5">
                              <Check className="h-4 w-4 text-emerald-600" />
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                              {approval.stage}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">—</td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {approval.approvedBy || 'Unknown'}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                              {approval.approvedAt ? formatDateOnly(approval.approvedAt) : '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                            No activity recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {editLineOpen && editingLine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                if (editLineSubmitting) return
                setEditLineOpen(false)
                setEditingLine(null)
              }}
            />
            <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 dark:bg-slate-700">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Edit line item</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {editingLine.skuCode} • {editingLine.batchLot || '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (editLineSubmitting) return
                    setEditLineOpen(false)
                    setEditingLine(null)
                  }}
                  className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors"
                  disabled={editLineSubmitting}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {(() => {
                  const skuRecord =
                    skus.find(
                      sku =>
                        sku.skuCode.trim().toUpperCase() ===
                        editingLine.skuCode.trim().toUpperCase()
                    ) ?? null
                  const skuId = skuRecord?.id ?? null
                  const batchOptions = skuId ? (batchesBySkuId[skuId] ?? []) : []
                  const batchesLoading = skuId ? Boolean(batchesLoadingBySkuId[skuId]) : false
                  const batch =
                    batchOptions.find(option => option.batchCode === editLineDraft.batchLot) ?? null

                  return (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Batch
                        </label>
                        <select
                          value={editLineDraft.batchLot}
                          onChange={e => {
                            const nextBatch = e.target.value
                            setEditLineDraft(prev => ({
                              ...prev,
                              batchLot: nextBatch,
                              unitsPerCarton:
                                batchOptions.find(option => option.batchCode === nextBatch)
                                  ?.unitsPerCarton ?? prev.unitsPerCarton,
                            }))
                          }}
                          disabled={editLineSubmitting || batchesLoading || !skuId}
                          className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                        >
                          <option value="">{!skuId ? 'Select SKU first' : 'Select batch'}</option>
                          {batchOptions.map(option => (
                            <option key={option.batchCode} value={option.batchCode}>
                              {option.batchCode}
                            </option>
                          ))}
                        </select>
                        {batch && (
                          <p className="text-[11px] text-muted-foreground">
                            {buildBatchPackagingMeta({
                              batch,
                              unitsOrdered: editLineDraft.unitsOrdered,
                              unitsPerCarton:
                                editLineDraft.unitsPerCarton ?? batch.unitsPerCarton ?? null,
                            })?.text ?? ''}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Units
                          </label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={editLineDraft.unitsOrdered}
                            onChange={e =>
                              setEditLineDraft(prev => ({
                                ...prev,
                                unitsOrdered: (() => {
                                  const parsed = Number.parseInt(e.target.value, 10)
                                  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
                                })(),
                              }))
                            }
                            disabled={editLineSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Units/Ctn
                          </label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={editLineDraft.unitsPerCarton ?? ''}
                            onChange={e =>
                              setEditLineDraft(prev => ({
                                ...prev,
                                unitsPerCarton: (() => {
                                  const parsed = Number.parseInt(e.target.value, 10)
                                  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
                                })(),
                              }))
                            }
                            disabled={editLineSubmitting}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Cartons
                          </label>
                          <Input
                            value={(() => {
                              const units = Number(editLineDraft.unitsOrdered)
                              const per = editLineDraft.unitsPerCarton
                              if (!per || units <= 0) return '—'
                              return String(Math.ceil(units / per))
                            })()}
                            readOnly
                            disabled
                            className="bg-muted/30 text-muted-foreground"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Total Cost
                        </label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editLineDraft.totalCost}
                            onChange={e =>
                              setEditLineDraft(prev => ({ ...prev, totalCost: e.target.value }))
                            }
                            placeholder="0.00"
                            className="pr-12"
                            disabled={editLineSubmitting}
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-xs font-medium text-muted-foreground">
                            {tenantCurrency}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Unit:{' '}
                          {(() => {
                            const trimmed = editLineDraft.totalCost.trim()
                            if (!trimmed) return '—'
                            const parsed = Number(trimmed)
                            if (!Number.isFinite(parsed) || parsed < 0) return '—'
                            const units = Number(editLineDraft.unitsOrdered)
                            if (!Number.isInteger(units) || units <= 0) return '—'
                            return (parsed / units).toFixed(4)
                          })()}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Notes
                        </label>
                        <Input
                          value={editLineDraft.notes}
                          onChange={e =>
                            setEditLineDraft(prev => ({ ...prev, notes: e.target.value }))
                          }
                          placeholder="Optional"
                          disabled={editLineSubmitting}
                        />
                      </div>
                    </>
                  )
                })()}
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 dark:bg-slate-700">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (editLineSubmitting) return
                    setEditLineOpen(false)
                    setEditingLine(null)
                  }}
                  disabled={editLineSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveLineEdit()}
                  disabled={
                    editLineSubmitting ||
                    !editLineDraft.batchLot.trim() ||
                    editLineDraft.batchLot.trim().toUpperCase() === 'DEFAULT' ||
                    !editLineDraft.unitsPerCarton ||
                    editLineDraft.unitsOrdered <= 0
                  }
                  className="gap-2"
                >
                  {editLineSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Advance Stage Modal */}
        {advanceModalOpen && nextStage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => !transitioning && setAdvanceModalOpen(false)}
            />
            {/* Modal */}
            <div className="relative z-10 w-full max-w-lg mx-4 bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 dark:bg-slate-700">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Advance to {nextStage.label}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {STAGES[currentStageIndex]?.label ?? formatStatusLabel(order.status)} →{' '}
                    {nextStage.label}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !transitioning && setAdvanceModalOpen(false)}
                  className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 dark:text-slate-300 transition-colors"
                  disabled={transitioning}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">{renderStageTransitionForm()}</div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-slate-50 dark:bg-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setAdvanceModalOpen(false)}
                  disabled={transitioning}
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    const success = await executeTransition(nextStage.value as POStageStatus)
                    if (success) {
                      setAdvanceModalOpen(false)
                    }
                  }}
                  disabled={
                    transitioning ||
                    documentsLoading ||
                    !nextStageDocsComplete ||
                    (nextStage.value === 'ISSUED' &&
                      (!order.expectedDate ||
                        !order.incoterms ||
                        !order.paymentTerms ||
                        !(
                          stageFormData.proformaInvoiceNumber?.trim() ||
                          order.stageData.manufacturing.proformaInvoiceNumber?.trim()
                        ))) ||
                    (nextStage.value === 'MANUFACTURING' &&
                      !(
                        stageFormData.manufacturingStartDate?.trim() ||
                        order.stageData.manufacturing.manufacturingStartDate
                      ))
                  }
                  className="gap-2"
                >
                  {transitioning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Advancing...
                    </>
                  ) : (
                    <>
                      Advance to {nextStage.label}
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.open}
          onClose={handleConfirmDialogClose}
          onConfirm={handleConfirmDialogConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type ? 'danger' : 'info'}
          confirmText={
            confirmDialog.type === 'cancel'
              ? 'Cancel Order'
              : confirmDialog.type === 'reject'
                ? 'Mark Rejected'
                : confirmDialog.type === 'delete-line'
                  ? 'Remove Line'
                  : 'Confirm'
          }
          cancelText="Go Back"
        />

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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {previewDocument.fileName}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {previewStageMeta.label} •{' '}
                          {getDocumentLabel(previewDocument.stage, previewDocument.documentType)} •{' '}
                          Uploaded {formatDate(previewDocument.uploadedAt)}
                          {previewDocument.uploadedByName
                            ? ` by ${previewDocument.uploadedByName}`
                            : ''}
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
                      <iframe
                        title={previewDocument.fileName}
                        src={previewDocument.viewUrl}
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
      </PageContent>
    </PageContainer>
  )
}
