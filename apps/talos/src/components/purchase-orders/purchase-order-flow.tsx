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
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/usePortalSession'
import type { TenantCode } from '@/lib/tenant/constants'
import { toast } from 'react-hot-toast'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
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
import { BUYER_LEGAL_ENTITY } from '@/lib/config/legal-entity'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { convertLengthToCm, convertWeightFromKg, convertWeightToKg, formatLengthFromCm, formatWeightFromKg, getDefaultUnitSystem, getLengthUnitLabel, getWeightUnitLabel } from '@/lib/measurements'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'

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
  piNumber: string | null
  commodityCode: string | null
  countryOfOrigin: string | null
  netWeightKg: number | null
  material: string | null
  cartonDimensionsCm?: string | null
  cartonSide1Cm?: number | null
  cartonSide2Cm?: number | null
  cartonSide3Cm?: number | null
  cartonWeightKg?: number | null
  packagingType?: string | null
  cartonRangeStart?: number | null
  cartonRangeEnd?: number | null
  cartonRangeTotal?: number | null
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

interface SupplierOption {
  id: string
  name: string
  phone: string | null
  address: string | null
  defaultIncoterms: string | null
  defaultPaymentTerms: string | null
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

function _buildBatchPackagingMeta(options: {
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

function _buildLinePackagingDetails(line: PurchaseOrderLineSummary): LinePackagingDetails | null {
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

interface ProformaInvoiceSummary {
  id: string
  piNumber: string
  invoiceDate: string | null
}

type PurchaseOrderOutputMeta = {
  generatedAt: string | null
  generatedByName: string | null
  outOfDate: boolean
}

type PurchaseOrderOutputs = {
  rfqPdf: PurchaseOrderOutputMeta
  poPdf: PurchaseOrderOutputMeta
  shippingMarks: PurchaseOrderOutputMeta
}

interface PurchaseOrderSummary {
  id: string
  orderNumber: string
  poNumber: string | null
  splitGroupId: string | null
  splitParentId: string | null
  type: 'PURCHASE' | 'ADJUSTMENT'
  status: POStageStatus
  isLegacy: boolean
  warehouseCode: string | null
  warehouseName: string | null
  counterpartyName: string | null
  supplier: { phone: string | null; bankingDetails: string | null; address: string | null; country: string | null } | null
  expectedDate: string | null
  incoterms: string | null
  paymentTerms: string | null
  receiveType: string | null
  postedAt: string | null
  createdAt: string
  updatedAt: string
  notes?: string | null
  createdByName: string | null
  outputs: PurchaseOrderOutputs
  lines: PurchaseOrderLineSummary[]
  stageData: StageData
  proformaInvoices: ProformaInvoiceSummary[]
  approvalHistory: StageApproval[]
}

type SplitGroupOrderSummary = {
  id: string
  orderNumber: string
  poNumber: string | null
  status: POStageStatus
  createdAt: string
}

type PurchaseOrderDocumentStage =
  | 'DRAFT'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'SHIPPED'

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

type PurchaseOrderCostBreakdownRow = {
  costName: string
  totalCost: number
}

type PurchaseOrderCostLedgerSummary = {
  totals: {
    inbound: number
    outbound: number
    forwarding: number
    storage: number
    total: number
  }
  breakdown: {
    inbound: PurchaseOrderCostBreakdownRow[]
    outbound: PurchaseOrderCostBreakdownRow[]
    forwarding: PurchaseOrderCostBreakdownRow[]
    storage: PurchaseOrderCostBreakdownRow[]
  }
}

type SupplierAdjustmentEntry = {
  id: string
  category: string
  costName: string
  amount: number
  currency: string
  effectiveAt: string
  createdAt: string
  createdByName: string
  notes: string | null
}

const STAGE_DOCUMENTS: Record<
  Exclude<PurchaseOrderDocumentStage, 'SHIPPED'>,
  Array<{ id: string; label: string }>
> = {
  DRAFT: [],
  ISSUED: [],
  MANUFACTURING: [{ id: 'box_artwork', label: 'Box Artwork' }],
  OCEAN: [
    { id: 'commercial_invoice', label: 'Commercial Invoice' },
    { id: 'bill_of_lading', label: 'Bill of Lading' },
    { id: 'packing_list', label: 'Packing List' },
  ],
  WAREHOUSE: [
    { id: 'movement_note', label: 'Movement Note' },
    { id: 'custom_declaration', label: 'Customs & Border Patrol Clearance Proof' },
  ],
}

const DOCUMENT_STAGE_META: Record<
  PurchaseOrderDocumentStage,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  DRAFT: { label: 'RFQ', icon: FileEdit },
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

function buildPiDocumentType(piNumber: string): string {
  const normalized = piNumber.trim().toUpperCase()
  const sanitized = normalized.replace(/[^A-Z0-9-]+/g, '')
  if (!sanitized) {
    return ''
  }
  return `pi_${sanitized.toLowerCase()}`
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
  { value: 'DRAFT', label: 'RFQ', icon: FileEdit, color: 'slate' },
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

function formatTextOrDash(value: string | null | undefined) {
  if (value === null || value === undefined) return '—'
  const trimmed = value.trim()
  if (trimmed.length === 0) return '—'
  return value
}

type CargoSubTabKey = 'details' | 'attributes' | 'receiving'

const isIssuedShippingMarksKey = (key: string): boolean => {
  return (
    key.includes('.commodityCode') ||
    key.includes('.countryOfOrigin') ||
    key.includes('.material') ||
    key.includes('.netWeightKg') ||
    key.includes('.cartonWeightKg') ||
    key.includes('.cartonDimensions') ||
    key.includes('.unitsPerCarton')
  )
}

const resolveCargoSubTabForGateKey = (key: string): CargoSubTabKey | null => {
  if (!key.startsWith('cargo.')) return null
  if (isIssuedShippingMarksKey(key)) return 'attributes'
  if (key.includes('.quantityReceived')) return 'receiving'
  return 'details'
}

export type PurchaseOrderFlowMode = 'detail' | 'create'

export function PurchaseOrderFlow(props: { mode: PurchaseOrderFlowMode; orderId?: string }) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const tenantRegion: TenantCode = session?.user?.region ?? 'US'
  const unitSystem = getDefaultUnitSystem(tenantRegion)
  const lengthUnit = getLengthUnitLabel(unitSystem)
  const weightUnit = getWeightUnitLabel(unitSystem)
  const isCreate = props.mode === 'create'
  const orderId = props.orderId
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<PurchaseOrderSummary | null>(null)
  const [splitGroupOrders, setSplitGroupOrders] = useState<SplitGroupOrderSummary[]>([])
  const [splitGroupLoading, setSplitGroupLoading] = useState(false)
  const [draftLines, setDraftLines] = useState<PurchaseOrderLineSummary[]>([])
  const [tenantDestination, setTenantDestination] = useState<string>('')
  const [tenantDisplayCode, setTenantDisplayCode] = useState<string>('')
  const [tenantCurrency, setTenantCurrency] = useState<string>('USD')
  const [transitioning, setTransitioning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [orderInfoEditing, setOrderInfoEditing] = useState(false)
  const [orderInfoSaving, setOrderInfoSaving] = useState(false)
  const [orderInfoDraft, setOrderInfoDraft] = useState({
    counterpartyName: '',
    expectedDate: '',
    incoterms: '',
    paymentTerms: '',
    notes: '',
  })
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)

  useEffect(() => {
    if (!isCreate) return
    setOrderInfoEditing(true)
  }, [isCreate])

  // Stage transition form data
  const [stageFormData, setStageFormData] = useState<Record<string, string>>({})
  const [dispatchSplitAllocations, setDispatchSplitAllocations] = useState<Record<string, string>>({})
  const setStageField = useCallback((key: string, value: string) => {
    setStageFormData(prev => {
      const next = { ...prev }
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        delete next[key]
        return next
      }
      next[key] = value
      return next
    })
  }, [])

  const getStageField = useCallback(
    (key: string): string | undefined => {
      if (!Object.prototype.hasOwnProperty.call(stageFormData, key)) return undefined
      return stageFormData[key]
    },
    [stageFormData]
  )
  const [receiveFormData, setReceiveFormData] = useState({
    warehouseCode: '',
    receiveType: '',
    customsEntryNumber: '',
    customsClearedDate: '',
    receivedDate: '',
    dutyAmount: '',
    dutyCurrency: '',
    discrepancyNotes: '',
  })
  const [receivingInventory, setReceivingInventory] = useState(false)
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

  const [gateIssues, setGateIssues] = useState<Record<string, string> | null>(null)

  const [costLedgerSummary, setCostLedgerSummary] = useState<PurchaseOrderCostLedgerSummary | null>(
    null
  )
  const [costLedgerLoading, setCostLedgerLoading] = useState(false)
  const [supplierAdjustment, setSupplierAdjustment] = useState<SupplierAdjustmentEntry | null>(null)
  const [supplierAdjustmentLoading, setSupplierAdjustmentLoading] = useState(false)
  const [supplierAdjustmentEditing, setSupplierAdjustmentEditing] = useState(false)
  const [supplierAdjustmentSaving, setSupplierAdjustmentSaving] = useState(false)
  const [supplierAdjustmentDraft, setSupplierAdjustmentDraft] = useState<{
    kind: 'credit' | 'debit'
    amount: string
    notes: string
  }>({
    kind: 'credit',
    amount: '',
    notes: '',
  })

  const [skus, setSkus] = useState<SkuSummary[]>([])
  const [skusLoading, setSkusLoading] = useState(false)
  const [batchesBySkuId, setBatchesBySkuId] = useState<Record<string, BatchOption[]>>({})
  const [batchesLoadingBySkuId, setBatchesLoadingBySkuId] = useState<Record<string, boolean>>({})
  const [addLineOpen, setAddLineOpen] = useState(false)
  const [addLineSubmitting, setAddLineSubmitting] = useState(false)
  const [activeBottomTab, setActiveBottomTab] = useState<
    'details' | 'cargo' | 'costs' | 'documents' | 'history'
  >('details')
  const [cargoSubTab, setCargoSubTab] = useState<'details' | 'attributes' | 'receiving'>('details')
  const [newLineDraft, setNewLineDraft] = useState({
    skuId: '',
    batchLot: '',
    unitsOrdered: 1,
    unitsPerCarton: null as number | null,
    notes: '',
  })
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'cancel' | 'reject' | 'delete-line' | 'delete-forwarding-cost' | null
    title: string
    message: string
    lineId?: string | null
    forwardingCostId?: string | null
  }>({ open: false, type: null, title: '', message: '', lineId: null, forwardingCostId: null })

  // Stage-based navigation - which stage view is currently selected
  const [selectedStageView, setSelectedStageView] = useState<string | null>(null)
  const [inlinePreviewDocument, setInlinePreviewDocument] = useState<PurchaseOrderDocumentSummary | null>(null)
  const [previewDocument, setPreviewDocument] = useState<PurchaseOrderDocumentSummary | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      const returnPath = isCreate
        ? '/operations/purchase-orders/new'
        : orderId
          ? `/operations/purchase-orders/${orderId}`
          : '/operations/purchase-orders'
      redirectToPortal(
        '/login',
        `${window.location.origin}${withBasePath(returnPath)}`
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
        const tenantShortCode = payload?.current?.displayName ?? payload?.current?.code
        if (typeof currency === 'string' && currency.trim()) {
          setTenantCurrency(currency.trim().toUpperCase())
        }
        if (typeof tenantShortCode === 'string' && tenantShortCode.trim()) {
          setTenantDisplayCode(tenantShortCode.trim().toUpperCase())
        }
        if (typeof tenantName !== 'string' || !tenantName.trim()) return
        const label =
          typeof tenantShortCode === 'string' && tenantShortCode.trim()
            ? `${tenantName.trim()} (${tenantShortCode.trim().toUpperCase()})`
            : tenantName.trim()
        setTenantDestination(label)
      } catch {
        // Non-blocking
      }
    }

    const loadOrder = async () => {
      if (!orderId) {
        toast.error('Purchase order ID is required')
        router.push('/operations/purchase-orders')
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/purchase-orders/${orderId}`)
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
    if (!isCreate) {
      void loadOrder()
      return
    }
    setLoading(false)
  }, [isCreate, orderId, router, session, status])

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

  const patchOrderLine = useCallback(
    async (lineId: string, data: Record<string, unknown>) => {
      if (!order) return

      try {
        const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/lines/${lineId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const message = typeof payload?.error === 'string' ? payload.error : null
          toast.error(message ? message : `Failed to update line item (HTTP ${response.status})`)
          return
        }

        const updatedLine = (await response.json()) as PurchaseOrderLineSummary
        setOrder(prev =>
          prev
            ? {
                ...prev,
                lines: prev.lines.map(line => (line.id === updatedLine.id ? updatedLine : line)),
              }
            : prev
        )
        setGateIssues(null)
        void refreshAuditLogs()
      } catch {
        toast.error('Failed to update line item')
      }
    },
    [order, refreshAuditLogs]
  )

  const maybePatchCartonDimensions = useCallback(
    (lineId: string) => {
      const readAxisValue = (axis: '1' | '2' | '3'): string => {
        const element = document.querySelector(
          `input[data-carton-side-line="${lineId}"][data-carton-side-axis="${axis}"]`
        )
        if (!(element instanceof HTMLInputElement)) return ''
        return element.value
      }

      const raw1 = readAxisValue('1').trim()
      const raw2 = readAxisValue('2').trim()
      const raw3 = readAxisValue('3').trim()

      if (!raw1 || !raw2 || !raw3) return

      const side1 = Number(raw1)
      const side2 = Number(raw2)
      const side3 = Number(raw3)

      if (!Number.isFinite(side1) || side1 <= 0) {
        toast.error('Carton length must be a positive number')
        return
      }
      if (!Number.isFinite(side2) || side2 <= 0) {
        toast.error('Carton width must be a positive number')
        return
      }
      if (!Number.isFinite(side3) || side3 <= 0) {
        toast.error('Carton height must be a positive number')
        return
      }

      void patchOrderLine(lineId, {
        cartonSide1Cm: convertLengthToCm(side1, unitSystem),
        cartonSide2Cm: convertLengthToCm(side2, unitSystem),
        cartonSide3Cm: convertLengthToCm(side3, unitSystem),
      })
    },
    [patchOrderLine, unitSystem]
  )

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

  const refreshCostLedgerSummary = useCallback(async () => {
    const orderId = order?.id
    if (!orderId) return

    try {
      setCostLedgerLoading(true)
      const response = await fetch(`/api/purchase-orders/${orderId}/costs`)
      if (!response.ok) {
        setCostLedgerSummary(null)
        return
      }

      const payload: unknown = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        setCostLedgerSummary(null)
        return
      }

      setCostLedgerSummary(payload as PurchaseOrderCostLedgerSummary)
    } catch {
      setCostLedgerSummary(null)
    } finally {
      setCostLedgerLoading(false)
    }
  }, [order?.id])

  useEffect(() => {
    void refreshCostLedgerSummary()
  }, [refreshCostLedgerSummary])

  const refreshSupplierAdjustment = useCallback(async () => {
    const orderId = order?.id
    if (!orderId) {
      setSupplierAdjustment(null)
      return
    }

    try {
      setSupplierAdjustmentLoading(true)
      const response = await fetch(`/api/purchase-orders/${orderId}/supplier-adjustments`)
      if (!response.ok) {
        setSupplierAdjustment(null)
        return
      }

      const payload: unknown = await response.json().catch(() => null)
      const dataCandidate =
        payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload
          ? (payload as { data?: unknown }).data
          : null

      if (!dataCandidate) {
        setSupplierAdjustment(null)
        return
      }

      if (typeof dataCandidate !== 'object' || Array.isArray(dataCandidate)) {
        setSupplierAdjustment(null)
        return
      }

      const record = dataCandidate as Record<string, unknown>
      const id = record.id
      const category = record.category
      const costName = record.costName
      const amount = record.amount
      const currency = record.currency
      const effectiveAt = record.effectiveAt
      const createdAt = record.createdAt
      const createdByName = record.createdByName
      const notes = record.notes

      if (typeof id !== 'string' || !id.trim()) {
        setSupplierAdjustment(null)
        return
      }

      if (typeof category !== 'string' || typeof costName !== 'string') {
        setSupplierAdjustment(null)
        return
      }

      if (typeof amount !== 'number' || !Number.isFinite(amount)) {
        setSupplierAdjustment(null)
        return
      }

      if (typeof currency !== 'string' || typeof effectiveAt !== 'string' || typeof createdAt !== 'string') {
        setSupplierAdjustment(null)
        return
      }

      if (typeof createdByName !== 'string') {
        setSupplierAdjustment(null)
        return
      }

      setSupplierAdjustment({
        id,
        category,
        costName,
        amount,
        currency,
        effectiveAt,
        createdAt,
        createdByName,
        notes: typeof notes === 'string' ? notes : null,
      })
    } catch {
      setSupplierAdjustment(null)
    } finally {
      setSupplierAdjustmentLoading(false)
    }
  }, [order?.id])

  useEffect(() => {
    void refreshSupplierAdjustment()
  }, [refreshSupplierAdjustment])

  useEffect(() => {
    if (supplierAdjustmentEditing) return

    if (!supplierAdjustment) {
      setSupplierAdjustmentDraft({ kind: 'credit', amount: '', notes: '' })
      return
    }

    const kind = supplierAdjustment.amount < 0 ? 'credit' : 'debit'
    setSupplierAdjustmentDraft({
      kind,
      amount: Math.abs(supplierAdjustment.amount).toFixed(2),
      notes: supplierAdjustment.notes ? supplierAdjustment.notes : '',
    })
  }, [supplierAdjustment, supplierAdjustmentEditing])

  const saveSupplierAdjustment = useCallback(async () => {
    if (!order) return
    if (supplierAdjustmentSaving) return

    const amount = Number(supplierAdjustmentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Amount must be a positive number')
      return
    }

    try {
      setSupplierAdjustmentSaving(true)
      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/supplier-adjustments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: supplierAdjustmentDraft.kind,
          amount,
          notes: supplierAdjustmentDraft.notes.trim()
            ? supplierAdjustmentDraft.notes.trim()
            : undefined,
        }),
      })

      if (!response.ok) {
        toast.error(`Failed to save supplier adjustment (HTTP ${response.status})`)
        return
      }

      setSupplierAdjustmentEditing(false)
      void refreshSupplierAdjustment()
      toast.success('Supplier adjustment saved')
    } catch {
      toast.error('Failed to save supplier adjustment')
    } finally {
      setSupplierAdjustmentSaving(false)
    }
  }, [
    order,
    refreshSupplierAdjustment,
    supplierAdjustmentDraft.amount,
    supplierAdjustmentDraft.kind,
    supplierAdjustmentDraft.notes,
    supplierAdjustmentSaving,
  ])

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

  const inboundCostRows = costLedgerSummary?.breakdown?.inbound ?? []
  const inboundSubtotal = costLedgerSummary?.totals?.inbound ?? 0

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
      if (order.status === 'WAREHOUSE') {
        void refreshCostLedgerSummary()
      }
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
    refreshCostLedgerSummary,
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
      if (order.status === 'WAREHOUSE') {
        void refreshCostLedgerSummary()
      }
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
    refreshCostLedgerSummary,
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
        if (order.status === 'WAREHOUSE') {
          void refreshCostLedgerSummary()
        }
        toast.success('Cargo cost deleted')
      } catch {
        toast.error('Failed to delete cargo cost')
      } finally {
        setForwardingCostDeletingId(null)
      }
    },
    [order, refreshCostLedgerSummary]
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
        const presignedResponse = await fetchWithCSRF(
          `/api/purchase-orders/${orderId}/documents/presigned-url`,
          {
            method: 'POST',
            body: JSON.stringify({
              stage,
              documentType,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }),
          }
        )

        const presignedPayload = await presignedResponse.json().catch(() => null)
        if (!presignedResponse.ok) {
          const errorMessage =
            typeof presignedPayload?.error === 'string' ? presignedPayload.error : null
          const detailsMessage =
            typeof presignedPayload?.details === 'string' ? presignedPayload.details : null
          if (errorMessage && detailsMessage) {
            toast.error(`${errorMessage}: ${detailsMessage}`)
          } else if (errorMessage) {
            toast.error(errorMessage)
          } else {
            toast.error(`Failed to start upload (HTTP ${presignedResponse.status})`)
          }
          return
        }

        const uploadUrl =
          typeof presignedPayload?.uploadUrl === 'string' ? presignedPayload.uploadUrl : null
        const s3Key = typeof presignedPayload?.s3Key === 'string' ? presignedPayload.s3Key : null
        if (!uploadUrl) {
          toast.error('Failed to start upload')
          return
        }
        if (!s3Key) {
          toast.error('Failed to start upload')
          return
        }

        const uploadResponse = await fetchWithCSRF(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        })

        if (!uploadResponse.ok) {
          const uploadPayload = await uploadResponse.json().catch(() => null)
          const errorMessage = typeof uploadPayload?.error === 'string' ? uploadPayload.error : null
          const detailsMessage =
            typeof uploadPayload?.details === 'string' ? uploadPayload.details : null
          if (errorMessage && detailsMessage) {
            toast.error(`${errorMessage}: ${detailsMessage}`)
          } else if (errorMessage) {
            toast.error(errorMessage)
          } else {
            toast.error(`Failed to upload document (HTTP ${uploadResponse.status})`)
          }
          return
        }

        const response = await fetchWithCSRF(`/api/purchase-orders/${orderId}/documents`, {
          method: 'POST',
          body: JSON.stringify({
            stage,
            documentType,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            s3Key,
          }),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          const errorMessage = typeof payload?.error === 'string' ? payload.error : null
          const detailsMessage = typeof payload?.details === 'string' ? payload.details : null
          if (errorMessage && detailsMessage) {
            toast.error(`${errorMessage}: ${detailsMessage}`)
          } else if (errorMessage) {
            toast.error(errorMessage)
          } else {
            toast.error(`Failed to upload document (HTTP ${response.status})`)
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

  useEffect(() => {
    if (!session) return

    if (isCreate || order?.status === 'DRAFT') {
      void ensureSkusLoaded()
    }
  }, [ensureSkusLoaded, isCreate, order?.status, session])

  const ensureSuppliersLoaded = useCallback(async () => {
    if (suppliersLoading || suppliers.length > 0) return

    try {
      setSuppliersLoading(true)
      const response = await fetch('/api/suppliers', { credentials: 'include' })
      if (!response.ok) {
        setSuppliers([])
        return
      }
      const payload = await response.json().catch(() => null)
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : []
      setSuppliers(rows as SupplierOption[])
    } catch {
      setSuppliers([])
    } finally {
      setSuppliersLoading(false)
    }
  }, [suppliers.length, suppliersLoading])

  useEffect(() => {
    if (!orderInfoEditing) return
    void ensureSuppliersLoaded()
  }, [ensureSuppliersLoaded, orderInfoEditing])

  const selectedSupplier = useMemo(() => {
    const supplierName = orderInfoDraft.counterpartyName.trim()
    if (!supplierName) return null
    return suppliers.find(supplier => supplier.name === supplierName) ?? null
  }, [orderInfoDraft.counterpartyName, suppliers])

  const supplierCountry = useMemo(() => {
    if (order?.supplier?.country) return order.supplier.country
    const fromOrderAddress = deriveSupplierCountry(order?.supplier?.address)
    if (fromOrderAddress) return fromOrderAddress
    return deriveSupplierCountry(selectedSupplier?.address)
  }, [order?.supplier?.address, order?.supplier?.country, selectedSupplier?.address])

  const applySupplierSelection = useCallback(
    (supplierName: string) => {
      const selectedName = supplierName.trim()

      setOrderInfoDraft(prev => {
        if (!selectedName) {
          return { ...prev, counterpartyName: '' }
        }

        const supplier = suppliers.find(item => item.name === selectedName) ?? null
        if (!supplier) {
          return { ...prev, counterpartyName: selectedName }
        }

        const supplierIncoterms =
          typeof supplier.defaultIncoterms === 'string'
            ? supplier.defaultIncoterms.trim().toUpperCase()
            : ''
        const supplierPaymentTerms =
          typeof supplier.defaultPaymentTerms === 'string'
            ? supplier.defaultPaymentTerms.trim()
            : ''

        const nextIncoterms =
          supplierIncoterms && (INCOTERMS_OPTIONS as readonly string[]).includes(supplierIncoterms)
            ? supplierIncoterms
            : prev.incoterms
        const nextPaymentTerms = supplierPaymentTerms ? supplierPaymentTerms : prev.paymentTerms

        return {
          ...prev,
          counterpartyName: supplier.name,
          incoterms: nextIncoterms,
          paymentTerms: nextPaymentTerms,
        }
      })
    },
    [suppliers]
  )

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

  useEffect(() => {
    if (!order) return

    if (order.status !== 'MANUFACTURING') {
      setDispatchSplitAllocations({})
      return
    }

    const activeLines = order.lines.filter(line => line.status !== 'CANCELLED')
    setDispatchSplitAllocations(prev => {
      const next: Record<string, string> = {}
      for (const line of activeLines) {
        if (Object.prototype.hasOwnProperty.call(prev, line.id)) {
          next[line.id] = prev[line.id]
          continue
        }
        next[line.id] = String(line.quantity)
      }
      return next
    })
  }, [order])

  useEffect(() => {
    if (!order?.splitGroupId) {
      setSplitGroupOrders([])
      return
    }

    const groupId = order.splitGroupId
    let cancelled = false

    const loadSplitGroup = async () => {
      try {
        setSplitGroupLoading(true)
        const response = await fetch(`/api/purchase-orders?splitGroupId=${encodeURIComponent(groupId)}`)
        if (!response.ok) {
          setSplitGroupOrders([])
          return
        }

        const payload = await response.json().catch(() => null)
        const list =
          payload && typeof payload === 'object' && 'data' in payload
            ? (payload as { data?: unknown }).data
            : null
        if (!Array.isArray(list)) {
          setSplitGroupOrders([])
          return
        }

        const parsed = list
          .map((item): SplitGroupOrderSummary | null => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null
            const record = item as Record<string, unknown>
            const id = record.id
            const orderNumber = record.orderNumber
            const poNumberCandidate = record.poNumber
            const status = record.status
            const createdAt = record.createdAt

            if (typeof id !== 'string' || !id.trim()) return null
            if (typeof orderNumber !== 'string' || !orderNumber.trim()) return null
            if (typeof status !== 'string') return null
            if (typeof createdAt !== 'string' || !createdAt.trim()) return null

            const poNumber =
              poNumberCandidate === null || poNumberCandidate === undefined
                ? null
                : typeof poNumberCandidate === 'string'
                  ? poNumberCandidate
                  : null

            return {
              id,
              orderNumber,
              poNumber,
              status: status as POStageStatus,
              createdAt,
            }
          })
          .filter((value): value is SplitGroupOrderSummary => value !== null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

        if (cancelled) return
        setSplitGroupOrders(parsed)
      } finally {
        if (cancelled) return
        setSplitGroupLoading(false)
      }
    }

    void loadSplitGroup()

    return () => {
      cancelled = true
    }
  }, [order?.splitGroupId])

  useEffect(() => {
    if (!order) return
    if (activeViewStage !== 'WAREHOUSE') return

    const wh = order.stageData.warehouse
    setReceiveFormData({
      warehouseCode: order.warehouseCode ?? '',
      receiveType: order.receiveType ?? '',
      customsEntryNumber: wh?.customsEntryNumber ?? '',
      customsClearedDate: formatDateOnly(wh?.customsClearedDate ?? null),
      receivedDate: formatDateOnly(wh?.receivedDate ?? null),
      dutyAmount: wh?.dutyAmount != null ? String(wh.dutyAmount) : '',
      dutyCurrency: wh?.dutyCurrency ?? '',
      discrepancyNotes: wh?.discrepancyNotes ?? '',
    })
  }, [activeViewStage, order])

  useEffect(() => {
    if (cargoSubTab !== 'receiving') return
    if (activeViewStage === 'WAREHOUSE') return
    setCargoSubTab('details')
  }, [activeViewStage, cargoSubTab])

  const gateTabIssues = useMemo(() => {
    const details: Record<'details' | 'cargo' | 'costs' | 'documents', boolean> = {
      details: false,
      cargo: false,
      costs: false,
      documents: false,
    }

    if (!gateIssues) return details

    for (const key of Object.keys(gateIssues)) {
      if (key.startsWith('details.')) details.details = true
      if (key.startsWith('cargo.')) details.cargo = true
      if (key.startsWith('costs.')) details.costs = true
      if (key.startsWith('documents.')) details.documents = true
    }

    return details
  }, [gateIssues])

  const cargoSubTabIssues = useMemo(() => {
    const issues: Record<CargoSubTabKey, boolean> = {
      details: false,
      attributes: false,
      receiving: false,
    }

    if (!gateIssues) return issues

    for (const key of Object.keys(gateIssues)) {
      const target = resolveCargoSubTabForGateKey(key)
      if (!target) continue
      issues[target] = true
    }

    return issues
  }, [gateIssues])

  const cargoLineIssueCountById = useMemo(() => {
    const counts: Record<string, number> = {}
    if (!gateIssues) return counts

    for (const key of Object.keys(gateIssues)) {
      if (!key.startsWith('cargo.lines.')) continue
      const rest = key.slice('cargo.lines.'.length)
      const dotIndex = rest.indexOf('.')
      if (dotIndex <= 0) continue
      const lineId = rest.slice(0, dotIndex)
      counts[lineId] = (counts[lineId] ?? 0) + 1
    }

    return counts
  }, [gateIssues])

  const tabForGateKey = (
    key: string
  ): 'details' | 'cargo' | 'costs' | 'documents' | 'history' => {
    if (key.startsWith('cargo.')) return 'cargo'
    if (key.startsWith('costs.')) return 'costs'
    if (key.startsWith('documents.')) return 'documents'
    if (key.startsWith('details.')) return 'details'
    return 'details'
  }

  const jumpToGateKey = (gateKey: string) => {
    const targetTab = tabForGateKey(gateKey)
    setActiveBottomTab(targetTab)

    if (targetTab === 'cargo') {
      const targetCargoSubTab = resolveCargoSubTabForGateKey(gateKey)
      if (targetCargoSubTab) {
        if (targetCargoSubTab === 'receiving' && activeViewStage !== 'WAREHOUSE') {
          setCargoSubTab('details')
        } else {
          setCargoSubTab(targetCargoSubTab)
        }
      }
    }

    setTimeout(() => {
      const element = document.querySelector(`[data-gate-key="${gateKey}"]`)
      if (!(element instanceof HTMLElement)) return

      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        element.focus()
        return
      }

      const focusTarget = element.querySelector('input, textarea, select')
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus()
      }
    }, 50)
  }

  // Can user click on a stage to view it?
  const canViewStage = (stageValue: string) => {
    if (isCreate) return stageValue === 'DRAFT'
    if (!order || order.status === 'CANCELLED') return false
    const targetIdx = STAGES.findIndex(s => s.value === stageValue)
    if (targetIdx < 0) return false
    // Can view completed stages and current stage.
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
      const stageData: Record<string, unknown> = { ...stageFormData }

      if (order.status === 'MANUFACTURING' && targetStatus === 'OCEAN') {
        const activeLines = order.lines.filter(line => line.status !== 'CANCELLED')
        stageData.splitAllocations = activeLines.map(line => ({
          lineId: line.id,
          shipNowCartons: dispatchSplitAllocations[line.id],
        }))
      }

      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStatus,
          stageData,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const details = payload?.details
        if (details && typeof details === 'object') {
          const record = details as Record<string, string>
          setGateIssues(record)
          const keys = Object.keys(record)
          const firstKey = keys.length > 0 ? keys[0] : null
          if (firstKey) {
            jumpToGateKey(firstKey)
          }
        }

        toast.error(typeof payload?.error === 'string' ? payload.error : 'Failed to transition order')
        return false
      }

      const updated = await response.json()
      setOrder(updated)
      setStageFormData({}) // Clear form
      setGateIssues(null)
      void refreshAuditLogs()
      void refreshCostLedgerSummary()
      toast.success(`Order moved to ${formatStatusLabel(targetStatus)}`)
      return true
    } catch (_error) {
      toast.error('Failed to transition order')
      return false
    } finally {
      setTransitioning(false)
    }
  }

  const handleReceiveInventory = async () => {
    if (!order) return
    if (receivingInventory) return

    try {
      setReceivingInventory(true)

      const dutyAmount = receiveFormData.dutyAmount.trim().length > 0 ? Number(receiveFormData.dutyAmount) : null
      if (receiveFormData.dutyAmount.trim().length > 0 && (!Number.isFinite(dutyAmount) || dutyAmount < 0)) {
        toast.error('Duty amount must be a positive number')
        return
      }

      const lineReceipts = order.lines
        .filter(line => line.status !== 'CANCELLED')
        .map(line => ({
        lineId: line.id,
        quantityReceived: line.quantityReceived ?? line.quantity,
      }))

      const response = await fetchWithCSRF(`/api/purchase-orders/${order.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseCode: receiveFormData.warehouseCode,
          receiveType: receiveFormData.receiveType,
          customsEntryNumber: receiveFormData.customsEntryNumber,
          customsClearedDate: receiveFormData.customsClearedDate,
          receivedDate: receiveFormData.receivedDate,
          dutyAmount,
          dutyCurrency: receiveFormData.dutyCurrency,
          discrepancyNotes: receiveFormData.discrepancyNotes,
          lineReceipts,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const details = payload?.details
        if (details && typeof details === 'object') {
          const record = details as Record<string, string>
          setGateIssues(record)
          const keys = Object.keys(record)
          const firstKey = keys.length > 0 ? keys[0] : null
          if (firstKey) {
            jumpToGateKey(firstKey)
          }
        }
        toast.error(typeof payload?.error === 'string' ? payload.error : 'Failed to receive inventory')
        return
      }

      const updated = await response.json()
      setOrder(updated)
      setGateIssues(null)
      void refreshAuditLogs()
      void refreshCostLedgerSummary()
      void refreshSupplierAdjustment()
      toast.success('Inventory received')
    } catch (_error) {
      toast.error('Failed to receive inventory')
    } finally {
      setReceivingInventory(false)
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
    if (confirmDialog.type === 'delete-forwarding-cost' && confirmDialog.forwardingCostId) {
      const row = forwardingCosts.find(item => item.id === confirmDialog.forwardingCostId)
      if (row) {
        await deleteForwardingCost(row)
      }
    }
    setConfirmDialog({
      open: false,
      type: null,
      title: '',
      message: '',
      lineId: null,
      forwardingCostId: null,
    })
  }

  const handleConfirmDialogClose = () => {
    setConfirmDialog({
      open: false,
      type: null,
      title: '',
      message: '',
      lineId: null,
      forwardingCostId: null,
    })
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>{isCreate ? 'Loading…' : 'Loading purchase order…'}</span>
        </div>
      </div>
    )
  }

  if (!order && !isCreate) {
    return null
  }

  const flowStatus: POStageStatus = order ? order.status : 'DRAFT'
  const flowLines = order ? order.lines.filter(line => line.status !== 'CANCELLED') : draftLines
  const totalUnits = flowLines.reduce((sum, line) => sum + (line.unitsOrdered ?? 0), 0)
  const totalCartons = flowLines.reduce((sum, line) => sum + line.quantity, 0)
  const productSubtotal = flowLines.reduce((sum, line) => sum + (line.totalCost ?? 0), 0)
  const supplierAdjustmentSubtotal = supplierAdjustment ? supplierAdjustment.amount : 0
  const dutySubtotal = order?.stageData.warehouse?.dutyAmount ?? 0
  const totalCostSummary =
    productSubtotal + forwardingSubtotal + inboundSubtotal + dutySubtotal + supplierAdjustmentSubtotal
  const isTerminalStatus = order
    ? order.status === 'SHIPPED' || order.status === 'CANCELLED' || order.status === 'REJECTED'
    : false
  const isReceived = Boolean(order?.postedAt)
  const isReadOnly = isTerminalStatus || isReceived
  const canEdit = isCreate ? true : !isReadOnly && order?.status === 'DRAFT'
  const canEditDispatchAllocation =
    !isCreate && !isReadOnly && order?.status === 'MANUFACTURING' && activeViewStage === 'MANUFACTURING'
  const canEditForwardingCosts =
    !isTerminalStatus && !isReceived && (flowStatus === 'OCEAN' || flowStatus === 'WAREHOUSE')

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
  const showRfqPdfDownload = !isCreate && activeViewStage === 'DRAFT' && order?.status === 'DRAFT'
  const showPoPdfDownload = !isCreate && activeViewStage === 'ISSUED' && order?.status !== 'DRAFT'
  const showShippingMarksDownload =
    !isCreate && activeViewStage === 'ISSUED' && !isTerminalStatus && order?.status !== 'DRAFT'
  const displayOrderNumber = isCreate
    ? 'New RFQ'
    : flowStatus === 'DRAFT'
      ? order.orderNumber
      : order.poNumber ?? order.orderNumber
  const historyCount = isCreate
    ? 0
    : auditLogs.length > 0
      ? auditLogs.length
      : order.approvalHistory?.length ?? 0
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
  const inlineStageMeta = inlinePreviewDocument
    ? DOCUMENT_STAGE_META[inlinePreviewDocument.stage]
    : null
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
  const previewIsImage = Boolean(
    previewDocument && previewDocument.contentType.startsWith('image/')
  )

  const handleSaveOrderInfo = async () => {
    if (!orderInfoDraft.counterpartyName.trim()) {
      toast.error('Supplier is required')
      return
    }

    if (isCreate) {
      setOrderInfoEditing(false)
      return
    }

    if (!order) return

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

  const handleCreateRfq = async () => {
    if (!isCreate) return
    if (creating) return

    const counterpartyName = orderInfoDraft.counterpartyName.trim()
    if (!counterpartyName) {
      toast.error('Supplier is required')
      return
    }

    const expectedDate = orderInfoDraft.expectedDate.trim()
    if (!expectedDate) {
      toast.error('Cargo ready date is required')
      return
    }

    const incoterms = orderInfoDraft.incoterms.trim()
    if (!incoterms) {
      toast.error('Incoterms is required')
      return
    }

    const paymentTerms = orderInfoDraft.paymentTerms.trim()
    if (!paymentTerms) {
      toast.error('Payment terms is required')
      return
    }

    if (draftLines.length === 0) {
      toast.error('At least one line item is required')
      return
    }

    try {
      setCreating(true)
      const notes = orderInfoDraft.notes.trim()

      const response = await fetchWithCSRF('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            counterpartyName,
            expectedDate,
            incoterms,
            paymentTerms,
            notes: notes ? notes : undefined,
	          lines: draftLines.map(line => ({
	            skuCode: line.skuCode,
	            skuDescription: line.skuDescription ? line.skuDescription : undefined,
	            batchLot: line.batchLot!,
	            piNumber: line.piNumber ? line.piNumber : undefined,
	            commodityCode: line.commodityCode ? line.commodityCode : undefined,
	            countryOfOrigin: line.countryOfOrigin ? line.countryOfOrigin : undefined,
	            netWeightKg: line.netWeightKg !== null ? line.netWeightKg : undefined,
	            cartonWeightKg: line.cartonWeightKg != null ? line.cartonWeightKg : undefined,
	            cartonSide1Cm: line.cartonSide1Cm != null ? line.cartonSide1Cm : undefined,
	            cartonSide2Cm: line.cartonSide2Cm != null ? line.cartonSide2Cm : undefined,
	            cartonSide3Cm: line.cartonSide3Cm != null ? line.cartonSide3Cm : undefined,
	            material: line.material ? line.material : undefined,
	            unitsOrdered: line.unitsOrdered,
	            unitsPerCarton: line.unitsPerCarton,
	            totalCost: line.totalCost !== null ? line.totalCost : undefined,
	            currency: line.currency ? line.currency : tenantCurrency,
	            notes: line.lineNotes ? line.lineNotes : undefined,
	          })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const errorMessage = typeof payload?.error === 'string' ? payload.error : null
        toast.error(
          errorMessage ? errorMessage : `Failed to create RFQ (HTTP ${response.status})`
        )
        return
      }

      const payload: unknown = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        toast.error('Failed to create RFQ')
        return
      }

      const id = (payload as { id?: unknown }).id
      if (typeof id !== 'string' || !id) {
        toast.error('Failed to create RFQ')
        return
      }

      toast.success('RFQ created')
      router.push(`/operations/purchase-orders/${id}`)
    } catch {
      toast.error('Failed to create RFQ')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteLine = async (lineId: string) => {
    if (isCreate) {
      setDraftLines(prev => prev.filter(line => line.id !== lineId))
      toast.success('Line item removed')
      return
    }

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
      void refreshAuditLogs()
      toast.success('Line item removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove line item')
    }
  }

  const handleAddLineItem = async () => {
    if (!selectedSku) {
      toast.error('Please select a SKU')
      return
    }

    const batchLot = newLineDraft.batchLot.trim().toUpperCase()
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

    if (isCreate) {
      const now = new Date().toISOString()
      const quantity = Math.ceil(unitsOrdered / unitsPerCarton)
      const batchOptions = batchesBySkuId[newLineDraft.skuId] ?? []
      const selectedBatch = batchOptions.find(option => option.batchCode === batchLot) ?? null
      const createdLine: PurchaseOrderLineSummary = {
        id: `draft-${now}-${Math.random().toString(36).slice(2, 9)}`,
        skuCode: selectedSku.skuCode,
        skuDescription: selectedSku.description,
        batchLot,
        piNumber: null,
        commodityCode: null,
        countryOfOrigin: null,
        netWeightKg: null,
        material: null,
        cartonDimensionsCm: selectedBatch?.cartonDimensionsCm ?? null,
        cartonSide1Cm: selectedBatch?.cartonSide1Cm ?? null,
        cartonSide2Cm: selectedBatch?.cartonSide2Cm ?? null,
        cartonSide3Cm: selectedBatch?.cartonSide3Cm ?? null,
        cartonWeightKg: selectedBatch?.cartonWeightKg ?? null,
        packagingType: selectedBatch?.packagingType ?? null,
        unitsOrdered,
        unitsPerCarton,
        quantity,
        unitCost: null,
        totalCost: null,
        currency: tenantCurrency,
        status: 'PENDING',
        postedQuantity: 0,
        quantityReceived: null,
        lineNotes: newLineDraft.notes.trim().length > 0 ? newLineDraft.notes.trim() : null,
        createdAt: now,
        updatedAt: now,
      }

      setDraftLines(prev => [...prev, createdLine])
      toast.success('Line item added')
      setAddLineOpen(false)
      setNewLineDraft({
        skuId: '',
        batchLot: '',
        unitsOrdered: 1,
        unitsPerCarton: null,
        notes: '',
      })
      return
    }

    if (!order) return

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
        notes: '',
      })
      void refreshAuditLogs()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add line item')
    } finally {
      setAddLineSubmitting(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!order) return
    try {
      const response = await fetch(withBasePath(`/api/purchase-orders/${order.id}/pdf`))
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const details = payload?.details
        if (details && typeof details === 'object') {
          const record = details as Record<string, string>
          setGateIssues(record)
          const keys = Object.keys(record)
          const firstKey = keys.length > 0 ? keys[0] : null
          if (firstKey) {
            jumpToGateKey(firstKey)
          }
        }
        toast.error(typeof payload?.error === 'string' ? payload.error : 'Failed to generate PDF')
        return
      }

      const html = await response.text()
      const popup = window.open('', '_blank')
      if (!popup) return
      popup.document.open()
      popup.document.write(html)
      popup.document.close()
    } catch (_error) {
      toast.error('Failed to generate PDF')
    }
  }

  const handleDownloadShippingMarks = async () => {
    if (!order) return

    try {
      const response = await fetch(withBasePath(`/api/purchase-orders/${order.id}/shipping-marks`))
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const details = payload?.details
        if (details && typeof details === 'object') {
          const record = details as Record<string, string>
          setGateIssues(record)
          const keys = Object.keys(record)
          const firstKey = keys.length > 0 ? keys[0] : null
          if (firstKey) {
            jumpToGateKey(firstKey)
          }
        }

        toast.error(typeof payload?.error === 'string' ? payload.error : 'Failed to generate shipping marks')
        return
      }

      const html = await response.text()
      const popup = window.open('', '_blank')
      if (!popup) return
      popup.document.open()
      popup.document.write(html)
      popup.document.close()
    } catch (_error) {
      toast.error('Failed to generate shipping marks')
    }
  }

  return (
    <PageContainer>
      <PageHeaderSection
        title={displayOrderNumber}
        description="Operations"
        icon={Package2}
        backHref="/operations/purchase-orders"
        backLabel="Back"
        actions={
          <>
            {showRfqPdfDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadPdf()}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                RFQ PDF
              </Button>
            )}
            {showPoPdfDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadPdf()}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                PO PDF
              </Button>
            )}
            {showShippingMarksDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadShippingMarks()}
                className="gap-2"
              >
                <Package2 className="h-4 w-4" />
                Shipping Marks
              </Button>
            )}
            {!isCreate && !isReadOnly && (
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
	          {(isCreate ||
	            (order && !order.isLegacy && order.status !== 'CANCELLED' && order.status !== 'REJECTED')) && (
	            <div className="rounded-xl border bg-white dark:bg-slate-800 p-6 shadow-sm">
	              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Order Progress</h2>

                {!isCreate && order?.splitGroupId && (
                  <div className="mb-4 rounded-lg border bg-slate-50/50 dark:bg-slate-700/40 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-muted-foreground uppercase tracking-wide">
                        Split Group
                      </span>
                      {splitGroupLoading ? (
                        <span className="text-muted-foreground">Loading…</span>
                      ) : splitGroupOrders.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {splitGroupOrders.map(member => {
                            const label = member.poNumber ?? member.orderNumber
                            const isCurrent = member.id === order.id
                            return (
                              <div key={member.id} className="flex items-center gap-1.5">
                                {isCurrent ? (
                                  <span className="font-semibold text-foreground">{label}</span>
                                ) : (
                                  <Link
                                    href={`/operations/purchase-orders/${member.id}`}
                                    className="text-emerald-700 dark:text-emerald-400 hover:underline"
                                  >
                                    {label}
                                  </Link>
                                )}
                                <Badge variant="outline" className="text-[10px]">
                                  {formatStatusLabel(member.status)}
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

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
                    onClick={async () => {
                      if (!nextStage) return
                      await executeTransition(nextStage.value as POStageStatus)
                    }}
                    disabled={transitioning || (order ? activeViewStage !== order.status : false)}
                    className="gap-2"
                  >
                    {order?.status === 'DRAFT' ? 'Issue PO' : `Advance to ${nextStage.label}`}
                    <ChevronRight className="h-4 w-4" />
		                  </Button>
		                )}

		                {order?.status === 'WAREHOUSE' && !isReadOnly && (
		                  <Button
		                    type="button"
		                    onClick={() => void handleReceiveInventory()}
		                    disabled={receivingInventory || (order ? activeViewStage !== order.status : false)}
		                    className="gap-2"
		                  >
		                    {receivingInventory && <Loader2 className="h-4 w-4 animate-spin" />}
		                    Receive Inventory
		                  </Button>
		                )}

	                {isCreate && (
	                  <Button
	                    onClick={() => void handleCreateRfq()}
                    disabled={creating}
                    className="gap-2"
                  >
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create RFQ
                  </Button>
                )}
	              </div>

	              {order && order.status === 'WAREHOUSE' && (
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
	          {order && order.status === 'CANCELLED' && (
	            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
	              <p className="text-sm text-slate-700 dark:text-slate-300">
	                This order has been cancelled and cannot be modified.
	              </p>
	            </div>
	          )}

	          {/* Rejected banner */}
	          {order && order.status === 'REJECTED' && (
	            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
	              <p className="text-sm text-slate-700 dark:text-slate-300">
	                This PO was rejected by the supplier. Reopen it as an RFQ to revise and re-issue.
	              </p>
              <Button
                variant="outline"
                onClick={() => handleTransition('DRAFT')}
                disabled={transitioning}
                className="gap-2"
              >
                <FileEdit className="h-4 w-4" />
                Reopen RFQ
              </Button>
            </div>
          )}

          {/* Details, Cargo, Costs, Documents & History Tabs */}
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
                {gateTabIssues.details && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                )}
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
                  {flowLines.length}
                </Badge>
                {gateTabIssues.cargo && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                )}
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
                {gateTabIssues.costs && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                )}
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
                {gateTabIssues.documents && (
                  <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
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
                {!isCreate && historyCount > 0 && (
                  <Badge variant="outline" className="text-xs ml-1">
                    {historyCount}
                  </Badge>
                )}
                {activeBottomTab === 'history' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
              {activeBottomTab === 'cargo' && (
                <div className="ml-auto flex items-center gap-3 pr-6">
                  <span className="text-sm text-muted-foreground">
                    Total: {totalUnits.toLocaleString()} units · {totalCartons.toLocaleString()}{' '}
                    cartons
                  </span>
                </div>
              )}
            </div>

            {activeBottomTab === 'cargo' && (
              <>
                {!isCreate && order ? (
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
                        {order.stageData.manufacturing?.totalPallets != null
                          ? order.stageData.manufacturing.totalPallets.toLocaleString()
                          : '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Weight ({weightUnit})
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {order.stageData.manufacturing?.totalWeightKg != null
                          ? convertWeightFromKg(order.stageData.manufacturing.totalWeightKg, unitSystem).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Volume (CBM)
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {order.stageData.manufacturing?.totalVolumeCbm != null
                          ? order.stageData.manufacturing.totalVolumeCbm.toLocaleString()
                          : '—'}
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
                    {cargoSubTabIssues.details && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
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
                    {cargoSubTabIssues.attributes && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
                  </button>
                  {activeViewStage === 'WAREHOUSE' && (
                    <button
                      type="button"
                      onClick={() => setCargoSubTab('receiving')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                        cargoSubTab === 'receiving'
                          ? 'text-cyan-700 dark:text-cyan-400 border-b-2 border-cyan-600 bg-white dark:bg-slate-800 -mb-px'
                          : 'text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Warehouse className="h-4 w-4" />
                      Receiving
                      {cargoSubTabIssues.receiving && (
                        <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Details Sub-tab */}
                {cargoSubTab === 'details' && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto" data-gate-key="cargo.lines">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">SKU</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">Batch</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Description</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units/Ctn</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Cartons</th>
                          {canEditDispatchAllocation && (
                            <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                              Ship Now
                            </th>
                          )}
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">PI #</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Notes</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Received</th>
                          {canEdit && <th className="w-[60px]"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {flowLines.map((line) => (
                          <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap min-w-[100px]">
                              <div className="flex items-center gap-2">
                                {(cargoLineIssueCountById[line.id] ?? 0) > 0 && (
                                  <span className="text-xs font-semibold text-rose-600">!</span>
                                )}
                                <span>{line.skuCode}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap min-w-[100px]">
                              {line.batchLot ? line.batchLot : '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[180px] truncate">
                              {line.skuDescription ? line.skuDescription : '—'}
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
                            {canEditDispatchAllocation && (
                              <td
                                className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap"
                                data-gate-key={`cargo.lines.${line.id}.shipNowCartons`}
                              >
                                {(() => {
                                  const gateKey = `cargo.lines.${line.id}.shipNowCartons`
                                  const issue = gateIssues ? gateIssues[gateKey] : null
                                  return (
                                    <div className="flex flex-col items-end space-y-1" data-gate-key={gateKey}>
                                      <Input
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        step="1"
                                        max={line.quantity}
                                        value={dispatchSplitAllocations[line.id] ?? String(line.quantity)}
                                        onChange={e =>
                                          setDispatchSplitAllocations(prev => ({
                                            ...prev,
                                            [line.id]: e.target.value,
                                          }))
                                        }
                                        className={cn(
                                          'h-7 w-20 px-2 py-0 text-xs text-right',
                                          issue && 'border-rose-500 focus-visible:ring-rose-500'
                                        )}
                                        data-gate-key={gateKey}
                                      />
                                      {issue && <p className="text-xs text-rose-600">{issue}</p>}
                                    </div>
                                  )
                                })()}
                              </td>
                            )}
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap min-w-[140px]">
                              {(() => {
                                const gateKey = `cargo.lines.${line.id}.piNumber`
                                const issue = gateIssues ? gateIssues[gateKey] : null
                                const canEditPiNumber =
                                  canEdit && order.status === 'ISSUED' && activeViewStage === 'ISSUED'

                                if (canEditPiNumber) {
                                  return (
                                    <div className="space-y-1" data-gate-key={gateKey}>
                                      <Input
                                        defaultValue={line.piNumber ?? ''}
                                        placeholder="PI-..."
                                        data-gate-key={gateKey}
                                        onBlur={e => {
                                          const trimmed = e.target.value.trim()
                                          void patchOrderLine(line.id, {
                                            piNumber: trimmed.length > 0 ? trimmed : null,
                                          })
                                        }}
                                        className={cn(
                                          'h-7 px-2 py-0 text-xs',
                                          issue && 'border-rose-500 focus-visible:ring-rose-500'
                                        )}
                                      />
                                      {issue && <p className="text-xs text-rose-600">{issue}</p>}
                                    </div>
                                  )
                                }

                                return (
                                  <span data-gate-key={gateKey}>
                                    {line.piNumber ? line.piNumber : '—'}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                              {line.lineNotes ? line.lineNotes : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {(line.quantityReceived ?? line.postedQuantity).toLocaleString()}
                            </td>
                            {canEdit && (
                              <td className="px-2 py-2 whitespace-nowrap text-right">
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
                                      message: `Remove SKU ${line.skuCode} (${line.batchLot ? line.batchLot : '—'}) from this RFQ?`,
                                      lineId: line.id,
                                    })
                                  }
                                  title="Remove line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {/* Inline Add Row */}
                        {canEdit && (
                          <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30">
                            <td className="px-3 py-2 min-w-[100px]">
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
                                    notes: '',
                                  }))
                                  void ensureSkuBatchesLoaded(skuId)
                                }}
                                disabled={skusLoading || addLineSubmitting}
                                className="w-full h-7 px-2 border rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                              >
                                <option value="">Select SKU</option>
                                {skus.map(sku => (
                                  <option key={sku.id} value={sku.id}>
                                    {sku.skuCode}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 min-w-[100px]">
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
                                className="w-full h-7 px-2 border rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs disabled:opacity-50"
                              >
                                {!newLineDraft.skuId ? (
                                  <option value="">—</option>
                                ) : batchesLoadingBySkuId[newLineDraft.skuId] ? (
                                  <option value="">Loading…</option>
                                ) : (batchesBySkuId[newLineDraft.skuId]?.length ?? 0) > 0 ? (
                                  <>
                                    <option value="">Select</option>
                                    {batchesBySkuId[newLineDraft.skuId].map(batch => (
                                      <option key={batch.batchCode} value={batch.batchCode}>
                                        {batch.batchCode}
                                      </option>
                                    ))}
                                  </>
                                ) : (
                                  <option value="">No batches</option>
                                )}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-sm">
                              {selectedSku?.description ? (
                                <span className="truncate max-w-[180px] block">{selectedSku.description}</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={newLineDraft.unitsOrdered}
                                onChange={e => {
                                  const parsed = Number.parseInt(e.target.value, 10)
                                  setNewLineDraft(prev => ({
                                    ...prev,
                                    unitsOrdered: Number.isFinite(parsed) ? parsed : 0,
                                  }))
                                }}
                                disabled={addLineSubmitting}
                                className="h-7 w-20 px-2 py-0 text-xs text-right"
                              />
                            </td>
                            <td className="px-3 py-2">
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
                                disabled={!newLineDraft.skuId || !newLineDraft.batchLot || addLineSubmitting}
                                placeholder="—"
                                className="h-7 w-20 px-2 py-0 text-xs text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                              {(() => {
                                if (!newLineDraft.unitsPerCarton) return '—'
                                if (newLineDraft.unitsOrdered <= 0) return '—'
                                return Math.ceil(newLineDraft.unitsOrdered / newLineDraft.unitsPerCarton).toLocaleString()
                              })()}
                            </td>
                            {canEditDispatchAllocation && <td className="px-3 py-2">—</td>}
                            <td className="px-3 py-2">—</td>
                            <td className="px-3 py-2">
                              <Input
                                value={newLineDraft.notes}
                                onChange={e =>
                                  setNewLineDraft(prev => ({ ...prev, notes: e.target.value }))
                                }
                                placeholder="Notes"
                                disabled={addLineSubmitting}
                                className="h-7 w-24 px-2 py-0 text-xs"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                            <td className="px-2 py-2 whitespace-nowrap text-right">
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
                                className="h-7 gap-1"
                              >
                                {addLineSubmitting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5" />
                                )}
                                Add
                              </Button>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Attributes Sub-tab */}
                {cargoSubTab === 'attributes' && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <table className="w-full text-sm min-w-[1100px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">SKU</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">Batch</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Commodity Code</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Country</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units/Ctn</th>
                          <th className="text-center font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Carton Size ({lengthUnit})</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Net ({weightUnit})</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Gross ({weightUnit})</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Material</th>
                        </tr>
                      </thead>
                      <tbody>
                        {flowLines.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                              No lines added to this order yet.
                            </td>
                          </tr>
                        ) : (
                          flowLines.map(line => {
                            const canEditAttributes =
                              !isReadOnly &&
                              order.status === activeViewStage &&
                              (order.status === 'DRAFT' || order.status === 'ISSUED')

                            const issuePrefix = `cargo.lines.${line.id}`
                            const issue = (suffix: string): string | null => {
                              const key = `${issuePrefix}.${suffix}`
                              return gateIssues ? gateIssues[key] ?? null : null
                            }

                            const cartonDimsIssue = gateIssues ? gateIssues[`${issuePrefix}.cartonDimensions`] ?? null : null

                            const cartonTriplet = resolveDimensionTripletCm({
                              side1Cm: line.cartonSide1Cm ?? null,
                              side2Cm: line.cartonSide2Cm ?? null,
                              side3Cm: line.cartonSide3Cm ?? null,
                              legacy: line.cartonDimensionsCm ?? null,
                            })

                            return (
                              <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {(cargoLineIssueCountById[line.id] ?? 0) > 0 && (
                                      <span className="text-xs font-semibold text-rose-600">!</span>
                                    )}
                                    <span>{line.skuCode}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{line.batchLot ? line.batchLot : '—'}</td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <Input
                                      defaultValue={line.commodityCode ?? ''}
                                      data-gate-key={`${issuePrefix}.commodityCode`}
                                      onBlur={e => {
                                        const trimmed = e.target.value.trim()
                                        void patchOrderLine(line.id, { commodityCode: trimmed.length > 0 ? trimmed : null })
                                      }}
                                      className={`h-7 w-28 px-2 py-0 text-xs ${issue('commodityCode') ? 'border-rose-500' : ''}`}
                                    />
                                  ) : (
                                    <span className="text-foreground" data-gate-key={`${issuePrefix}.commodityCode`}>
                                      {line.commodityCode ? line.commodityCode : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2" data-gate-key={`${issuePrefix}.countryOfOrigin`}>
                                  {(() => {
                                    const countryIssue = issue('countryOfOrigin')
                                    return (
                                      <div className="space-y-1">
                                        <span className={countryIssue ? 'text-rose-600' : 'text-foreground'}>
                                          {supplierCountry ? supplierCountry : '—'}
                                        </span>
                                        {countryIssue && <p className="text-xs text-rose-600">{countryIssue}</p>}
                                      </div>
                                    )
                                  })()}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <div className="flex justify-end">
                                      <Input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        step="1"
                                        defaultValue={String(line.unitsPerCarton)}
                                        data-gate-key={`${issuePrefix}.unitsPerCarton`}
                                        onBlur={e => {
                                          const trimmed = e.target.value.trim()
                                          if (!trimmed) return
                                          const parsed = Number.parseInt(trimmed, 10)
                                          if (!Number.isInteger(parsed) || parsed <= 0) {
                                            toast.error('Units per carton must be a positive integer')
                                            return
                                          }
                                          void patchOrderLine(line.id, { unitsPerCarton: parsed })
                                        }}
                                        className={`h-7 w-16 px-2 py-0 text-xs text-right ${issue('unitsPerCarton') ? 'border-rose-500' : ''}`}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-foreground tabular-nums block text-right" data-gate-key={`${issuePrefix}.unitsPerCarton`}>
                                      {line.unitsPerCarton.toLocaleString()}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <div className="flex gap-1 justify-center">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder="L"
                                        defaultValue={line.cartonSide1Cm != null ? formatLengthFromCm(line.cartonSide1Cm, unitSystem) : ''}
                                        data-gate-key={`${issuePrefix}.cartonDimensions`}
                                        data-carton-side-line={line.id}
                                        data-carton-side-axis="1"
                                        onBlur={() => maybePatchCartonDimensions(line.id)}
                                        className={`h-7 w-14 px-1 py-0 text-xs text-center ${cartonDimsIssue ? 'border-rose-500' : ''}`}
                                      />
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder="W"
                                        defaultValue={line.cartonSide2Cm != null ? formatLengthFromCm(line.cartonSide2Cm, unitSystem) : ''}
                                        data-carton-side-line={line.id}
                                        data-carton-side-axis="2"
                                        onBlur={() => maybePatchCartonDimensions(line.id)}
                                        className={`h-7 w-14 px-1 py-0 text-xs text-center ${cartonDimsIssue ? 'border-rose-500' : ''}`}
                                      />
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        placeholder="H"
                                        defaultValue={line.cartonSide3Cm != null ? formatLengthFromCm(line.cartonSide3Cm, unitSystem) : ''}
                                        data-carton-side-line={line.id}
                                        data-carton-side-axis="3"
                                        onBlur={() => maybePatchCartonDimensions(line.id)}
                                        className={`h-7 w-14 px-1 py-0 text-xs text-center ${cartonDimsIssue ? 'border-rose-500' : ''}`}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-foreground" data-gate-key={`${issuePrefix}.cartonDimensions`}>
                                      {cartonTriplet ? `${formatLengthFromCm(cartonTriplet.side1Cm, unitSystem)}x${formatLengthFromCm(cartonTriplet.side2Cm, unitSystem)}x${formatLengthFromCm(cartonTriplet.side3Cm, unitSystem)}` : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <div className="flex justify-end">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.001"
                                        defaultValue={line.netWeightKg != null ? formatWeightFromKg(line.netWeightKg, unitSystem) : ''}
                                        data-gate-key={`${issuePrefix}.netWeightKg`}
                                        onBlur={e => {
                                          const trimmed = e.target.value.trim()
                                          if (!trimmed) {
                                            void patchOrderLine(line.id, { netWeightKg: null })
                                            return
                                          }
                                          const parsed = Number(trimmed)
                                          if (!Number.isFinite(parsed) || parsed <= 0) {
                                            toast.error('Net weight must be a positive number')
                                            return
                                          }
                                          void patchOrderLine(line.id, { netWeightKg: convertWeightToKg(parsed, unitSystem) })
                                        }}
                                        className={`h-7 w-20 px-2 py-0 text-xs text-right ${issue('netWeightKg') ? 'border-rose-500' : ''}`}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-foreground tabular-nums block text-right" data-gate-key={`${issuePrefix}.netWeightKg`}>
                                      {line.netWeightKg != null ? formatWeightFromKg(line.netWeightKg, unitSystem) : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <div className="flex justify-end">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.001"
                                        defaultValue={line.cartonWeightKg != null ? formatWeightFromKg(line.cartonWeightKg, unitSystem) : ''}
                                        data-gate-key={`${issuePrefix}.cartonWeightKg`}
                                        onBlur={e => {
                                          const trimmed = e.target.value.trim()
                                          if (!trimmed) {
                                            void patchOrderLine(line.id, { cartonWeightKg: null })
                                            return
                                          }
                                          const parsed = Number(trimmed)
                                          if (!Number.isFinite(parsed) || parsed <= 0) {
                                            toast.error('Gross weight must be a positive number')
                                            return
                                          }
                                          void patchOrderLine(line.id, { cartonWeightKg: convertWeightToKg(parsed, unitSystem) })
                                        }}
                                        className={`h-7 w-20 px-2 py-0 text-xs text-right ${issue('cartonWeightKg') ? 'border-rose-500' : ''}`}
                                      />
                                    </div>
                                  ) : (
                                    <span className="text-foreground tabular-nums block text-right" data-gate-key={`${issuePrefix}.cartonWeightKg`}>
                                      {line.cartonWeightKg != null ? formatWeightFromKg(line.cartonWeightKg, unitSystem) : '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {canEditAttributes ? (
                                    <Input
                                      defaultValue={line.material ?? ''}
                                      data-gate-key={`${issuePrefix}.material`}
                                      onBlur={e => {
                                        const trimmed = e.target.value.trim()
                                        void patchOrderLine(line.id, { material: trimmed.length > 0 ? trimmed : null })
                                      }}
                                      className={`h-7 w-24 px-2 py-0 text-xs ${issue('material') ? 'border-rose-500' : ''}`}
                                    />
                                  ) : (
                                    <span className="text-foreground" data-gate-key={`${issuePrefix}.material`}>
                                      {line.material ? line.material : '—'}
                                    </span>
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

                {cargoSubTab === 'receiving' && activeViewStage === 'WAREHOUSE' && (
                  <div className="p-4">
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">
                              SKU
                            </th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">
                              Batch
                            </th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                              Ordered (ctns)
                            </th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                              Received (ctns)
                            </th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                              Delta
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {flowLines.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                                No lines added to this order yet.
                              </td>
                            </tr>
                          ) : (
                            flowLines.map(line => {
                              const gateKey = `cargo.lines.${line.id}.quantityReceived`
                              const issue = gateIssues ? gateIssues[gateKey] ?? null : null
                              const canEditReceiving =
                                !isReadOnly && order.status === 'WAREHOUSE' && activeViewStage === 'WAREHOUSE'

                              const received = line.quantityReceived ?? null
                              const delta = received !== null ? received - line.quantity : null

                              return (
                                <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap min-w-[100px]">
                                    {line.skuCode}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap min-w-[100px]">
                                    {line.batchLot ? line.batchLot : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                    {line.quantity.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" data-gate-key={gateKey}>
                                    {canEditReceiving ? (
                                      <div className="flex flex-col items-end gap-1">
                                        <Input
                                          type="number"
                                          inputMode="numeric"
                                          min="0"
                                          step="1"
                                          defaultValue={received !== null ? String(received) : ''}
                                          data-gate-key={gateKey}
                                          onBlur={e => {
                                            const trimmed = e.target.value.trim()
                                            if (!trimmed) {
                                              void patchOrderLine(line.id, { quantityReceived: null })
                                              return
                                            }
                                            const parsed = Number.parseInt(trimmed, 10)
                                            if (!Number.isInteger(parsed) || parsed < 0) {
                                              toast.error('Received cartons must be a non-negative integer')
                                              return
                                            }
                                            void patchOrderLine(line.id, { quantityReceived: parsed })
                                          }}
                                          className={cn(
                                            'h-7 w-20 px-2 py-0 text-xs text-right',
                                            issue && 'border-rose-500 focus-visible:ring-rose-500'
                                          )}
                                        />
                                        {issue && <p className="text-xs text-rose-600">{issue}</p>}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {received !== null ? received.toLocaleString() : '—'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                    {delta !== null ? (
                                      <span className={delta === 0 ? 'text-muted-foreground' : 'text-amber-600'}>
                                        {delta.toLocaleString()}
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
                  </div>
                )}
              </div>
            ) : (
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
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Weight ({weightUnit})
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Total Volume (CBM)
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">—</p>
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
                    {cargoSubTabIssues.details && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
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
                    {cargoSubTabIssues.attributes && (
                      <span className="ml-1 text-xs font-semibold text-rose-600">!</span>
                    )}
                  </button>
                </div>

                {/* Details Sub-tab */}
                {cargoSubTab === 'details' && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto" data-gate-key="cargo.lines">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">
                            SKU
                          </th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">
                            Batch
                          </th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Description
                          </th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Units
                          </th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Units/Ctn
                          </th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Cartons
                          </th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            PI #
                          </th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Notes
                          </th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">
                            Received
                          </th>
                          {canEdit && <th className="w-[60px]"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {draftLines.length === 0 ? (
                          <tr>
                            <td
                              colSpan={canEdit ? 10 : 9}
                              className="px-3 py-6 text-center text-muted-foreground"
                            >
                              No lines added to this order yet.
                            </td>
                          </tr>
                        ) : (
                          draftLines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50"
                            >
                              <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap min-w-[100px]">
                                <div className="flex items-center gap-2">
                                  {(cargoLineIssueCountById[line.id] ?? 0) > 0 && (
                                    <span className="text-xs font-semibold text-rose-600">!</span>
                                  )}
                                  <span>{line.skuCode}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap min-w-[100px]">
                                {line.batchLot ? line.batchLot : '—'}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap max-w-[180px] truncate">
                                {line.skuDescription ? line.skuDescription : '—'}
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
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap min-w-[140px]">
                                <Input
                                  value={line.piNumber ?? ''}
                                  placeholder="PI-..."
                                  data-gate-key={`cargo.lines.${line.id}.piNumber`}
                                  onChange={e => {
                                    const value = e.target.value
                                    setDraftLines(prev =>
                                      prev.map(candidate =>
                                        candidate.id === line.id
                                          ? { ...candidate, piNumber: value.trim() ? value : null }
                                          : candidate
                                      )
                                    )
                                  }}
                                />
                                {gateIssues?.[`cargo.lines.${line.id}.piNumber`] && (
                                  <p
                                    className="mt-1 text-xs text-rose-600"
                                    data-gate-key={`cargo.lines.${line.id}.piNumber`}
                                  >
                                    {gateIssues[`cargo.lines.${line.id}.piNumber`]}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">
                                {line.lineNotes ? line.lineNotes : '—'}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                {(line.quantityReceived ?? line.postedQuantity).toLocaleString()}
                              </td>
                              {canEdit && (
                                <td className="px-2 py-2 whitespace-nowrap text-right">
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
                                        message: `Remove SKU ${line.skuCode} (${line.batchLot ? line.batchLot : '—'}) from this draft RFQ?`,
                                        lineId: line.id,
                                      })
                                    }
                                    title="Remove line"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))
                        )}
                        {/* Inline Add Row for Create Mode */}
                        <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/30">
                          <td className="px-3 py-2 min-w-[100px]">
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
                                  notes: '',
                                }))
                                void ensureSkuBatchesLoaded(skuId)
                              }}
                              disabled={skusLoading || addLineSubmitting}
                              className="w-full h-7 px-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
                            >
                              <option value="">Select SKU</option>
                              {skus.map(sku => (
                                <option key={sku.id} value={sku.id}>
                                  {sku.skuCode}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 min-w-[100px]">
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
                              className="w-full h-7 px-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs disabled:opacity-50"
                            >
                              {!newLineDraft.skuId ? (
                                <option value="">—</option>
                              ) : batchesLoadingBySkuId[newLineDraft.skuId] ? (
                                <option value="">Loading…</option>
                              ) : (batchesBySkuId[newLineDraft.skuId]?.length ?? 0) > 0 ? (
                                <>
                                  <option value="">Select</option>
                                  {batchesBySkuId[newLineDraft.skuId].map(batch => (
                                    <option key={batch.batchCode} value={batch.batchCode}>
                                      {batch.batchCode}
                                    </option>
                                  ))}
                                </>
                              ) : (
                                <option value="">No batches</option>
                              )}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-sm">
                            {selectedSku?.description ? (
                              <span className="truncate max-w-[180px] block">{selectedSku.description}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              inputMode="numeric"
                              min="1"
                              step="1"
                              value={newLineDraft.unitsOrdered}
                              onChange={e => {
                                const parsed = Number.parseInt(e.target.value, 10)
                                setNewLineDraft(prev => ({
                                  ...prev,
                                  unitsOrdered: Number.isFinite(parsed) ? parsed : 0,
                                }))
                              }}
                              disabled={addLineSubmitting}
                              className="h-7 w-20 px-2 py-0 text-xs text-right"
                            />
                          </td>
                          <td className="px-3 py-2">
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
                              disabled={!newLineDraft.skuId || !newLineDraft.batchLot || addLineSubmitting}
                              placeholder="—"
                              className="h-7 w-20 px-2 py-0 text-xs text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                            {(() => {
                              if (!newLineDraft.unitsPerCarton) return '—'
                              if (newLineDraft.unitsOrdered <= 0) return '—'
                              return Math.ceil(newLineDraft.unitsOrdered / newLineDraft.unitsPerCarton).toLocaleString()
                            })()}
                          </td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2">
                            <Input
                              value={newLineDraft.notes}
                              onChange={e =>
                                setNewLineDraft(prev => ({ ...prev, notes: e.target.value }))
                              }
                              placeholder="Notes"
                              disabled={addLineSubmitting}
                              className="h-7 w-24 px-2 py-0 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          <td className="px-2 py-2 whitespace-nowrap text-right">
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
                              className="h-7 gap-1"
                            >
                              {addLineSubmitting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Add
                            </Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Attributes Sub-tab */}
                {cargoSubTab === 'attributes' && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <table className="w-full text-sm min-w-[1100px]">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">SKU</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs min-w-[100px]">Batch</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Commodity Code</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Country</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units/Ctn</th>
                          <th className="text-center font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Carton Size ({lengthUnit})</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Net ({weightUnit})</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Gross ({weightUnit})</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Material</th>
                        </tr>
                      </thead>
                      <tbody>
                        {draftLines.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                              No lines added to this order yet.
                            </td>
                          </tr>
                        ) : (
                          draftLines.map(line => {
                            const issuePrefix = `cargo.lines.${line.id}`

                            const updateLine = (updater: (current: PurchaseOrderLineSummary) => PurchaseOrderLineSummary) => {
                              setDraftLines(prev =>
                                prev.map(candidate => (candidate.id === line.id ? updater(candidate) : candidate))
                              )
                            }

                            return (
                              <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    {(cargoLineIssueCountById[line.id] ?? 0) > 0 && (
                                      <span className="text-xs font-semibold text-rose-600">!</span>
                                    )}
                                    <span>{line.skuCode}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{line.batchLot ? line.batchLot : '—'}</td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={line.commodityCode ?? ''}
                                    data-gate-key={`${issuePrefix}.commodityCode`}
                                    onChange={e => {
                                      const value = e.target.value
                                      updateLine(current => ({ ...current, commodityCode: value.trim() ? value : null }))
                                    }}
                                    className="h-7 w-28 px-2 py-0 text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2" data-gate-key={`${issuePrefix}.countryOfOrigin`}>
                                  <span className="text-foreground">{supplierCountry ? supplierCountry : '—'}</span>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <Input
                                      type="number"
                                      inputMode="numeric"
                                      min="1"
                                      step="1"
                                      value={String(line.unitsPerCarton)}
                                      data-gate-key={`${issuePrefix}.unitsPerCarton`}
                                      onChange={e => {
                                        const parsed = Number.parseInt(e.target.value, 10)
                                        if (!Number.isInteger(parsed) || parsed <= 0) return
                                        updateLine(current => ({
                                          ...current,
                                          unitsPerCarton: parsed,
                                          quantity: Math.ceil(current.unitsOrdered / parsed),
                                        }))
                                      }}
                                      className="h-7 w-16 px-2 py-0 text-xs text-right"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex gap-1 justify-center">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="L"
                                      value={line.cartonSide1Cm != null ? formatLengthFromCm(line.cartonSide1Cm, unitSystem) : ''}
                                      data-gate-key={`${issuePrefix}.cartonDimensions`}
                                      onChange={e => {
                                        const parsed = Number(e.target.value)
                                        const nextInput = Number.isFinite(parsed) && parsed > 0 ? parsed : null
                                        const next = nextInput === null ? null : convertLengthToCm(nextInput, unitSystem)
                                        updateLine(current => {
                                          const triplet = resolveDimensionTripletCm({
                                            side1Cm: next,
                                            side2Cm: current.cartonSide2Cm ?? null,
                                            side3Cm: current.cartonSide3Cm ?? null,
                                            legacy: current.cartonDimensionsCm ?? null,
                                          })
                                          return {
                                            ...current,
                                            cartonSide1Cm: next,
                                            cartonDimensionsCm: triplet ? formatDimensionTripletCm(triplet) : current.cartonDimensionsCm ?? null,
                                          }
                                        })
                                      }}
                                      className="h-7 w-14 px-1 py-0 text-xs text-center"
                                    />
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="W"
                                      value={line.cartonSide2Cm != null ? formatLengthFromCm(line.cartonSide2Cm, unitSystem) : ''}
                                      onChange={e => {
                                        const parsed = Number(e.target.value)
                                        const nextInput = Number.isFinite(parsed) && parsed > 0 ? parsed : null
                                        const next = nextInput === null ? null : convertLengthToCm(nextInput, unitSystem)
                                        updateLine(current => {
                                          const triplet = resolveDimensionTripletCm({
                                            side1Cm: current.cartonSide1Cm ?? null,
                                            side2Cm: next,
                                            side3Cm: current.cartonSide3Cm ?? null,
                                            legacy: current.cartonDimensionsCm ?? null,
                                          })
                                          return {
                                            ...current,
                                            cartonSide2Cm: next,
                                            cartonDimensionsCm: triplet ? formatDimensionTripletCm(triplet) : current.cartonDimensionsCm ?? null,
                                          }
                                        })
                                      }}
                                      className="h-7 w-14 px-1 py-0 text-xs text-center"
                                    />
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.01"
                                      placeholder="H"
                                      value={line.cartonSide3Cm != null ? formatLengthFromCm(line.cartonSide3Cm, unitSystem) : ''}
                                      onChange={e => {
                                        const parsed = Number(e.target.value)
                                        const nextInput = Number.isFinite(parsed) && parsed > 0 ? parsed : null
                                        const next = nextInput === null ? null : convertLengthToCm(nextInput, unitSystem)
                                        updateLine(current => {
                                          const triplet = resolveDimensionTripletCm({
                                            side1Cm: current.cartonSide1Cm ?? null,
                                            side2Cm: current.cartonSide2Cm ?? null,
                                            side3Cm: next,
                                            legacy: current.cartonDimensionsCm ?? null,
                                          })
                                          return {
                                            ...current,
                                            cartonSide3Cm: next,
                                            cartonDimensionsCm: triplet ? formatDimensionTripletCm(triplet) : current.cartonDimensionsCm ?? null,
                                          }
                                        })
                                      }}
                                      className="h-7 w-14 px-1 py-0 text-xs text-center"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.001"
                                      value={line.netWeightKg != null ? formatWeightFromKg(line.netWeightKg, unitSystem) : ''}
                                      data-gate-key={`${issuePrefix}.netWeightKg`}
                                      onChange={e => {
                                        const parsed = Number(e.target.value)
                                        const nextInput = Number.isFinite(parsed) && parsed > 0 ? parsed : null
                                        updateLine(current => ({
                                          ...current,
                                          netWeightKg: nextInput === null ? null : convertWeightToKg(nextInput, unitSystem),
                                        }))
                                      }}
                                      className="h-7 w-20 px-2 py-0 text-xs text-right"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.001"
                                      value={line.cartonWeightKg != null ? formatWeightFromKg(line.cartonWeightKg, unitSystem) : ''}
                                      data-gate-key={`${issuePrefix}.cartonWeightKg`}
                                      onChange={e => {
                                        const parsed = Number(e.target.value)
                                        const nextInput = Number.isFinite(parsed) && parsed > 0 ? parsed : null
                                        updateLine(current => ({
                                          ...current,
                                          cartonWeightKg: nextInput === null ? null : convertWeightToKg(nextInput, unitSystem),
                                        }))
                                      }}
                                      className="h-7 w-20 px-2 py-0 text-xs text-right"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={line.material ?? ''}
                                    data-gate-key={`${issuePrefix}.material`}
                                    onChange={e => {
                                      const value = e.target.value
                                      updateLine(current => ({ ...current, material: value.trim() ? value : null }))
                                    }}
                                    className="h-7 w-24 px-2 py-0 text-xs"
                                  />
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
              </>
            )}

            {activeBottomTab === 'documents' && (
              <>
                {!isCreate && order && (
                  <div className="p-6 border-b">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Outputs
                      </h4>
                    </div>

                    {(() => {
                      const items: Array<{
                        id: 'rfqPdf' | 'poPdf' | 'shippingMarks'
                        label: string
                        meta: PurchaseOrderOutputMeta
                        canDownload: boolean
                        onDownload: () => void
                      }> = []

                      if (activeViewStage === 'DRAFT') {
                        items.push({
                          id: 'rfqPdf',
                          label: 'RFQ PDF',
                          meta: order.outputs.rfqPdf,
                          canDownload: order.status === 'DRAFT',
                          onDownload: () => void handleDownloadPdf(),
                        })
                      }

                      if (activeViewStage === 'ISSUED') {
                        items.push({
                          id: 'poPdf',
                          label: 'PO PDF',
                          meta: order.outputs.poPdf,
                          canDownload: order.status !== 'DRAFT',
                          onDownload: () => void handleDownloadPdf(),
                        })
                        items.push({
                          id: 'shippingMarks',
                          label: 'Shipping Marks',
                          meta: order.outputs.shippingMarks,
                          canDownload: order.status !== 'DRAFT',
                          onDownload: () => void handleDownloadShippingMarks(),
                        })
                      }

                      if (items.length === 0) {
                        return (
                          <p className="text-sm text-muted-foreground">
                            No outputs are generated in this stage.
                          </p>
                        )
                      }

                      return (
                        <div className="space-y-2">
                          {items.map(item => {
                            const meta = item.meta
                            const generatedSummary = meta.generatedAt
                              ? `Generated ${formatDate(meta.generatedAt)}${meta.generatedByName ? ` by ${meta.generatedByName}` : ''}`
                              : 'Not generated yet'

                            return (
                              <div
                                key={item.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 dark:bg-slate-700 px-3 py-2.5"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                                  <p className="text-xs text-muted-foreground">{generatedSummary}</p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {meta.outOfDate && (
                                    <Badge variant="warning" className="uppercase tracking-wide text-[10px]">
                                      Out of date
                                    </Badge>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={item.onDownload}
                                    disabled={!item.canDownload}
                                    className="gap-2"
                                  >
                                    <Download className="h-4 w-4" />
                                    Download
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Stage requirements & documents */}
                <div className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Stage Documents
                </h4>
                {documentsLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
              </div>

              {isCreate ? (
                <p className="text-sm text-muted-foreground">
                  Create the RFQ to upload stage documents.
                </p>
              ) : (
                (() => {
                  if (!order) return null
                  const stage = activeViewStage as PurchaseOrderDocumentStage
                  const stageKey = stage as keyof typeof STAGE_DOCUMENTS
                  const canUpload = order.status === stage && !isReadOnly
                  const stageDocs = documents.filter(doc => doc.stage === stage)
                  const docsByType = new Map(stageDocs.map(doc => [doc.documentType, doc]))
                  const issuedPiNumbers =
                    stage === 'ISSUED'
                      ? Array.from(
                          new Set(
                            flowLines
                              .map(line => (typeof line.piNumber === 'string' ? line.piNumber.trim() : ''))
                              .filter(value => value.length > 0)
                          )
                        )
                      : []

                  const rows = (() => {
                    if (stage === 'ISSUED') {
                      const requiredPiDocs = issuedPiNumbers
                        .map(pi => ({ piNumber: pi, docType: buildPiDocumentType(pi) }))
                        .filter(entry => entry.docType.length > 0)
                        .map(entry => ({
                          id: entry.docType,
                          label: entry.piNumber,
                          required: true,
                          doc: docsByType.get(entry.docType),
                          gateKey: `documents.pi.${entry.docType}`,
                        }))

                      const requiredDocTypes = new Set(requiredPiDocs.map(doc => doc.id))
                      const otherDocs = stageDocs.filter(doc => !requiredDocTypes.has(doc.documentType))
                      return [
                        ...requiredPiDocs,
                        ...otherDocs.map(doc => ({
                          id: doc.documentType,
                          label: getDocumentLabel(stage, doc.documentType),
                          required: false,
                          doc,
                          gateKey: `documents.${doc.documentType}`,
                        })),
                      ]
                    }

                    const requiredDocs = stage === 'SHIPPED' ? [] : (STAGE_DOCUMENTS[stageKey] ?? [])
                    const requiredIds = new Set(requiredDocs.map(doc => doc.id))
                    const otherDocs = stageDocs.filter(doc => !requiredIds.has(doc.documentType))

                    return [
                      ...requiredDocs.map(doc => ({
                        id: doc.id,
                        label: doc.label,
                        required: true,
                        doc: docsByType.get(doc.id),
                        gateKey: `documents.${doc.id}`,
                      })),
                      ...otherDocs.map(doc => ({
                        id: doc.documentType,
                        label: getDocumentLabel(stage, doc.documentType),
                        required: false,
                        doc,
                        gateKey: `documents.${doc.documentType}`,
                      })),
                    ]
                  })()

                  if (rows.length === 0) {
                    if (stage === 'ISSUED' && issuedPiNumbers.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground">
                          Add PI numbers to Cargo lines to unlock PI document uploads.
                        </p>
                      )
                    }

                    return (
                      <p className="text-sm text-muted-foreground">
                        No documents have been uploaded for this stage.
                      </p>
                    )
                  }

                  return (
                    <div className="space-y-3">
                      {rows.map(row => {
                        const key = `${stage}::${row.id}`
                        const existing = row.doc
                        const isUploading = Boolean(uploadingDoc[key])
                        const gateKey = 'gateKey' in row ? (row.gateKey as string) : null
                        const gateMessage = gateKey && gateIssues ? gateIssues[gateKey] : null
                        const icon = existing ? (
                          <Check className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                        ) : row.required ? (
                          <XCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        )

                        return (
                          <div
                            key={key}
                            data-gate-key={gateKey ?? undefined}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 dark:bg-slate-700 px-3 py-2.5"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {icon}
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {row.label}
                                </span>
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
                                  <span className="block text-xs text-muted-foreground">
                                    Not uploaded yet
                                  </span>
                                )}
                                {gateMessage && (
                                  <p className="mt-1 text-xs text-rose-600">{gateMessage}</p>
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
                              <label
                                className={`inline-flex items-center gap-2 rounded-md border bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors ${
                                  canUpload
                                    ? 'hover:bg-slate-100 cursor-pointer'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                              >
                                <Upload className="h-3.5 w-3.5" />
                                {existing ? 'Replace' : 'Upload'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={isUploading || !canUpload}
                                  onChange={e => void handleDocumentUpload(e, stage, row.id)}
                                />
                                {isUploading && (
                                  <span className="text-xs text-muted-foreground ml-1">…</span>
                                )}
                              </label>
                            </div>
                          </div>
                        )
                      })}

                      {inlinePreviewDocument && inlineStageMeta && (
                        <div className="rounded-lg border bg-slate-50 dark:bg-slate-700 overflow-hidden">
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
                                    • Uploaded {formatDate(inlinePreviewDocument.uploadedAt)}
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
                  )
                })()
              )}
                </div>

                {false && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Stage</th>
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Document Type</th>
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">File</th>
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Uploaded</th>
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Status</th>
                      <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-right">Actions</th>
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
                          <tr key={key} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {row.stageLabel}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                              {row.label}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap max-w-[200px]">
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
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {existing ? formatDateOnly(existing.uploadedAt) : '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
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
                            <td className="px-3 py-2 whitespace-nowrap text-right">
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
              </>
            )}

            {activeBottomTab === 'costs' && (
              <>
                {isCreate && (
                  <div className="p-6">
                    {draftLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Add cargo lines to enter targeted costs.</p>
                    ) : (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">SKU</th>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Batch</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Unit Cost</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Target Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draftLines.map(line => {
                              const totalCost = line.totalCost !== null ? line.totalCost : null
                              const unitCost = totalCost !== null && line.unitsOrdered > 0 ? totalCost / line.unitsOrdered : null
                              const gateKey = `costs.lines.${line.id}.totalCost`
                              const issue = gateIssues ? gateIssues[gateKey] ?? null : null

                              return (
                                <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{line.skuCode}</td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {line.batchLot ? line.batchLot : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                    {line.unitsOrdered.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min="0"
                                      step="0.0001"
                                      value={unitCost !== null ? String(unitCost) : ''}
                                      placeholder="0.00"
                                      onChange={e => {
                                        const raw = e.target.value.trim()
                                        if (!raw) {
                                          setDraftLines(prev =>
                                            prev.map(candidate =>
                                              candidate.id === line.id
                                                ? { ...candidate, totalCost: null, unitCost: null }
                                                : candidate
                                            )
                                          )
                                          return
                                        }

                                        const parsed = Number(raw)
                                        if (!Number.isFinite(parsed) || parsed < 0) return

                                        setDraftLines(prev =>
                                          prev.map(candidate => {
                                            if (candidate.id !== line.id) return candidate
                                            const nextTotalCost = parsed * candidate.unitsOrdered
                                            return {
                                              ...candidate,
                                              unitCost: parsed,
                                              totalCost: Number(nextTotalCost.toFixed(2)),
                                            }
                                          })
                                        )
                                      }}
                                      className="h-7 px-2 py-0 text-xs text-right w-24"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap" data-gate-key={gateKey}>
                                    <div className="flex flex-col items-end gap-1">
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        value={totalCost !== null ? String(totalCost) : ''}
                                        placeholder="0.00"
                                        data-gate-key={gateKey}
                                        onChange={e => {
                                          const raw = e.target.value.trim()
                                          if (!raw) {
                                            setDraftLines(prev =>
                                              prev.map(candidate =>
                                                candidate.id === line.id
                                                  ? { ...candidate, totalCost: null, unitCost: null }
                                                  : candidate
                                              )
                                            )
                                            return
                                          }

                                          const parsed = Number(raw)
                                          if (!Number.isFinite(parsed) || parsed < 0) return

                                          setDraftLines(prev =>
                                            prev.map(candidate => {
                                              if (candidate.id !== line.id) return candidate
                                              const nextUnitCost =
                                                candidate.unitsOrdered > 0 ? parsed / candidate.unitsOrdered : null
                                              return {
                                                ...candidate,
                                                totalCost: parsed,
                                                unitCost: nextUnitCost !== null ? Number(nextUnitCost.toFixed(4)) : null,
                                              }
                                            })
                                          )
                                        }}
                                        className={cn(
                                          'h-7 px-2 py-0 text-xs text-right w-28',
                                          issue && 'border-rose-500 focus-visible:ring-rose-500'
                                        )}
                                      />
                                      {issue && <p className="text-xs text-rose-600">{issue}</p>}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50">
                              <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
                                Product Subtotal
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                {tenantCurrency}{' '}
                                {draftLines
                                  .reduce((sum, line) => sum + (line.totalCost !== null ? line.totalCost : 0), 0)
                                  .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {!isCreate && order && (
                  <div className="p-6">
                    {flowLines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No lines added to this order yet.</p>
                    ) : (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">SKU</th>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Batch</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Units</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Unit Cost</th>
                              <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {flowLines.map(line => {
                              const canEditProductCosts =
                                canEdit && order.status === 'DRAFT' && activeViewStage === 'DRAFT'

                              const totalCost = line.totalCost !== null ? line.totalCost : null
                              const unitCost =
                                totalCost !== null && line.unitsOrdered > 0 ? totalCost / line.unitsOrdered : null
                              const currencyLabel =
                                typeof line.currency === 'string' && line.currency.trim().length > 0
                                  ? line.currency.trim().toUpperCase()
                                  : tenantCurrency

                              const gateKey = `costs.lines.${line.id}.totalCost`
                              const issue = gateIssues ? gateIssues[gateKey] ?? null : null

                              return (
                                <tr key={line.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{line.skuCode}</td>
                                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                    {line.batchLot ? line.batchLot : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-foreground whitespace-nowrap">
                                    {line.unitsOrdered.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                                    {canEditProductCosts ? (
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.0001"
                                        defaultValue={unitCost !== null ? String(unitCost) : ''}
                                        placeholder="0.00"
                                        onBlur={e => {
                                          const trimmed = e.target.value.trim()
                                          if (!trimmed) {
                                            void patchOrderLine(line.id, { totalCost: null })
                                            return
                                          }

                                          const parsed = Number(trimmed)
                                          if (!Number.isFinite(parsed) || parsed < 0) {
                                            toast.error('Unit cost must be a positive number')
                                            return
                                          }
                                          const nextTotalCost = parsed * line.unitsOrdered
                                          void patchOrderLine(line.id, { totalCost: Number(nextTotalCost.toFixed(2)) })
                                        }}
                                        className="text-right w-24"
                                      />
                                    ) : (
                                      <span>{unitCost !== null ? `${currencyLabel} ${unitCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap" data-gate-key={gateKey}>
                                    {canEditProductCosts ? (
                                      <div className="flex flex-col items-end gap-1">
                                        <Input
                                          type="number"
                                          inputMode="decimal"
                                          min="0"
                                          step="0.01"
                                          defaultValue={totalCost !== null ? String(totalCost) : ''}
                                          placeholder="0.00"
                                          data-gate-key={gateKey}
                                          onBlur={e => {
                                            const trimmed = e.target.value.trim()
                                            if (!trimmed) {
                                              void patchOrderLine(line.id, { totalCost: null })
                                              return
                                            }

                                            const parsed = Number(trimmed)
                                            if (!Number.isFinite(parsed) || parsed < 0) {
                                              toast.error('Total cost must be a positive number')
                                              return
                                            }
                                            void patchOrderLine(line.id, { totalCost: parsed })
                                          }}
                                          className={
                                            issue ? 'border-rose-500 focus-visible:ring-rose-500 text-right w-28' : 'text-right w-28'
                                          }
                                        />
                                        {issue && <p className="text-xs text-rose-600">{issue}</p>}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {totalCost !== null
                                          ? `${currencyLabel} ${totalCost.toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}`
                                          : '—'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50">
                              <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
                                Product Subtotal
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                {tenantCurrency}{' '}
                                {flowLines
                                  .reduce((sum, line) => sum + (line.totalCost !== null ? line.totalCost : 0), 0)
                                  .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {!isCreate &&
                  order &&
                  (activeViewStage === 'OCEAN' || activeViewStage === 'WAREHOUSE') && (
              <div className="p-6 pt-0">

                {/* Cargo Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700" data-gate-key="costs.forwarding">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Cargo Costs
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {forwardingCosts.length} item{forwardingCosts.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {gateIssues?.['costs.forwarding'] && (
                    <p className="text-xs text-rose-600 mb-3" data-gate-key="costs.forwarding">
                      {gateIssues['costs.forwarding']}
                    </p>
                  )}

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

                    </div>

                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Cost</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Qty</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Unit Rate</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Total</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Notes</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {forwardingCostsLoading ? (
                          <tr className="border-t border-slate-200 dark:border-slate-700">
                            <td colSpan={6} className="px-3 py-2 text-sm text-muted-foreground">
                              Loading cargo costs...
                            </td>
                          </tr>
                        ) : forwardingCosts.length === 0 ? (
                          <tr className="border-t border-slate-200 dark:border-slate-700">
                            <td colSpan={6} className="px-3 py-2 text-sm text-muted-foreground">
                              No cargo costs added.
                            </td>
                          </tr>
                        ) : (
                          forwardingCosts.map(row => {
                            const currencyLabel = row.currency ? row.currency : tenantCurrency
                            const isEditing = editingForwardingCostId === row.id
                            const isDeleting = forwardingCostDeletingId === row.id

                            return (
                              <tr key={row.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                                <td className="px-3 py-2">
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

                                <td className="px-3 py-2 text-right tabular-nums">
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
                                      className="h-7 w-20 px-2 py-0 text-xs text-right"
                                    />
                                  ) : (
                                    row.quantity.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 4,
                                    })
                                  )}
                                </td>

                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                  {isEditing ? (
                                    editingForwardingUnitRate !== null
                                      ? `${currencyLabel} ${editingForwardingUnitRate.toFixed(4)}`
                                      : '—'
                                  ) : (
                                    `${currencyLabel} ${row.unitRate.toFixed(4)}`
                                  )}
                                </td>

                                <td className="px-3 py-2 text-right tabular-nums font-medium">
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

                                <td className="px-3 py-2">
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
                                      className="h-7 px-2 py-0 text-xs"
                                    />
                                  ) : (
                                    <p className="text-muted-foreground">{row.notes ? row.notes : '—'}</p>
                                  )}
                                </td>

                                <td className="px-3 py-2 text-right">
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
                                            setConfirmDialog({
                                              open: true,
                                              type: 'delete-forwarding-cost',
                                              title: 'Delete cargo cost',
                                              message: `Delete ${row.costName} from this order?`,
                                              forwardingCostId: row.id,
                                            })
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
                        <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50">
                          <td colSpan={3} className="px-3 py-2 text-right font-medium text-muted-foreground">
                            Cargo Subtotal
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
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
                </div>

                {/* Inbound Costs Section */}
                <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Inbound Costs
                  </h4>
                  {costLedgerLoading ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                      <p className="text-sm text-muted-foreground">Loading inbound costs…</p>
                    </div>
                  ) : inboundCostRows.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                      <p className="text-sm text-muted-foreground">
                        {order.status === 'WAREHOUSE'
                          ? 'No inbound costs found for this receipt.'
                          : 'Inbound costs will be calculated when the PO is received at warehouse.'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Cost</th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inboundCostRows.map(row => (
                            <tr
                              key={row.costName}
                              className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50"
                            >
                              <td className="px-3 py-2 font-medium text-foreground">
                                {row.costName}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-medium">
                                {tenantCurrency}{' '}
                                {row.totalCost.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-700/50">
                            <td className="px-3 py-2 text-right font-medium text-muted-foreground">
                              Inbound Subtotal
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">
                              {tenantCurrency}{' '}
                              {inboundSubtotal.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
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
                          {order.stageData.warehouse.dutyCurrency ?? 'USD'} {order.stageData.warehouse.dutyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Supplier Credit/Debit Section */}
                {activeViewStage === 'WAREHOUSE' && (
                  <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Supplier Credit/Debit
                      </h4>
                      {!supplierAdjustmentEditing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSupplierAdjustmentEditing(true)}
                          disabled={supplierAdjustmentLoading || supplierAdjustmentSaving || !order.warehouseCode || !order.warehouseName}
                        >
                          {supplierAdjustment ? 'Edit' : 'Add'}
                        </Button>
                      )}
                    </div>

                    {supplierAdjustmentLoading ? (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                        <p className="text-sm text-muted-foreground">Loading supplier adjustment…</p>
                      </div>
                    ) : !order.warehouseCode || !order.warehouseName ? (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-4">
                        <p className="text-sm text-muted-foreground">
                          Supplier credits/debits are recorded after the PO is received at warehouse.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                        {supplierAdjustment ? (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Type
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {supplierAdjustment.amount < 0 ? 'Credit Note' : 'Debit Note'}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Amount
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {supplierAdjustment.currency}{' '}
                                {supplierAdjustment.amount.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Updated
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {formatDateOnly(supplierAdjustment.effectiveAt)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Updated By
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {supplierAdjustment.createdByName}
                              </p>
                            </div>
                            <div className="space-y-1 col-span-2 md:col-span-4">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Notes
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {supplierAdjustment.notes ? supplierAdjustment.notes : '—'}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No supplier adjustment recorded.</p>
                        )}

                        {supplierAdjustmentEditing && (
                          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Kind
                                </p>
                                <select
                                  value={supplierAdjustmentDraft.kind}
                                  onChange={e =>
                                    setSupplierAdjustmentDraft(prev => ({
                                      ...prev,
                                      kind: e.target.value as 'credit' | 'debit',
                                    }))
                                  }
                                  disabled={supplierAdjustmentSaving}
                                  className="w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                                >
                                  <option value="credit">Credit</option>
                                  <option value="debit">Debit</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Amount ({tenantCurrency})
                                </p>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={supplierAdjustmentDraft.amount}
                                  onChange={e =>
                                    setSupplierAdjustmentDraft(prev => ({
                                      ...prev,
                                      amount: e.target.value,
                                    }))
                                  }
                                  disabled={supplierAdjustmentSaving}
                                />
                              </div>
                              <div className="space-y-1 col-span-2 md:col-span-4">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Notes
                                </p>
                                <Input
                                  value={supplierAdjustmentDraft.notes}
                                  onChange={e =>
                                    setSupplierAdjustmentDraft(prev => ({
                                      ...prev,
                                      notes: e.target.value,
                                    }))
                                  }
                                  disabled={supplierAdjustmentSaving}
                                  placeholder="Optional notes"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 mt-4">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setSupplierAdjustmentEditing(false)}
                                disabled={supplierAdjustmentSaving}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void saveSupplierAdjustment()}
                                disabled={supplierAdjustmentSaving || !supplierAdjustmentDraft.amount.trim()}
                                className="gap-2"
                              >
                                {supplierAdjustmentSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                                Save
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
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
	                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
	                          <td className="px-3 py-2 text-muted-foreground">Product Costs</td>
	                          <td className="px-3 py-2 text-right tabular-nums font-medium">
	                            {tenantCurrency}{' '}
	                            {productSubtotal.toLocaleString(undefined, {
	                                minimumFractionDigits: 2,
	                                maximumFractionDigits: 2,
	                              })}
	                          </td>
	                        </tr>
                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                          <td className="px-3 py-2 text-muted-foreground">Cargo Costs</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {forwardingSubtotal > 0
                              ? `${tenantCurrency} ${forwardingSubtotal.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                          <td className="px-3 py-2 text-muted-foreground">Inbound Costs</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {inboundSubtotal > 0
                              ? `${tenantCurrency} ${inboundSubtotal.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                          <td className="px-3 py-2 text-muted-foreground">Storage Costs</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        </tr>
	                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
	                          <td className="px-3 py-2 text-muted-foreground">Outbound Costs</td>
	                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
	                        </tr>
	                        <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
	                          <td className="px-3 py-2 text-muted-foreground">Supplier Adjustment</td>
	                          <td className="px-3 py-2 text-right tabular-nums font-medium">
	                            {supplierAdjustment
	                              ? `${supplierAdjustment.currency} ${supplierAdjustment.amount.toLocaleString(undefined, {
	                                  minimumFractionDigits: 2,
	                                  maximumFractionDigits: 2,
	                                })}`
	                              : '—'}
	                          </td>
	                        </tr>
	                        {order.stageData.warehouse?.dutyAmount != null && (
	                          <tr className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
	                            <td className="px-3 py-2 text-muted-foreground">Customs & Duty</td>
	                            <td className="px-3 py-2 text-right tabular-nums font-medium">
	                              {order.stageData.warehouse.dutyCurrency ?? 'USD'} {order.stageData.warehouse.dutyAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
	                            </td>
	                          </tr>
	                        )}
                      </tbody>
                      <tfoot>
	                        <tr className="bg-slate-50/50 dark:bg-slate-700/50">
	                          <td className="px-3 py-2 font-semibold">Total Cost</td>
	                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-lg">
	                            {tenantCurrency}{' '}
	                            {totalCostSummary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
	                          </td>
	                        </tr>
	                      </tfoot>
	                    </table>
	                  </div>
	                </div>
              </div>
                )}

              </>
            )}

            {activeBottomTab === 'details' && (
              <>
                {isCreate ? (
              <div className="p-6">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Order Info
                    </h4>
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
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        RFQ Number
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {displayOrderNumber}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Supplier
                      </p>
                      {orderInfoEditing ? (
                        <select
                          value={orderInfoDraft.counterpartyName}
                          onChange={e => applySupplierSelection(e.target.value)}
                          disabled={orderInfoSaving}
                          className="w-full h-10 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Select supplier</option>
                          {suppliers.map(supplier => (
                            <option key={supplier.id} value={supplier.name}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {orderInfoDraft.counterpartyName.trim()
                            ? orderInfoDraft.counterpartyName
                            : '—'}
                        </p>
                      )}
                      {selectedSupplier?.phone && selectedSupplier.phone.trim().length > 0 && (
                        <p className="text-xs text-muted-foreground">Tel: {selectedSupplier.phone.trim()}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Destination
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {tenantDestination.trim() ? tenantDestination : '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cargo Ready Date
                      </p>
                      {orderInfoEditing ? (
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
                          {orderInfoDraft.expectedDate.trim() ? orderInfoDraft.expectedDate : '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Incoterms
                      </p>
                      {orderInfoEditing ? (
                        <select
                          value={orderInfoDraft.incoterms}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              incoterms: e.target.value,
                            }))
                          }
                          disabled={orderInfoSaving}
                          className="w-full h-10 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-slate-900 dark:text-slate-100"
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
                          {orderInfoDraft.incoterms.trim() ? orderInfoDraft.incoterms : '—'}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Payment Terms
                      </p>
                      {orderInfoEditing ? (
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
                          {orderInfoDraft.paymentTerms.trim()
                            ? orderInfoDraft.paymentTerms
                            : '—'}
                        </p>
                      )}
                    </div>
                  </div>

                  {(orderInfoDraft.notes.trim() || orderInfoEditing) && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Notes
                      </p>
                      {orderInfoEditing ? (
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
                        <p className="text-sm text-slate-700 dark:text-slate-300">
                          {orderInfoDraft.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : order ? (
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
                        {order.status === 'DRAFT' ? 'RFQ Number' : 'PO Number'}
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {displayOrderNumber}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Supplier
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <select
                          data-gate-key="details.counterpartyName"
                          value={orderInfoDraft.counterpartyName}
                          onChange={e => applySupplierSelection(e.target.value)}
                          disabled={orderInfoSaving}
                          className={`w-full h-10 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-slate-900 dark:text-slate-100 ${
                            gateIssues?.['details.counterpartyName'] ? 'border-rose-500' : ''
                          }`}
                        >
                          <option value="">Select supplier</option>
                          {suppliers.map(supplier => (
                            <option key={supplier.id} value={supplier.name}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p
                          className="text-sm font-medium text-slate-900 dark:text-slate-100"
                          data-gate-key="details.counterpartyName"
                        >
                          {order.counterpartyName ?? '—'}
                        </p>
                      )}
                      {!orderInfoEditing && order.supplier?.phone && order.supplier.phone.trim().length > 0 && (
                        <p className="text-xs text-muted-foreground">Tel: {order.supplier.phone.trim()}</p>
                      )}
                      {gateIssues?.['details.counterpartyName'] && (
                        <p className="text-xs text-rose-600" data-gate-key="details.counterpartyName">
                          {gateIssues['details.counterpartyName']} <Link href="/config/suppliers" className="underline">Open Suppliers</Link>
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Destination
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatTextOrDash(tenantDestination)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cargo Ready Date
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Input
                          type="date"
                          data-gate-key="details.expectedDate"
                          value={orderInfoDraft.expectedDate}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              expectedDate: e.target.value,
                            }))
                          }
                          disabled={orderInfoSaving}
                          className={
                            gateIssues?.['details.expectedDate']
                              ? 'border-rose-500 focus-visible:ring-rose-500'
                              : undefined
                          }
                        />
                      ) : (
                        <p
                          className="text-sm font-medium text-slate-900 dark:text-slate-100"
                          data-gate-key="details.expectedDate"
                        >
                          {order.expectedDate ? formatDateOnly(order.expectedDate) : '—'}
                        </p>
                      )}
                      {gateIssues?.['details.expectedDate'] && (
                        <p className="text-xs text-rose-600" data-gate-key="details.expectedDate">
                          {gateIssues['details.expectedDate']}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Incoterms
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <select
                          data-gate-key="details.incoterms"
                          value={orderInfoDraft.incoterms}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              incoterms: e.target.value,
                            }))
                          }
                          disabled={orderInfoSaving}
                          className={`w-full h-10 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm text-slate-900 dark:text-slate-100 ${
                            gateIssues?.['details.incoterms'] ? 'border-rose-500' : ''
                          }`}
                        >
                          <option value="">Select incoterms</option>
                          {INCOTERMS_OPTIONS.map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p
                          className="text-sm font-medium text-slate-900 dark:text-slate-100"
                          data-gate-key="details.incoterms"
                        >
                          {order.incoterms ?? '—'}
                        </p>
                      )}
                      {gateIssues?.['details.incoterms'] && (
                        <p className="text-xs text-rose-600" data-gate-key="details.incoterms">
                          {gateIssues['details.incoterms']}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Payment Terms
                      </p>
                      {canEdit && orderInfoEditing ? (
                        <Input
                          data-gate-key="details.paymentTerms"
                          value={orderInfoDraft.paymentTerms}
                          onChange={e =>
                            setOrderInfoDraft(prev => ({
                              ...prev,
                              paymentTerms: e.target.value,
                            }))
                          }
                          placeholder="Payment terms"
                          disabled={orderInfoSaving}
                          className={
                            gateIssues?.['details.paymentTerms']
                              ? 'border-rose-500 focus-visible:ring-rose-500'
                              : undefined
                          }
                        />
                      ) : (
                        <p
                          className="text-sm font-medium text-slate-900 dark:text-slate-100"
                          data-gate-key="details.paymentTerms"
                        >
                          {order.paymentTerms ?? '—'}
                        </p>
                      )}
                      {gateIssues?.['details.paymentTerms'] && (
                        <p className="text-xs text-rose-600" data-gate-key="details.paymentTerms">
                          {gateIssues['details.paymentTerms']}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Created
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatTextOrDash(formatDateOnly(order.createdAt))}
                        {order.createdByName ? ` by ${order.createdByName}` : ''}
                      </p>
                    </div>

                    <div className="space-y-1 col-span-2 md:col-span-3 lg:col-span-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Ship To
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {(() => {
                          const parts: string[] = []
                          parts.push(BUYER_LEGAL_ENTITY.name)
                          parts.push(BUYER_LEGAL_ENTITY.address)
                          if (tenantDisplayCode.trim().length > 0) {
                            parts.push(tenantDisplayCode.trim().toUpperCase())
                          }
                          parts.push(BUYER_LEGAL_ENTITY.phone)
                          return parts.join(' • ')
                        })()}
                      </p>
                    </div>

                    {order.status !== 'DRAFT' && (
                      <div className="space-y-1 col-span-2 md:col-span-3 lg:col-span-4">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Supplier Banking
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                          {formatTextOrDash(order.supplier?.bankingDetails)}
                        </p>
                      </div>
                    )}
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
                  if (activeViewStage !== 'MANUFACTURING') return null
                  const mfg = order.stageData.manufacturing
                  const canEditStage =
                    !isReadOnly && order.status === 'MANUFACTURING' && activeViewStage === 'MANUFACTURING'

                  const startDateValue =
                    getStageField('manufacturingStartDate') ??
                    formatDateOnly(mfg?.manufacturingStartDate ?? mfg?.manufacturingStart ?? null)
                  const expectedCompletionValue =
                    getStageField('expectedCompletionDate') ?? formatDateOnly(mfg?.expectedCompletionDate ?? null)
                  const packagingNotesValue =
                    getStageField('packagingNotes') ??
                    (typeof mfg?.packagingNotes === 'string' ? mfg.packagingNotes : '')

                  const startIssue = gateIssues?.['details.manufacturingStartDate'] ?? null

                  return (
                    <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        Manufacturing
                      </h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Start Date
                          </p>
                          {canEditStage ? (
                            <Input
                              type="date"
                              data-gate-key="details.manufacturingStartDate"
                              value={startDateValue}
                              onChange={e => setStageField('manufacturingStartDate', e.target.value)}
                              className={
                                startIssue ? 'border-rose-500 focus-visible:ring-rose-500' : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.manufacturingStartDate"
                            >
                              {formatTextOrDash(
                                formatDateOnly(mfg?.manufacturingStartDate ?? mfg?.manufacturingStart ?? null)
                              )}
                            </p>
                          )}
                          {startIssue && (
                            <p className="text-xs text-rose-600" data-gate-key="details.manufacturingStartDate">
                              {startIssue}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Expected Completion
                          </p>
                          {canEditStage ? (
                            <Input
                              type="date"
                              value={expectedCompletionValue}
                              onChange={e => setStageField('expectedCompletionDate', e.target.value)}
                            />
                          ) : (
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {formatTextOrDash(formatDateOnly(mfg?.expectedCompletionDate ?? null))}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Cartons
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalCartons?.toLocaleString() ?? '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Pallets
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalPallets?.toLocaleString() ?? '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Weight ({weightUnit})
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalWeightKg != null
                              ? convertWeightFromKg(mfg.totalWeightKg, unitSystem).toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })
                              : '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Volume (CBM)
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mfg?.totalVolumeCbm?.toLocaleString() ?? '—'}
                          </p>
                        </div>
                        <div className="space-y-1 col-span-2 md:col-span-3 lg:col-span-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Packaging Notes
                          </p>
                          {canEditStage ? (
                            <Textarea
                              value={packagingNotesValue}
                              onChange={e => setStageField('packagingNotes', e.target.value)}
                              placeholder="Optional packaging notes..."
                              className="min-h-[88px]"
                            />
                          ) : (
                            <p className="text-sm text-slate-700 dark:text-slate-300">
                              {typeof mfg?.packagingNotes === 'string' && mfg.packagingNotes.trim().length > 0
                                ? mfg.packagingNotes
                                : '—'}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* In Transit Section */}
                {(() => {
                  if (activeViewStage !== 'OCEAN') return null
                  const ocean = order.stageData.ocean
                  const canEditStage = !isReadOnly && order.status === 'OCEAN' && activeViewStage === 'OCEAN'
                  const textField = (key: string, existing: string | null | undefined): string =>
                    getStageField(key) ?? (typeof existing === 'string' ? existing : '')
                  const issue = (key: string): string | null => gateIssues?.[`details.${key}`] ?? null

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
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.houseBillOfLading"
                              value={textField('houseBillOfLading', ocean?.houseBillOfLading)}
                              onChange={e => setStageField('houseBillOfLading', e.target.value)}
                              placeholder="Enter bill of lading reference"
                              className={
                                issue('houseBillOfLading')
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.houseBillOfLading"
                            >
                              {formatTextOrDash(ocean?.houseBillOfLading)}
                            </p>
                          )}
                          {issue('houseBillOfLading') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.houseBillOfLading">
                              {issue('houseBillOfLading')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Master B/L
                          </p>
                          {canEditStage ? (
                            <Input
                              value={textField('masterBillOfLading', ocean?.masterBillOfLading)}
                              onChange={e => setStageField('masterBillOfLading', e.target.value)}
                              placeholder="Optional"
                            />
                          ) : (
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {formatTextOrDash(ocean?.masterBillOfLading)}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Vessel
                          </p>
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.vesselName"
                              value={textField('vesselName', ocean?.vesselName)}
                              onChange={e => setStageField('vesselName', e.target.value)}
                              placeholder="Enter vessel name"
                              className={
                                issue('vesselName') ? 'border-rose-500 focus-visible:ring-rose-500' : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.vesselName"
                            >
                              {formatTextOrDash(ocean?.vesselName)}
                            </p>
                          )}
                          {issue('vesselName') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.vesselName">
                              {issue('vesselName')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Voyage
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(ocean?.voyageNumber)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Port of Loading
                          </p>
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.portOfLoading"
                              value={textField('portOfLoading', ocean?.portOfLoading)}
                              onChange={e => setStageField('portOfLoading', e.target.value)}
                              placeholder="Enter port of loading"
                              className={
                                issue('portOfLoading')
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.portOfLoading"
                            >
                              {formatTextOrDash(ocean?.portOfLoading)}
                            </p>
                          )}
                          {issue('portOfLoading') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.portOfLoading">
                              {issue('portOfLoading')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Port of Discharge
                          </p>
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.portOfDischarge"
                              value={textField('portOfDischarge', ocean?.portOfDischarge)}
                              onChange={e => setStageField('portOfDischarge', e.target.value)}
                              placeholder="Enter port of discharge"
                              className={
                                issue('portOfDischarge')
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.portOfDischarge"
                            >
                              {formatTextOrDash(ocean?.portOfDischarge)}
                            </p>
                          )}
                          {issue('portOfDischarge') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.portOfDischarge">
                              {issue('portOfDischarge')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            ETD
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(formatDateOnly(ocean?.estimatedDeparture ?? null))}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            ETA
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(formatDateOnly(ocean?.estimatedArrival ?? null))}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Commercial Invoice
                          </p>
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.commercialInvoiceNumber"
                              value={textField('commercialInvoiceNumber', ocean?.commercialInvoiceNumber)}
                              onChange={e => setStageField('commercialInvoiceNumber', e.target.value)}
                              placeholder="Enter invoice number"
                              className={
                                issue('commercialInvoiceNumber')
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.commercialInvoiceNumber"
                            >
                              {formatTextOrDash(ocean?.commercialInvoiceNumber)}
                            </p>
                          )}
                          {issue('commercialInvoiceNumber') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.commercialInvoiceNumber">
                              {issue('commercialInvoiceNumber')}
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Packing List Ref
                          </p>
                          {canEditStage ? (
                            <Input
                              data-gate-key="details.packingListRef"
                              value={textField('packingListRef', ocean?.packingListRef)}
                              onChange={e => setStageField('packingListRef', e.target.value)}
                              placeholder="Enter packing list reference"
                              className={
                                issue('packingListRef')
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                          ) : (
                            <p
                              className="text-sm font-medium text-slate-900 dark:text-slate-100"
                              data-gate-key="details.packingListRef"
                            >
                              {formatTextOrDash(ocean?.packingListRef)}
                            </p>
                          )}
                          {issue('packingListRef') && (
                            <p className="text-xs text-rose-600" data-gate-key="details.packingListRef">
                              {issue('packingListRef')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Warehouse Section */}
                {(() => {
                  if (activeViewStage !== 'WAREHOUSE') return null
                  const wh = order.stageData.warehouse
                  const canEditStage = !isReadOnly && order.status === 'WAREHOUSE' && activeViewStage === 'WAREHOUSE'

                  return (
                    <div className="mb-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                        Warehouse
                      </h4>
                      {canEditStage ? (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                          <div className="space-y-1" data-gate-key="details.warehouseCode">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Warehouse
                            </p>
                            <select
                              data-gate-key="details.warehouseCode"
                              value={receiveFormData.warehouseCode}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, warehouseCode: e.target.value }))
                              }
                              disabled={warehousesLoading}
                              className={`w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm ${
                                gateIssues?.['details.warehouseCode'] ? 'border-rose-500' : ''
                              }`}
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
                            {gateIssues?.['details.warehouseCode'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.warehouseCode">
                                {gateIssues['details.warehouseCode']}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1" data-gate-key="details.receiveType">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Receive Type
                            </p>
                            <select
                              data-gate-key="details.receiveType"
                              value={receiveFormData.receiveType}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, receiveType: e.target.value }))
                              }
                              className={`w-full h-10 px-3 border rounded-md bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm ${
                                gateIssues?.['details.receiveType'] ? 'border-rose-500' : ''
                              }`}
                            >
                              <option value="">Select receive type</option>
                              <option value="LCL">LCL</option>
                              <option value="CONTAINER_20">20&apos; Container</option>
                              <option value="CONTAINER_40">40&apos; Container</option>
                              <option value="CONTAINER_40_HQ">40&apos; HQ Container</option>
                              <option value="CONTAINER_45_HQ">45&apos; HQ Container</option>
                            </select>
                            {gateIssues?.['details.receiveType'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.receiveType">
                                {gateIssues['details.receiveType']}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1 col-span-2" data-gate-key="details.customsEntryNumber">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Import Entry Number
                            </p>
                            <Input
                              data-gate-key="details.customsEntryNumber"
                              value={receiveFormData.customsEntryNumber}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, customsEntryNumber: e.target.value }))
                              }
                              placeholder="Enter import entry number"
                              className={
                                gateIssues?.['details.customsEntryNumber']
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                            {gateIssues?.['details.customsEntryNumber'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.customsEntryNumber">
                                {gateIssues['details.customsEntryNumber']}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1" data-gate-key="details.customsClearedDate">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Customs Cleared Date
                            </p>
                            <Input
                              type="date"
                              data-gate-key="details.customsClearedDate"
                              value={receiveFormData.customsClearedDate}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, customsClearedDate: e.target.value }))
                              }
                              className={
                                gateIssues?.['details.customsClearedDate']
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                            {gateIssues?.['details.customsClearedDate'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.customsClearedDate">
                                {gateIssues['details.customsClearedDate']}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1" data-gate-key="details.receivedDate">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Received Date
                            </p>
                            <Input
                              type="date"
                              data-gate-key="details.receivedDate"
                              value={receiveFormData.receivedDate}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, receivedDate: e.target.value }))
                              }
                              className={
                                gateIssues?.['details.receivedDate']
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                            {gateIssues?.['details.receivedDate'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.receivedDate">
                                {gateIssues['details.receivedDate']}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Duty Amount (optional)
                            </p>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={receiveFormData.dutyAmount}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, dutyAmount: e.target.value }))
                              }
                              placeholder="0.00"
                            />
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Duty Currency (optional)
                            </p>
                            <Input
                              value={receiveFormData.dutyCurrency}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, dutyCurrency: e.target.value }))
                              }
                              placeholder="USD"
                            />
                          </div>

                          <div className="space-y-1 col-span-2 md:col-span-3 lg:col-span-4" data-gate-key="details.discrepancyNotes">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Discrepancy Notes
                            </p>
                            <Textarea
                              value={receiveFormData.discrepancyNotes}
                              onChange={e =>
                                setReceiveFormData(prev => ({ ...prev, discrepancyNotes: e.target.value }))
                              }
                              placeholder="Required if received cartons differ from ordered..."
                              className={
                                gateIssues?.['details.discrepancyNotes']
                                  ? 'border-rose-500 focus-visible:ring-rose-500'
                                  : undefined
                              }
                            />
                            {gateIssues?.['details.discrepancyNotes'] && (
                              <p className="text-xs text-rose-600" data-gate-key="details.discrepancyNotes">
                                {gateIssues['details.discrepancyNotes']}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Warehouse
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {formatTextOrDash(wh?.warehouseName ?? wh?.warehouseCode)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Import Entry
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {formatTextOrDash(wh?.customsEntryNumber)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Customs Cleared
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {formatTextOrDash(formatDateOnly(wh?.customsClearedDate ?? null))}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Duty Amount
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {wh?.dutyAmount != null
                                  ? `${wh.dutyAmount.toLocaleString()} ${wh.dutyCurrency ?? ''}`
                                  : '—'}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                Received Date
                              </p>
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {formatTextOrDash(formatDateOnly(wh?.receivedDate ?? null))}
                              </p>
                            </div>
                          </div>
                          {wh?.discrepancyNotes && (
                            <div className="mt-4">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                                Discrepancy Notes
                              </p>
                              <p className="text-sm text-slate-700 dark:text-slate-300">
                                {wh.discrepancyNotes}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}

                {/* Shipped Section */}
                {(() => {
                  if (activeViewStage !== 'SHIPPED') return null
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
                            {formatTextOrDash(
                              [
                                shipped?.shipToName,
                                shipped?.shipToAddress,
                                shipped?.shipToCity,
                                shipped?.shipToCountry,
                              ]
                                .filter(Boolean)
                                .join(', ')
                            )}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Carrier
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(shipped?.shippingCarrier)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Method
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(shipped?.shippingMethod)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Tracking
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(shipped?.trackingNumber)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Shipped Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(
                              formatDateOnly(shipped?.shippedDate ?? shipped?.shippedAt ?? null)
                            )}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Delivered Date
                          </p>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {formatTextOrDash(formatDateOnly(shipped?.deliveredDate ?? null))}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
                ) : null}
              </>
            )}

            {activeBottomTab === 'history' && (
              <>
                {isCreate ? (
                  <div className="p-6">
                    <p className="text-sm text-muted-foreground">
                      Create the RFQ to view history.
                    </p>
                  </div>
                ) : null}

                {!isCreate && order && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                {auditLogsLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading history…
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50/50 dark:bg-slate-700/50">
                        <th className="w-10 font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs"></th>
                        <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Action</th>
                        <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Changes</th>
                        <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">By</th>
                        <th className="font-medium text-muted-foreground px-3 py-2 whitespace-nowrap text-xs text-left">Date</th>
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
                            <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                              <td className="px-3 py-2">
                                <Icon className={`h-4 w-4 ${iconClassName}`} />
                              </td>
                              <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                                {title}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground max-w-[300px]">
                                {changes.length > 0 ? (
                                  <span className="line-clamp-2" title={changes.join(', ')}>
                                    {changes.join(', ')}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {actor}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                                {formatDateOnly(entry.createdAt)}
                              </td>
                            </tr>
                          )
                        })
                      ) : order.approvalHistory && order.approvalHistory.length > 0 ? (
                        order.approvalHistory.map((approval, index) => (
                          <tr key={index} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/50">
                            <td className="px-3 py-2">
                              <Check className="h-4 w-4 text-emerald-600" />
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                              {approval.stage}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">—</td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {approval.approvedBy || 'Unknown'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
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
              </>
            )}
          </div>
        </div>

        
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
                  : confirmDialog.type === 'delete-forwarding-cost'
                    ? 'Delete Cost'
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
