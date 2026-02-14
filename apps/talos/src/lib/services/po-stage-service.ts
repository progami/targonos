import { randomUUID } from 'crypto'
import { getTenantPrisma, getCurrentTenant } from '@/lib/tenant/server'
import {
  CostCategory,
  FinancialLedgerCategory,
  FinancialLedgerSourceType,
  PurchaseOrder,
  PurchaseOrderProformaInvoice,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderLineStatus,
  PurchaseOrderDocumentStage,
  TransactionType,
  InboundReceiveType,
  Grn,
  Prisma,
} from '@targon/prisma-talos'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/api'
import { canApproveStageTransition, hasPermission, isSuperAdmin } from './permission-service'
import { auditLog } from '@/lib/security/audit-logger'
import { normalizePoCostCurrency } from '@/lib/constants/cost-currency'
import { toPublicOrderNumber } from './purchase-order-utils'
import {
  buildCommercialInvoiceReference,
  buildLotReference,
  buildPurchaseOrderReference,
  getNextCommercialInvoiceSequence,
  getNextPurchaseOrderSequence,
  isPurchaseOrderReferenceUsedAcrossTenants,
  normalizeSkuGroup,
  parseOrderReference,
  resolveOrderReferenceSeed,
} from './supply-chain-reference-service'
import { recalculateStorageLedgerForTransactions } from './storage-ledger-sync'
import { buildTacticalCostLedgerEntries } from '@/lib/costing/tactical-costing'
import { buildPoForwardingCostLedgerEntries } from '@/lib/costing/po-forwarding-costing'
import { calculatePalletValues } from '@/lib/utils/pallet-calculations'
import { formatDimensionTripletCm, resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { formatDimensionTripletDisplayFromCm, formatWeightDisplayFromKg, getDefaultUnitSystem } from '@/lib/measurements'
import { deriveSupplierCountry } from '@/lib/suppliers/derive-country'
import { recordStorageCostEntry } from '@/services/storageCost.service'

type PurchaseOrderWithLines = PurchaseOrder & {
  lines: PurchaseOrderLine[]
  proformaInvoices?: PurchaseOrderProformaInvoice[]
}
type PurchaseOrderGrnReference = Pick<Grn, 'referenceNumber' | 'receivedAt' | 'createdAt'>
type PurchaseOrderWithOptionalLines = PurchaseOrder & {
  lines?: PurchaseOrderLine[]
  proformaInvoices?: PurchaseOrderProformaInvoice[]
  grns?: PurchaseOrderGrnReference[]
}

type ManufacturingStageData = {
  proformaInvoiceNumber: PurchaseOrder['proformaInvoiceNumber']
  proformaInvoiceDate: PurchaseOrder['proformaInvoiceDate']
  factoryName: PurchaseOrder['factoryName']
  manufacturingStartDate: PurchaseOrder['manufacturingStartDate']
  expectedCompletionDate: PurchaseOrder['expectedCompletionDate']
  actualCompletionDate: PurchaseOrder['actualCompletionDate']
  totalWeightKg: number | null
  totalVolumeCbm: number | null
  totalCartons: PurchaseOrder['totalCartons']
  totalPallets: PurchaseOrder['totalPallets']
  packagingNotes: PurchaseOrder['packagingNotes']
  proformaInvoiceId: PurchaseOrder['proformaInvoiceId']
  proformaInvoiceData: PurchaseOrder['proformaInvoiceData']
  manufacturingStart: PurchaseOrder['manufacturingStart']
  manufacturingEnd: PurchaseOrder['manufacturingEnd']
  cargoDetails: PurchaseOrder['cargoDetails']
}

type OceanStageData = {
  houseBillOfLading: PurchaseOrder['houseBillOfLading']
  masterBillOfLading: PurchaseOrder['masterBillOfLading']
  commercialInvoiceNumber: PurchaseOrder['commercialInvoiceNumber']
  packingListRef: PurchaseOrder['packingListRef']
  vesselName: PurchaseOrder['vesselName']
  voyageNumber: PurchaseOrder['voyageNumber']
  portOfLoading: PurchaseOrder['portOfLoading']
  portOfDischarge: PurchaseOrder['portOfDischarge']
  estimatedDeparture: PurchaseOrder['estimatedDeparture']
  estimatedArrival: PurchaseOrder['estimatedArrival']
  actualDeparture: PurchaseOrder['actualDeparture']
  actualArrival: PurchaseOrder['actualArrival']
  commercialInvoiceId: PurchaseOrder['commercialInvoiceId']
}

type WarehouseStageData = {
  warehouseCode: PurchaseOrder['warehouseCode']
  warehouseName: PurchaseOrder['warehouseName']
  customsEntryNumber: PurchaseOrder['customsEntryNumber']
  customsClearedDate: PurchaseOrder['customsClearedDate']
  dutyAmount: number | null
  dutyCurrency: PurchaseOrder['dutyCurrency']
  surrenderBlDate: PurchaseOrder['surrenderBlDate']
  transactionCertNumber: PurchaseOrder['transactionCertNumber']
  receivedDate: PurchaseOrder['receivedDate']
  discrepancyNotes: PurchaseOrder['discrepancyNotes']
  warehouseInvoiceId: PurchaseOrder['warehouseInvoiceId']
  surrenderBL: PurchaseOrder['surrenderBL']
  transactionCertificate: PurchaseOrder['transactionCertificate']
  customsDeclaration: PurchaseOrder['customsDeclaration']
}

type ShippedStageData = {
  shipToName: PurchaseOrder['shipToName']
  shipToAddress: PurchaseOrder['shipToAddress']
  shipToCity: PurchaseOrder['shipToCity']
  shipToCountry: PurchaseOrder['shipToCountry']
  shipToPostalCode: PurchaseOrder['shipToPostalCode']
  shippingCarrier: PurchaseOrder['shippingCarrier']
  shippingMethod: PurchaseOrder['shippingMethod']
  trackingNumber: PurchaseOrder['trackingNumber']
  shippedDate: PurchaseOrder['shippedDate']
  proofOfDeliveryRef: PurchaseOrder['proofOfDeliveryRef']
  deliveredDate: PurchaseOrder['deliveredDate']
  proofOfDelivery: PurchaseOrder['proofOfDelivery']
  shippedAt: PurchaseOrder['shippedAt']
  shippedBy: PurchaseOrder['shippedByName']
}

type StageData = {
  manufacturing: ManufacturingStageData
  ocean: OceanStageData
  warehouse: WarehouseStageData
  shipped: ShippedStageData
}

type SerializedStageSection<T> = {
  [K in keyof T]: T[K] extends Date | null | undefined ? string | null : T[K]
}

type SerializedStageData = {
  [K in keyof StageData]: SerializedStageSection<StageData[K]>
}

function normalizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const numeric = Number(value as never)
    if (Number.isFinite(numeric)) return numeric
  }
  return value
}

// Valid stage transitions for current PO workflow (RFQ stage removed; legacy RFQ rows are treated as ISSUED)
export const VALID_TRANSITIONS: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  ISSUED: [
    PurchaseOrderStatus.MANUFACTURING,
    PurchaseOrderStatus.CLOSED,
  ],
  MANUFACTURING: [PurchaseOrderStatus.OCEAN, PurchaseOrderStatus.CLOSED],
  OCEAN: [PurchaseOrderStatus.WAREHOUSE, PurchaseOrderStatus.CLOSED],
  WAREHOUSE: [PurchaseOrderStatus.CLOSED],
  SHIPPED: [], // Terminal state
  CLOSED: [], // Terminal state
}

function normalizeWorkflowStatus(status: PurchaseOrderStatus): PurchaseOrderStatus {
  if (status === PurchaseOrderStatus.RFQ) return PurchaseOrderStatus.ISSUED
  if (status === PurchaseOrderStatus.REJECTED || status === PurchaseOrderStatus.CANCELLED) {
    return PurchaseOrderStatus.CLOSED
  }
  return status
}

// Stage-specific required fields for transition
export const STAGE_REQUIREMENTS: Record<string, string[]> = {
  // Issued = PO issued to supplier
  ISSUED: ['expectedDate', 'incoterms', 'paymentTerms', 'manufacturingStartDate'],
  // Manufacturing = production started
  MANUFACTURING: [],
  // Stage 3: Ocean
  OCEAN: [
    'houseBillOfLading',
    'commercialInvoiceNumber',
    'packingListRef',
    'vesselName',
    'portOfLoading',
    'portOfDischarge',
  ],
  // Stage 4: Warehouse - now requires selecting the warehouse
  WAREHOUSE: [
    'warehouseCode',
    'receiveType',
    'customsEntryNumber',
    'customsClearedDate',
    'receivedDate',
  ],
}

export const STAGE_DOCUMENT_REQUIREMENTS: Partial<Record<PurchaseOrderStatus, string[]>> = {
  MANUFACTURING: ['inspection_report'],
  OCEAN: ['commercial_invoice', 'bill_of_lading', 'packing_list', 'grs_tc'],
  WAREHOUSE: ['grn', 'custom_declaration'],
}

// Field labels for error messages
const FIELD_LABELS: Record<string, string> = {
  expectedDate: 'Cargo Ready Date',
  incoterms: 'Incoterms',
  paymentTerms: 'Payment Terms',
  // Stage 2
  proformaInvoiceNumber: 'Proforma Invoice Number',
  manufacturingStartDate: 'Manufacturing Start Date',
  expectedCompletionDate: 'Expected Completion Date',
  // Stage 3
  houseBillOfLading: 'House Bill of Lading',
  commercialInvoiceNumber: 'Commercial Invoice Number',
  packingListRef: 'Packing List Reference',
  vesselName: 'Vessel Name',
  portOfLoading: 'Port of Loading',
  portOfDischarge: 'Port of Discharge',
  // Stage 4
  warehouseCode: 'Warehouse',
  receiveType: 'Inbound Type',
  customsEntryNumber: 'Customs Entry Number',
  customsClearedDate: 'Customs Cleared Date',
  receivedDate: 'Received Date',
}

function normalizePiNumber(value: string): string {
  return value.trim().toUpperCase()
}

function buildPiDocumentType(piNumber: string): string {
  const normalized = normalizePiNumber(piNumber)
  const sanitized = normalized.replace(/[^A-Z0-9-]+/g, '')
  if (!sanitized) {
    throw new ValidationError('Invalid PI number')
  }
  return `pi_${sanitized.toLowerCase()}`
}

export interface StageTransitionInput {
  // Stage 2: Issued (supplier accepted)
  proformaInvoiceNumber?: string
  proformaInvoiceDate?: Date | string
  factoryName?: string

  // Stage 3: Manufacturing (production started)
  manufacturingStartDate?: Date | string
  expectedCompletionDate?: Date | string
  actualCompletionDate?: Date | string
  totalWeightKg?: number
  totalVolumeCbm?: number
  totalCartons?: number
  totalPallets?: number
  packagingNotes?: string
  splitAllocations?: Array<{
    lineId: string
    shipNowCartons?: number
  }>

  // Stage 3: Ocean
  houseBillOfLading?: string
  masterBillOfLading?: string
  commercialInvoiceNumber?: string
  packingListRef?: string
  vesselName?: string
  voyageNumber?: string
  portOfLoading?: string
  portOfDischarge?: string
  estimatedDeparture?: Date | string
  estimatedArrival?: Date | string
  actualDeparture?: Date | string
  actualArrival?: Date | string

  // Stage 4: Warehouse
  warehouseCode?: string
  warehouseName?: string
  receiveType?: InboundReceiveType | string
  customsEntryNumber?: string
  customsClearedDate?: Date | string
  dutyAmount?: number
  dutyCurrency?: string
  surrenderBlDate?: Date | string
  transactionCertNumber?: string
  receivedDate?: Date | string
  discrepancyNotes?: string

  // Legacy fields (for backward compatibility)
  proformaInvoiceId?: string
  proformaInvoiceData?: Prisma.JsonValue
  manufacturingStart?: Date | string
  manufacturingEnd?: Date | string
  cargoDetails?: Prisma.JsonValue
  commercialInvoiceId?: string
  warehouseInvoiceId?: string
  surrenderBL?: string
  transactionCertificate?: string
  customsDeclaration?: string
  proofOfDelivery?: string
}

const STAGE_EDITABLE_FIELDS: Partial<Record<PurchaseOrderStatus, Array<keyof StageTransitionInput>>> =
  {
    [PurchaseOrderStatus.ISSUED]: [
      'proformaInvoiceNumber',
      'proformaInvoiceDate',
      'factoryName',
      'proformaInvoiceId',
      'proformaInvoiceData',
    ],
    [PurchaseOrderStatus.MANUFACTURING]: [
      'manufacturingStartDate',
      'expectedCompletionDate',
      'actualCompletionDate',
      'totalWeightKg',
      'totalVolumeCbm',
      'totalCartons',
      'totalPallets',
      'packagingNotes',
      'splitAllocations',
      'manufacturingStart',
      'manufacturingEnd',
      'cargoDetails',
    ],
    [PurchaseOrderStatus.OCEAN]: [
      'houseBillOfLading',
      'masterBillOfLading',
      'commercialInvoiceNumber',
      'packingListRef',
      'vesselName',
      'voyageNumber',
      'portOfLoading',
      'portOfDischarge',
      'estimatedDeparture',
      'estimatedArrival',
      'actualDeparture',
      'actualArrival',
      'transactionCertNumber',
      'commercialInvoiceId',
    ],
    [PurchaseOrderStatus.WAREHOUSE]: [
      'warehouseCode',
      'warehouseName',
      'receiveType',
      'customsEntryNumber',
      'customsClearedDate',
      'dutyAmount',
      'dutyCurrency',
      'surrenderBlDate',
      'transactionCertNumber',
      'receivedDate',
      'discrepancyNotes',
      'warehouseInvoiceId',
      'surrenderBL',
      'transactionCertificate',
      'customsDeclaration',
    ],
  }

function filterStageDataForTarget(
  targetStatus: PurchaseOrderStatus,
  stageData: StageTransitionInput
): StageTransitionInput {
  const allowed = STAGE_EDITABLE_FIELDS[targetStatus] ?? []
  if (allowed.length === 0) return {}

  const filtered: StageTransitionInput = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(stageData, key)) {
      ;(filtered as Record<string, unknown>)[key] = stageData[key]
    }
  }
  return filtered
}

function applyStageFieldDataToOrderUpdate(
  updateData: Prisma.PurchaseOrderUpdateInput,
  stageData: StageTransitionInput
): void {
  if (stageData.proformaInvoiceNumber !== undefined) {
    updateData.proformaInvoiceNumber = stageData.proformaInvoiceNumber
  }
  if (stageData.proformaInvoiceDate !== undefined) {
    updateData.proformaInvoiceDate = new Date(stageData.proformaInvoiceDate)
  }
  if (stageData.factoryName !== undefined) {
    updateData.factoryName = stageData.factoryName
  }
  if (stageData.manufacturingStartDate !== undefined) {
    updateData.manufacturingStartDate = new Date(stageData.manufacturingStartDate)
  }
  if (stageData.expectedCompletionDate !== undefined) {
    updateData.expectedCompletionDate = new Date(stageData.expectedCompletionDate)
  }
  if (stageData.actualCompletionDate !== undefined) {
    updateData.actualCompletionDate = new Date(stageData.actualCompletionDate)
  }
  if (stageData.totalWeightKg !== undefined) {
    updateData.totalWeightKg =
      typeof stageData.totalWeightKg === 'number'
        ? new Prisma.Decimal(stageData.totalWeightKg.toFixed(2))
        : null
  }
  if (stageData.totalVolumeCbm !== undefined) {
    updateData.totalVolumeCbm =
      typeof stageData.totalVolumeCbm === 'number'
        ? new Prisma.Decimal(stageData.totalVolumeCbm.toFixed(3))
        : null
  }
  if (stageData.totalCartons !== undefined) {
    updateData.totalCartons = stageData.totalCartons
  }
  if (stageData.totalPallets !== undefined) {
    updateData.totalPallets = stageData.totalPallets
  }
  if (stageData.packagingNotes !== undefined) {
    updateData.packagingNotes = stageData.packagingNotes
  }

  if (stageData.houseBillOfLading !== undefined) {
    updateData.houseBillOfLading = stageData.houseBillOfLading
  }
  if (stageData.masterBillOfLading !== undefined) {
    updateData.masterBillOfLading = stageData.masterBillOfLading
  }
  if (stageData.commercialInvoiceNumber !== undefined) {
    updateData.commercialInvoiceNumber = stageData.commercialInvoiceNumber
  }
  if (stageData.packingListRef !== undefined) {
    updateData.packingListRef = stageData.packingListRef
  }
  if (stageData.vesselName !== undefined) {
    updateData.vesselName = stageData.vesselName
  }
  if (stageData.voyageNumber !== undefined) {
    updateData.voyageNumber = stageData.voyageNumber
  }
  if (stageData.portOfLoading !== undefined) {
    updateData.portOfLoading = stageData.portOfLoading
  }
  if (stageData.portOfDischarge !== undefined) {
    updateData.portOfDischarge = stageData.portOfDischarge
  }
  if (stageData.estimatedDeparture !== undefined) {
    updateData.estimatedDeparture = new Date(stageData.estimatedDeparture)
  }
  if (stageData.estimatedArrival !== undefined) {
    updateData.estimatedArrival = new Date(stageData.estimatedArrival)
  }
  if (stageData.actualDeparture !== undefined) {
    updateData.actualDeparture = new Date(stageData.actualDeparture)
  }
  if (stageData.actualArrival !== undefined) {
    updateData.actualArrival = new Date(stageData.actualArrival)
  }

  if (stageData.warehouseCode !== undefined) {
    updateData.warehouseCode = stageData.warehouseCode
  }
  if (stageData.warehouseName !== undefined) {
    updateData.warehouseName = stageData.warehouseName
  }
  if (stageData.receiveType !== undefined) {
    updateData.receiveType = stageData.receiveType as InboundReceiveType
  }
  if (stageData.customsEntryNumber !== undefined) {
    updateData.customsEntryNumber = stageData.customsEntryNumber
  }
  if (stageData.customsClearedDate !== undefined) {
    updateData.customsClearedDate = new Date(stageData.customsClearedDate)
  }
  if (stageData.dutyAmount !== undefined) {
    updateData.dutyAmount =
      typeof stageData.dutyAmount === 'number'
        ? new Prisma.Decimal(stageData.dutyAmount.toFixed(2))
        : null
  }
  if (stageData.dutyCurrency !== undefined) {
    updateData.dutyCurrency = stageData.dutyCurrency
  }
  if (stageData.surrenderBlDate !== undefined) {
    updateData.surrenderBlDate = new Date(stageData.surrenderBlDate)
  }
  if (stageData.transactionCertNumber !== undefined) {
    updateData.transactionCertNumber = stageData.transactionCertNumber
  }
  if (stageData.receivedDate !== undefined) {
    updateData.receivedDate = new Date(stageData.receivedDate)
  }
  if (stageData.discrepancyNotes !== undefined) {
    updateData.discrepancyNotes = stageData.discrepancyNotes
  }

  if (stageData.proformaInvoiceId !== undefined) {
    updateData.proformaInvoiceId = stageData.proformaInvoiceId
  }
  if (stageData.proformaInvoiceData !== undefined) {
    updateData.proformaInvoiceData = stageData.proformaInvoiceData
  }
  if (stageData.manufacturingStart !== undefined) {
    updateData.manufacturingStart = new Date(stageData.manufacturingStart)
  }
  if (stageData.manufacturingEnd !== undefined) {
    updateData.manufacturingEnd = new Date(stageData.manufacturingEnd)
  }
  if (stageData.cargoDetails !== undefined) {
    updateData.cargoDetails = stageData.cargoDetails
  }
  if (stageData.commercialInvoiceId !== undefined) {
    updateData.commercialInvoiceId = stageData.commercialInvoiceId
  }
  if (stageData.warehouseInvoiceId !== undefined) {
    updateData.warehouseInvoiceId = stageData.warehouseInvoiceId
  }
  if (stageData.surrenderBL !== undefined) {
    updateData.surrenderBL = stageData.surrenderBL
  }
  if (stageData.transactionCertificate !== undefined) {
    updateData.transactionCertificate = stageData.transactionCertificate
  }
  if (stageData.customsDeclaration !== undefined) {
    updateData.customsDeclaration = stageData.customsDeclaration
  }
  if (stageData.proofOfDelivery !== undefined) {
    updateData.proofOfDelivery = stageData.proofOfDelivery
  }
}

export interface UserContext {
  id: string
  name: string
  email: string
}

export class StageGateError extends ValidationError {
  readonly details: Record<string, string>

  constructor(message: string, details: Record<string, string>) {
    super(message)
    this.name = 'StageGateError'
    this.details = details
  }
}

/**
 * Check if a transition is valid
 */
export function isValidTransition(
  fromStatus: PurchaseOrderStatus,
  toStatus: PurchaseOrderStatus
): boolean {
  const validTargets = VALID_TRANSITIONS[normalizeWorkflowStatus(fromStatus)]
  return validTargets?.includes(toStatus) ?? false
}

/**
 * Get valid next stages from current status
 */
export function getValidNextStages(currentStatus: PurchaseOrderStatus): PurchaseOrderStatus[] {
  return VALID_TRANSITIONS[normalizeWorkflowStatus(currentStatus)] ?? []
}

/**
 * Get required fields for transitioning to a stage
 */
export function getRequiredFieldsForStage(stage: PurchaseOrderStatus): string[] {
  return STAGE_REQUIREMENTS[stage] ?? []
}

/**
 * Validate that all required fields are present for a stage
 */
export function validateStageData(
  targetStage: PurchaseOrderStatus,
  data: StageTransitionInput,
  existingOrder: PurchaseOrder
): { valid: boolean; missingFields: string[] } {
  const requiredFields = getRequiredFieldsForStage(targetStage)
  const missingFields: string[] = []

  for (const field of requiredFields) {
    // Check if the field exists in the new data or already on the order
    const newValue = data[field as keyof StageTransitionInput]
    const existingValue = existingOrder[field as keyof PurchaseOrder]

    if (!newValue && !existingValue) {
      missingFields.push(FIELD_LABELS[field] ?? field)
    }
  }

  return {
    valid: missingFields.length === 0,
    missingFields,
  }
}

function recordGateIssue(
  issues: Record<string, string>,
  key: string,
  message: string
): void {
  if (issues[key]) return
  issues[key] = message
}

async function requireDocuments(params: {
  prisma: Prisma.TransactionClient
  purchaseOrderId: string
  stage: PurchaseOrderDocumentStage
  documentTypes: string[]
  issues: Record<string, string>
  issueKeyPrefix: string
  issueLabel: (documentType: string) => string
}) {
  if (params.documentTypes.length === 0) return

  const rows = await params.prisma.purchaseOrderDocument.findMany({
    where: {
      purchaseOrderId: params.purchaseOrderId,
      stage: params.stage,
      documentType: { in: params.documentTypes },
    },
    select: { documentType: true },
  })

  const present = new Set(rows.map(row => row.documentType))
  for (const docType of params.documentTypes) {
    if (present.has(docType)) continue
    recordGateIssue(
      params.issues,
      `${params.issueKeyPrefix}.${docType}`,
      `${params.issueLabel(docType)} is required`
    )
  }
}

async function requireLinePiDocuments(params: {
  prisma: Prisma.TransactionClient
  purchaseOrderId: string
  activeLines: PurchaseOrderLine[]
  issues: Record<string, string>
}) {
  const piNumbers: string[] = []
  for (const line of params.activeLines) {
    const piNumber = typeof line.piNumber === 'string' ? normalizePiNumber(line.piNumber) : ''
    if (!piNumber) {
      recordGateIssue(params.issues, `cargo.lines.${line.id}.piNumber`, 'PI number is required')
      continue
    }
    piNumbers.push(piNumber)
  }

  const uniquePiNumbers = Array.from(new Set(piNumbers))
  if (uniquePiNumbers.length === 0) return

  const requiredDocTypes = uniquePiNumbers.map(piNumber => buildPiDocumentType(piNumber))
  await requireDocuments({
    prisma: params.prisma,
    purchaseOrderId: params.purchaseOrderId,
    stage: PurchaseOrderDocumentStage.ISSUED,
    documentTypes: requiredDocTypes,
    issues: params.issues,
    issueKeyPrefix: 'documents.pi',
    issueLabel: (docType) => `PI document (${docType.replace(/^pi_/, '').toUpperCase()})`,
  })
}

function validateCommodityCodeFormat(params: { tenantCode: string; commodityCode: string }): boolean {
  const digits = params.commodityCode.replace(/[^0-9]/g, '')
  if (digits.length < 6) return false
  if (params.tenantCode === 'US') {
    return digits.length === 10
  }
  if (params.tenantCode === 'UK') {
    return digits.length === 10 || digits.length === 8 || digits.length === 6
  }
  return digits.length >= 6
}

function toFinancialCategory(costCategory: CostCategory): FinancialLedgerCategory {
  if (costCategory === CostCategory.Inbound) return FinancialLedgerCategory.Inbound
  if (costCategory === CostCategory.Storage) return FinancialLedgerCategory.Storage
  if (costCategory === CostCategory.Outbound) return FinancialLedgerCategory.Outbound
  if (costCategory === CostCategory.Forwarding) return FinancialLedgerCategory.Forwarding
  return FinancialLedgerCategory.Other
}

async function validateTransitionGate(params: {
  prisma: Prisma.TransactionClient
  order: PurchaseOrderWithLines
  targetStatus: PurchaseOrderStatus
  stageData: StageTransitionInput
}) {
  const issues: Record<string, string> = {}

  const activeLines = params.order.lines.filter(line => line.status !== PurchaseOrderLineStatus.CANCELLED)

  if (params.targetStatus === PurchaseOrderStatus.ISSUED) {
    const tenant = await getCurrentTenant()
    const tenantCode = tenant.code

    let supplierCountry: string | null = null
    if (params.order.counterpartyName && params.order.counterpartyName.trim().length > 0) {
      const supplierName = params.order.counterpartyName.trim()
      const supplier = await params.prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: 'insensitive' } },
        select: { address: true, bankingDetails: true },
      })

      supplierCountry = deriveSupplierCountry(supplier ? supplier.address : null)

      const banking = supplier ? supplier.bankingDetails : null
      if (!banking || banking.trim().length === 0) {
        recordGateIssue(
          issues,
          'details.counterpartyName',
          'Supplier banking information is required to issue a PO'
        )
      }
    }

    if (!params.order.counterpartyName || params.order.counterpartyName.trim().length === 0) {
      recordGateIssue(issues, 'details.counterpartyName', 'Supplier is required')
    }
    if (!params.order.expectedDate) {
      recordGateIssue(issues, 'details.expectedDate', 'Cargo ready date is required')
    }
    if (!params.order.incoterms || params.order.incoterms.trim().length === 0) {
      recordGateIssue(issues, 'details.incoterms', 'Incoterms is required')
    }
    if (!params.order.paymentTerms || params.order.paymentTerms.trim().length === 0) {
      recordGateIssue(issues, 'details.paymentTerms', 'Payment terms is required')
    }

    if (activeLines.length === 0) {
      recordGateIssue(issues, 'cargo.lines', 'At least one cargo line is required')
    }

    for (const line of activeLines) {
      const commodityCode = typeof line.commodityCode === 'string' ? line.commodityCode.trim() : ''
      if (!commodityCode) {
        recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code is required')
      } else if (!validateCommodityCodeFormat({ tenantCode, commodityCode })) {
        recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code format is invalid')
      }

      if (!supplierCountry) {
        recordGateIssue(issues, `cargo.lines.${line.id}.countryOfOrigin`, 'Supplier country is required')
      }

      const material = typeof line.material === 'string' ? line.material.trim() : ''
      if (!material) {
        recordGateIssue(issues, `cargo.lines.${line.id}.material`, 'Material is required')
      }

      const netWeightKg = line.netWeightKg ? Number(line.netWeightKg) : null
      if (netWeightKg === null || !Number.isFinite(netWeightKg) || netWeightKg <= 0) {
        recordGateIssue(issues, `cargo.lines.${line.id}.netWeightKg`, 'Net weight is required')
      }

      const grossWeightKg = line.cartonWeightKg ? Number(line.cartonWeightKg) : null
      if (grossWeightKg === null || !Number.isFinite(grossWeightKg) || grossWeightKg <= 0) {
        recordGateIssue(issues, `cargo.lines.${line.id}.cartonWeightKg`, 'Gross weight is required')
      }

      const cartonVolumeCbm =
        computeCartonVolumeCbm({
          cartonSide1Cm: line.cartonSide1Cm,
          cartonSide2Cm: line.cartonSide2Cm,
          cartonSide3Cm: line.cartonSide3Cm,
          cartonDimensionsCm: line.cartonDimensionsCm,
        }) ?? null
      if (cartonVolumeCbm === null) {
        recordGateIssue(issues, `cargo.lines.${line.id}.cartonDimensions`, 'Carton dimensions are required')
      }

      if (!Number.isInteger(line.unitsOrdered) || !Number.isInteger(line.unitsPerCarton)) {
        recordGateIssue(issues, `cargo.lines.${line.id}.unitsPerCarton`, 'Units per carton is required')
      } else if (line.unitsOrdered % line.unitsPerCarton !== 0) {
        recordGateIssue(
          issues,
          `cargo.lines.${line.id}.unitsPerCarton`,
          'Units must be divisible by units per carton'
        )
      }

      const totalCost = line.totalCost ? Number(line.totalCost) : null
      if (totalCost === null || !Number.isFinite(totalCost)) {
        recordGateIssue(issues, `costs.lines.${line.id}.totalCost`, 'Targeted product cost is required')
      }
    }


  }

  if (params.targetStatus === PurchaseOrderStatus.MANUFACTURING) {
    const tenant = await getCurrentTenant()
    const tenantCode = tenant.code

    let supplierCountry: string | null = null
    if (params.order.counterpartyName && params.order.counterpartyName.trim().length > 0) {
      const supplierName = params.order.counterpartyName.trim()
      const supplier = await params.prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: 'insensitive' } },
        select: { address: true },
      })

      supplierCountry = deriveSupplierCountry(supplier ? supplier.address : null)
    }

    await requireLinePiDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      activeLines,
      issues,
    })

    for (const line of activeLines) {
      const commodityCode = typeof line.commodityCode === 'string' ? line.commodityCode.trim() : ''
      if (!commodityCode) {
        recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code is required')
      } else if (!validateCommodityCodeFormat({ tenantCode, commodityCode })) {
        recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code format is invalid')
      }

      if (!supplierCountry) {
        recordGateIssue(issues, `cargo.lines.${line.id}.countryOfOrigin`, 'Supplier country is required')
      }

      const material = typeof line.material === 'string' ? line.material.trim() : ''
      if (!material) {
        recordGateIssue(issues, `cargo.lines.${line.id}.material`, 'Material is required')
      }

      const netWeightKg = line.netWeightKg ? Number(line.netWeightKg) : null
      if (netWeightKg === null || !Number.isFinite(netWeightKg) || netWeightKg <= 0) {
        recordGateIssue(issues, `cargo.lines.${line.id}.netWeightKg`, 'Net weight is required')
      }

      const grossWeightKg = line.cartonWeightKg ? Number(line.cartonWeightKg) : null
      if (grossWeightKg === null || !Number.isFinite(grossWeightKg) || grossWeightKg <= 0) {
        recordGateIssue(issues, `cargo.lines.${line.id}.cartonWeightKg`, 'Gross weight is required')
      }

      const cartonVolumeCbm =
        computeCartonVolumeCbm({
          cartonSide1Cm: line.cartonSide1Cm,
          cartonSide2Cm: line.cartonSide2Cm,
          cartonSide3Cm: line.cartonSide3Cm,
          cartonDimensionsCm: line.cartonDimensionsCm,
        }) ?? null
      if (cartonVolumeCbm === null) {
        recordGateIssue(issues, `cargo.lines.${line.id}.cartonDimensions`, 'Carton dimensions are required')
      }

      if (!Number.isInteger(line.unitsOrdered) || !Number.isInteger(line.unitsPerCarton)) {
        recordGateIssue(issues, `cargo.lines.${line.id}.unitsPerCarton`, 'Units per carton is required')
      } else if (line.unitsOrdered % line.unitsPerCarton !== 0) {
        recordGateIssue(
          issues,
          `cargo.lines.${line.id}.unitsPerCarton`,
          'Units must be divisible by units per carton'
        )
      }

      const totalCost = line.totalCost ? Number(line.totalCost) : null
      if (totalCost === null || !Number.isFinite(totalCost)) {
        recordGateIssue(issues, `costs.lines.${line.id}.totalCost`, 'Targeted product cost is required')
      }
    }

    const manufacturingStartDate = resolveOrderDate(
      'manufacturingStartDate',
      params.stageData,
      params.order,
      'Manufacturing start date'
    )
    if (!manufacturingStartDate) {
      recordGateIssue(issues, 'details.manufacturingStartDate', 'Manufacturing start date is required')
    }
  }

  if (params.targetStatus === PurchaseOrderStatus.OCEAN) {
    await requireLinePiDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      activeLines,
      issues,
    })

    const allocationRows = Array.isArray(params.stageData.splitAllocations)
      ? params.stageData.splitAllocations
      : null
    const allocationsByLineId = new Map<string, number>()
    if (allocationRows) {
      for (const row of allocationRows) {
        const lineId = typeof row?.lineId === 'string' ? row.lineId : ''
        const shipNowCartons = typeof row?.shipNowCartons === 'number' ? row.shipNowCartons : null
        if (!lineId) continue
        if (shipNowCartons === null) continue
        allocationsByLineId.set(lineId, shipNowCartons)
      }
    }

    let totalShipNowCartons = 0
    for (const line of activeLines) {
      const shipNowCartons = allocationsByLineId.get(line.id)
      if (shipNowCartons === undefined) {
        recordGateIssue(
          issues,
          `cargo.lines.${line.id}.shipNowCartons`,
          'Dispatch cartons (ship now) is required'
        )
        continue
      }

      if (!Number.isInteger(shipNowCartons) || shipNowCartons < 0) {
        recordGateIssue(
          issues,
          `cargo.lines.${line.id}.shipNowCartons`,
          'Dispatch cartons (ship now) must be a non-negative integer'
        )
        continue
      }

      const range = resolveLineCartonRange(line)
      const availableCartons = range.end - range.start + 1

      if (shipNowCartons > availableCartons) {
        recordGateIssue(
          issues,
          `cargo.lines.${line.id}.shipNowCartons`,
          `Dispatch cartons (ship now) cannot exceed ${availableCartons}`
        )
        continue
      }

      totalShipNowCartons += shipNowCartons
    }

    if (totalShipNowCartons <= 0) {
      recordGateIssue(issues, 'cargo.lines', 'At least one carton must be dispatched')
    }

    const artworkDocTypes = activeLines.map(
      line => `box_artwork_${line.skuCode.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    )
    await requireDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      stage: PurchaseOrderDocumentStage.MANUFACTURING,
      documentTypes: [...artworkDocTypes, 'inspection_report'],
      issues,
      issueKeyPrefix: 'documents',
      issueLabel: (docType) => {
        if (docType === 'inspection_report') return 'Inspection report'
        const skuCode = docType.replace(/^box_artwork_/, '').toUpperCase()
        return `Box artwork (${skuCode})`
      },
    })
  }

  if (params.targetStatus === PurchaseOrderStatus.WAREHOUSE) {
    const resolveOrderString = (key: keyof StageTransitionInput & keyof PurchaseOrder): string | null => {
      if (Object.prototype.hasOwnProperty.call(params.stageData, key)) {
        const value = params.stageData[key]
        if (typeof value !== 'string') return null
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
      }

      const existing = params.order[key]
      if (typeof existing !== 'string') return null
      const trimmed = existing.trim()
      return trimmed.length > 0 ? trimmed : null
    }

    const oceanFields: Array<{ key: keyof PurchaseOrder; issueKey: string; label: string }> = [
      { key: 'houseBillOfLading', issueKey: 'details.houseBillOfLading', label: 'Bill of lading reference' },
      { key: 'commercialInvoiceNumber', issueKey: 'details.commercialInvoiceNumber', label: 'Commercial invoice number' },
      { key: 'packingListRef', issueKey: 'details.packingListRef', label: 'Packing list reference' },
      { key: 'vesselName', issueKey: 'details.vesselName', label: 'Vessel name' },
      { key: 'portOfLoading', issueKey: 'details.portOfLoading', label: 'Port of loading' },
      { key: 'portOfDischarge', issueKey: 'details.portOfDischarge', label: 'Port of discharge' },
    ]

    for (const field of oceanFields) {
      const value = resolveOrderString(field.key as keyof StageTransitionInput & keyof PurchaseOrder)
      if (!value) {
        recordGateIssue(issues, field.issueKey, `${field.label} is required`)
      }
    }

    const transactionCertNumber = resolveOrderString('transactionCertNumber')
    if (!transactionCertNumber) {
      recordGateIssue(issues, 'documents.transactionCertNumber', 'TC number is required')
    }

    await requireDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      stage: PurchaseOrderDocumentStage.OCEAN,
      documentTypes: ['commercial_invoice', 'bill_of_lading', 'packing_list', 'grs_tc'],
      issues,
      issueKeyPrefix: 'documents',
      issueLabel: (docType) => (docType === 'grs_tc' ? 'GRS TC' : docType.replace(/_/g, ' ')),
    })

    const hasForwardingCost = await params.prisma.purchaseOrderForwardingCost.findFirst({
      where: { purchaseOrderId: params.order.id },
      select: { id: true },
    })
    if (!hasForwardingCost) {
      recordGateIssue(issues, 'costs.forwarding', 'Freight (forwarding) cost is required')
    }
  }

  if (Object.keys(issues).length > 0) {
    throw new StageGateError('Missing required information', issues)
  }
}

function resolveDateValue(value: Date | string | undefined | null, label: string): Date | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' && value.trim().length === 0) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${label}`)
  }
  return date
}

function resolveOrderDate(
  key: keyof StageTransitionInput & keyof PurchaseOrder,
  stageData: StageTransitionInput,
  order: PurchaseOrder,
  label: string
): Date | null {
  if (Object.prototype.hasOwnProperty.call(stageData, key)) {
    return resolveDateValue(stageData[key] as Date | string | undefined | null, label)
  }
  return resolveDateValue(order[key] as unknown as Date | string | undefined | null, label)
}

function assertNotEarlierThan(
  earlierLabel: string,
  earlier: Date | null,
  laterLabel: string,
  later: Date | null
) {
  if (!earlier || !later) return
  if (later < earlier) {
    throw new ValidationError(`${laterLabel} cannot be earlier than ${earlierLabel}`)
  }
}

function pickBaseline(
  candidates: Array<{ label: string; date: Date | null }>
): { label: string; date: Date } | null {
  for (const candidate of candidates) {
    if (candidate.date) return { label: candidate.label, date: candidate.date }
  }
  return null
}

function validateStageDateOrdering(
  targetStatus: PurchaseOrderStatus,
  stageData: StageTransitionInput,
  order: PurchaseOrder
) {
  const manufacturingStartDate = resolveOrderDate(
    'manufacturingStartDate',
    stageData,
    order,
    'Manufacturing start date'
  )
  const expectedCompletionDate = resolveOrderDate(
    'expectedCompletionDate',
    stageData,
    order,
    'Expected completion date'
  )
  const actualCompletionDate = resolveOrderDate(
    'actualCompletionDate',
    stageData,
    order,
    'Actual completion date'
  )

  const manufacturingBaseline = pickBaseline([
    { label: 'Actual completion date', date: actualCompletionDate },
    { label: 'Expected completion date', date: expectedCompletionDate },
    { label: 'Manufacturing start date', date: manufacturingStartDate },
  ])

  const estimatedDeparture = resolveOrderDate(
    'estimatedDeparture',
    stageData,
    order,
    'Estimated departure'
  )
  const estimatedArrival = resolveOrderDate(
    'estimatedArrival',
    stageData,
    order,
    'Estimated arrival'
  )
  const actualDeparture = resolveOrderDate('actualDeparture', stageData, order, 'Actual departure')
  const actualArrival = resolveOrderDate('actualArrival', stageData, order, 'Actual arrival')

  const inboundBaseline = pickBaseline([
    { label: 'Actual arrival', date: actualArrival },
    { label: 'Estimated arrival', date: estimatedArrival },
    { label: 'Actual departure', date: actualDeparture },
    { label: 'Estimated departure', date: estimatedDeparture },
    {
      label: manufacturingBaseline?.label ?? 'Manufacturing stage',
      date: manufacturingBaseline?.date ?? null,
    },
  ])

  const customsClearedDate = resolveOrderDate(
    'customsClearedDate',
    stageData,
    order,
    'Customs cleared date'
  )
  const receivedDate = resolveOrderDate('receivedDate', stageData, order, 'Received date')

  if (targetStatus === PurchaseOrderStatus.MANUFACTURING) {
    assertNotEarlierThan(
      'Manufacturing start date',
      manufacturingStartDate,
      'Expected completion date',
      expectedCompletionDate
    )
    assertNotEarlierThan(
      'Manufacturing start date',
      manufacturingStartDate,
      'Actual completion date',
      actualCompletionDate
    )
    return
  }

  if (targetStatus === PurchaseOrderStatus.OCEAN) {
    if (manufacturingBaseline) {
      assertNotEarlierThan(
        manufacturingBaseline.label,
        manufacturingBaseline.date,
        'Estimated departure',
        estimatedDeparture
      )
      assertNotEarlierThan(
        manufacturingBaseline.label,
        manufacturingBaseline.date,
        'Actual departure',
        actualDeparture
      )
    }

    assertNotEarlierThan(
      'Estimated departure',
      estimatedDeparture,
      'Estimated arrival',
      estimatedArrival
    )
    assertNotEarlierThan('Actual departure', actualDeparture, 'Actual arrival', actualArrival)
    return
  }

  if (targetStatus === PurchaseOrderStatus.WAREHOUSE) {
    if (inboundBaseline) {
      assertNotEarlierThan(
        inboundBaseline.label,
        inboundBaseline.date,
        'Customs cleared date',
        customsClearedDate
      )
      assertNotEarlierThan(
        inboundBaseline.label,
        inboundBaseline.date,
        'Received date',
        receivedDate
      )
    }

    assertNotEarlierThan('Customs cleared date', customsClearedDate, 'Received date', receivedDate)
    return
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseDimensionsCm(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null
  const matches = value.match(/(\d+(\.\d+)?)/g)
  if (!matches || matches.length < 3) return null
  const [a, b, c] = matches.slice(0, 3).map(n => Number(n))
  if (![a, b, c].every(n => Number.isFinite(n) && n > 0)) return null
  return [a, b, c]
}

function resolveLineCartonRange(line: Pick<
  PurchaseOrderLine,
  'id' | 'quantity' | 'cartonRangeStart' | 'cartonRangeEnd' | 'cartonRangeTotal'
>): { start: number; end: number; total: number } {
  const start = line.cartonRangeStart ?? null
  const end = line.cartonRangeEnd ?? null
  const total = line.cartonRangeTotal ?? null

  if (start === null && end === null && total === null) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ValidationError(`Invalid carton quantity for line ${line.id}`)
    }
    return { start: 1, end: line.quantity, total: line.quantity }
  }

  if (start === null || end === null || total === null) {
    throw new ValidationError(`Carton range is incomplete for line ${line.id}`)
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || !Number.isInteger(total)) {
    throw new ValidationError(`Carton range is invalid for line ${line.id}`)
  }
  if (start <= 0 || end < start) {
    throw new ValidationError(`Carton range is invalid for line ${line.id}`)
  }
  if (total <= 0 || end > total) {
    throw new ValidationError(`Carton range is invalid for line ${line.id}`)
  }
  const expectedQuantity = end - start + 1
  if (expectedQuantity !== line.quantity) {
    throw new ValidationError(`Carton range does not match quantity for line ${line.id}`)
  }

  return { start, end, total }
}

function computeCartonVolumeCbm(input: {
  cartonSide1Cm?: unknown
  cartonSide2Cm?: unknown
  cartonSide3Cm?: unknown
  cartonDimensionsCm?: string | null
}): number | null {
  const side1Cm = toFiniteNumber(input.cartonSide1Cm)
  const side2Cm = toFiniteNumber(input.cartonSide2Cm)
  const side3Cm = toFiniteNumber(input.cartonSide3Cm)

  if (side1Cm && side2Cm && side3Cm) {
    return (side1Cm * side2Cm * side3Cm) / 1_000_000
  }

  const parsed = parseDimensionsCm(input.cartonDimensionsCm)
  if (!parsed) return null
  const [parsedSide1, parsedSide2, parsedSide3] = parsed
  return (parsedSide1 * parsedSide2 * parsedSide3) / 1_000_000
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

async function computeManufacturingCargoTotals(
  lines: PurchaseOrderLine[]
): Promise<{
  totalCartons: number
  totalPallets: number | null
  totalWeightKg: number | null
  totalVolumeCbm: number | null
}> {
  const activeLines = lines.filter(line => line.status !== PurchaseOrderLineStatus.CANCELLED)
  const totalCartons = activeLines.reduce((sum, line) => sum + line.quantity, 0)

  if (activeLines.length === 0) {
    return { totalCartons, totalPallets: null, totalWeightKg: null, totalVolumeCbm: null }
  }

  let totalPallets = 0
  let palletsComplete = true
  let totalWeightKg = 0
  let weightComplete = true
  let totalVolumeCbm = 0
  let volumeComplete = true

  for (const line of activeLines) {
    const shippingCartonsPerPallet = line.shippingCartonsPerPallet ?? null
    if (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0) {
      palletsComplete = false
    } else {
      totalPallets += Math.ceil(line.quantity / shippingCartonsPerPallet)
    }

    const cartonWeightKg = toFiniteNumber(line.cartonWeightKg)
    if (!cartonWeightKg || cartonWeightKg <= 0) {
      weightComplete = false
    } else {
      totalWeightKg += line.quantity * cartonWeightKg
    }

    const cartonVolumeCbm =
      computeCartonVolumeCbm({
        cartonSide1Cm: line.cartonSide1Cm,
        cartonSide2Cm: line.cartonSide2Cm,
        cartonSide3Cm: line.cartonSide3Cm,
        cartonDimensionsCm: line.cartonDimensionsCm,
      }) ?? null

    if (!cartonVolumeCbm || cartonVolumeCbm <= 0) {
      volumeComplete = false
    } else {
      totalVolumeCbm += line.quantity * cartonVolumeCbm
    }
  }

  return {
    totalCartons,
    totalPallets: palletsComplete ? totalPallets : null,
    totalWeightKg: weightComplete ? roundTo(totalWeightKg, 2) : null,
    totalVolumeCbm: volumeComplete ? roundTo(totalVolumeCbm, 3) : null,
  }
}

/**
 * Generate the next PO reference in sequence.
 * Format: PO-<number>-<SKU_GROUP>
 */
export async function generateOrderNumber(skuGroup: string): Promise<string> {
  const prisma = await getTenantPrisma()
  const nextSequence = await getNextPurchaseOrderSequence(prisma, skuGroup)
  return buildPurchaseOrderReference(nextSequence, skuGroup)
}

export interface CreatePurchaseOrderLineInput {
  skuCode: string
  skuDescription?: string
  piNumber?: string
  commodityCode?: string
  countryOfOrigin?: string
  netWeightKg?: number
  cartonWeightKg?: number
  cartonSide1Cm?: number
  cartonSide2Cm?: number
  cartonSide3Cm?: number
  material?: string
  unitsOrdered: number
  unitsPerCarton: number
  totalCost?: number
  currency?: string
  notes?: string
}

/**
 * Create a new Purchase Order in ISSUED status
 * Warehouse is NOT required at this stage - it's selected at Stage 4 (WAREHOUSE)
 */
export async function createPurchaseOrder(
  input: {
    counterpartyName?: string
    expectedDate?: Date | string | null
    incoterms?: string | null
    paymentTerms?: string | null
    notes?: string
    lines?: CreatePurchaseOrderLineInput[]
  },
  user: UserContext
): Promise<PurchaseOrderWithLines> {
  const prisma = await getTenantPrisma()
  type LineSkuRecord = Prisma.SkuGetPayload<{
    select: {
      id: true
      skuCode: true
      skuGroup: true
      description: true
      cartonDimensionsCm: true
      cartonSide1Cm: true
      cartonSide2Cm: true
      cartonSide3Cm: true
      cartonWeightKg: true
      packagingType: true
    }
  }>

  let skuRecordsForLines: LineSkuRecord[] = []
  let orderSkuGroup: string | null = null

  const computeCartonsOrdered = (line: {
    skuCode: string
    unitsOrdered: number
    unitsPerCarton: number
  }) => {
    const unitsOrdered = Number(line.unitsOrdered)
    const unitsPerCarton = Number(line.unitsPerCarton)

    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) {
      throw new ValidationError(`Units ordered must be a positive integer for SKU ${line.skuCode}`)
    }

    if (!Number.isInteger(unitsPerCarton) || unitsPerCarton <= 0) {
      throw new ValidationError(`Units per carton must be a positive integer for SKU ${line.skuCode}`)
    }

    return Math.ceil(unitsOrdered / unitsPerCarton)
  }

  const counterpartyName =
    typeof input.counterpartyName === 'string' && input.counterpartyName.trim().length > 0
      ? input.counterpartyName.trim()
      : null
  if (!counterpartyName) {
    throw new ValidationError('Supplier is required')
  }

  const expectedDate = resolveDateValue(input.expectedDate, 'Cargo Ready Date')
  if (!expectedDate) {
    throw new ValidationError('Cargo Ready Date is required')
  }

  const incoterms =
    typeof input.incoterms === 'string' && input.incoterms.trim().length > 0
      ? input.incoterms.trim().toUpperCase()
      : null
  if (!incoterms) {
    throw new ValidationError('Incoterms is required')
  }

  const paymentTerms =
    typeof input.paymentTerms === 'string' && input.paymentTerms.trim().length > 0
      ? input.paymentTerms.trim()
      : null
  if (!paymentTerms) {
    throw new ValidationError('Payment Terms is required')
  }

  if (!input.lines || input.lines.length === 0) {
    throw new ValidationError('At least one line item is required')
  }

  if (input.lines && input.lines.length > 0) {
    const normalizedLines = input.lines.map(line => ({
      ...line,
      skuCode: line.skuCode.trim(),
    }))

    const keySet = new Set<string>()
    for (const line of normalizedLines) {
      if (!line.skuCode) {
        throw new ValidationError('SKU code is required for all line items')
      }

      const key = line.skuCode.toLowerCase()
      if (keySet.has(key)) {
        throw new ValidationError(
          `Duplicate SKU line detected: ${line.skuCode}. Combine quantities into a single line.`
        )
      }
      keySet.add(key)

      if (typeof line.currency !== 'string' || line.currency.trim().length === 0) {
        throw new ValidationError(`Currency is required for SKU ${line.skuCode}`)
      }

      computeCartonsOrdered({
        skuCode: line.skuCode,
        unitsOrdered: line.unitsOrdered,
        unitsPerCarton: line.unitsPerCarton,
      })
    }

    const skuCodes = Array.from(new Set(normalizedLines.map(line => line.skuCode)))
    const skus = await prisma.sku.findMany({
      where: { skuCode: { in: skuCodes } },
      select: {
        id: true,
        skuCode: true,
        skuGroup: true,
        description: true,
        cartonDimensionsCm: true,
        cartonSide1Cm: true,
        cartonSide2Cm: true,
        cartonSide3Cm: true,
        cartonWeightKg: true,
        packagingType: true,
      },
    })
    const skuByCode = new Map(skus.map(sku => [sku.skuCode, sku]))

    for (const line of normalizedLines) {
      if (!skuByCode.has(line.skuCode)) {
        throw new ValidationError(`SKU ${line.skuCode} not found. Create the SKU first.`)
      }
    }

    const skuGroups = new Set<string>()
    for (const skuRecord of skus) {
      if (typeof skuRecord.skuGroup !== 'string' || skuRecord.skuGroup.trim().length === 0) {
        throw new ValidationError(
          `SKU ${skuRecord.skuCode} is missing SKU group. Set SKU group in Config → Products before creating this PO.`
        )
      }
      skuGroups.add(normalizeSkuGroup(skuRecord.skuGroup))
    }

    if (skuGroups.size !== 1) {
      throw new ValidationError('All SKUs in a purchase order must share one SKU group')
    }

    const [resolvedSkuGroup] = Array.from(skuGroups)
    if (!resolvedSkuGroup) {
      throw new ValidationError('SKU group is required')
    }
    orderSkuGroup = resolvedSkuGroup

    input.lines = normalizedLines
    skuRecordsForLines = skus
  }

  const MAX_ORDER_NUMBER_ATTEMPTS = 5
  let order: PurchaseOrderWithLines | null = null

  if (!orderSkuGroup) {
    throw new ValidationError('SKU group is required')
  }

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const orderNumber = await generateOrderNumber(orderSkuGroup)
    const generatedOrderReference = parseOrderReference(orderNumber)
    if (!generatedOrderReference) {
      throw new ValidationError('Unable to generate a valid PO reference')
    }
    const referenceAlreadyUsed = await isPurchaseOrderReferenceUsedAcrossTenants(orderNumber)
    if (referenceAlreadyUsed) {
      continue
    }

	    try {
		  order = await prisma.$transaction(async tx => {
		      const supplier = await tx.supplier.findFirst({
		        where: { name: { equals: counterpartyName, mode: 'insensitive' } },
		        select: { name: true, address: true },
		      })
		      if (!supplier) {
		        throw new ValidationError(
		          `Supplier ${counterpartyName} not found. Create it in Config → Suppliers first.`
		        )
		      }
	      const counterpartyNameCanonical = supplier.name
	      const counterpartyAddress = supplier.address ?? null

	      const skuByCode = new Map(skuRecordsForLines.map(sku => [sku.skuCode.toLowerCase(), sku]))
        const now = new Date()

			    return tx.purchaseOrder.create({
			      data: {
			        orderNumber,
              poNumber: orderNumber,
                skuGroup: generatedOrderReference.skuGroup,
			        type: 'PURCHASE',
			        status: PurchaseOrderStatus.ISSUED,
		        counterpartyName: counterpartyNameCanonical,
		        counterpartyAddress,
	        expectedDate,
	        incoterms,
	        paymentTerms,
	        notes: input.notes,
	        createdById: user.id,
	        createdByName: user.name,
          rfqApprovedAt: now,
          rfqApprovedById: user.id,
          rfqApprovedByName: user.name,
	        isLegacy: false,
	        // Create lines if provided
	        lines:
	          input.lines && input.lines.length > 0
                ? {
                    create: input.lines.map(line => {
                      const skuRecord = skuByCode.get(line.skuCode.trim().toLowerCase())

                      const baseDimensionsCm = skuRecord?.cartonDimensionsCm ?? null
                      const baseTriplet = resolveDimensionTripletCm({
                        side1Cm: skuRecord?.cartonSide1Cm ?? null,
                        side2Cm: skuRecord?.cartonSide2Cm ?? null,
                        side3Cm: skuRecord?.cartonSide3Cm ?? null,
                        legacy: baseDimensionsCm,
                      })
                      const overrideTriplet = resolveDimensionTripletCm({
                        side1Cm: line.cartonSide1Cm ?? null,
                        side2Cm: line.cartonSide2Cm ?? null,
                        side3Cm: line.cartonSide3Cm ?? null,
                        legacy: null,
                      })
                      const chosenTriplet = overrideTriplet ?? baseTriplet
                      const dimensionData = chosenTriplet
                        ? {
                            cartonDimensionsCm: formatDimensionTripletCm(chosenTriplet),
                            cartonSide1Cm: new Prisma.Decimal(chosenTriplet.side1Cm.toFixed(2)),
                            cartonSide2Cm: new Prisma.Decimal(chosenTriplet.side2Cm.toFixed(2)),
                            cartonSide3Cm: new Prisma.Decimal(chosenTriplet.side3Cm.toFixed(2)),
                          }
                        : {
                            cartonDimensionsCm: baseDimensionsCm,
                            cartonSide1Cm: skuRecord?.cartonSide1Cm ?? null,
                            cartonSide2Cm: skuRecord?.cartonSide2Cm ?? null,
                            cartonSide3Cm: skuRecord?.cartonSide3Cm ?? null,
                          }

                      const overrideCartonWeightKg =
                        typeof line.cartonWeightKg === 'number' && Number.isFinite(line.cartonWeightKg)
                          ? new Prisma.Decimal(line.cartonWeightKg.toFixed(3))
                          : null

                      return {
                        lotRef: buildLotReference(
                          generatedOrderReference.sequence,
                          generatedOrderReference.skuGroup,
                          line.skuCode
                        ),
                        skuDescription:
                          typeof line.skuDescription === 'string' && line.skuDescription.trim()
                            ? line.skuDescription
                            : skuRecord?.description ?? '',
                        ...dimensionData,
                        cartonWeightKg: overrideCartonWeightKg ?? skuRecord?.cartonWeightKg ?? null,
                        packagingType: skuRecord?.packagingType ?? null,
                        storageCartonsPerPallet: null,
                        shippingCartonsPerPallet: null,
                        unitsOrdered: line.unitsOrdered,
                        unitsPerCarton: line.unitsPerCarton,
                        skuCode: line.skuCode,
                        productionDate: null,
                        piNumber:
                          typeof line.piNumber === 'string' && line.piNumber.trim().length > 0
                            ? normalizePiNumber(line.piNumber)
                            : null,
                        commodityCode:
                          typeof line.commodityCode === 'string' && line.commodityCode.trim().length > 0
                            ? line.commodityCode.trim()
                            : null,
                        countryOfOrigin:
                          typeof line.countryOfOrigin === 'string' && line.countryOfOrigin.trim().length > 0
                            ? line.countryOfOrigin.trim()
                            : null,
                        netWeightKg:
                          typeof line.netWeightKg === 'number' && Number.isFinite(line.netWeightKg)
                            ? new Prisma.Decimal(line.netWeightKg.toFixed(3))
                            : null,
                        material:
                          typeof line.material === 'string' && line.material.trim().length > 0
                            ? line.material.trim()
                            : null,
                        quantity: computeCartonsOrdered({
                          skuCode: line.skuCode,
                          unitsOrdered: line.unitsOrdered,
                          unitsPerCarton: line.unitsPerCarton,
                        }),
                        totalCost:
                          typeof line.totalCost === 'number' && Number.isFinite(line.totalCost)
                            ? Math.abs(line.totalCost).toFixed(2)
                            : undefined,
                        unitCost:
                          typeof line.totalCost === 'number' &&
                          Number.isFinite(line.totalCost) &&
                          line.unitsOrdered > 0
                            ? (Number(Math.abs(line.totalCost).toFixed(2)) / line.unitsOrdered).toFixed(2)
                            : undefined,
                        currency: line.currency.trim().toUpperCase(),
                        lineNotes: line.notes,
                        status: 'PENDING',
                      }
                    }),
                  }
                : undefined,
          },
          include: {
            lines: true,
          },
        })
      })
      break
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        continue
      }
      throw error
    }
  }

  if (!order) {
    throw new ValidationError('Unable to generate a unique order number. Please retry.')
  }

	  await auditLog({
	    userId: user.id,
	    action: 'CREATE',
	    entityType: 'PurchaseOrder',
	    entityId: order.id,
	    data: { orderNumber: order.orderNumber, status: 'ISSUED', lineCount: input.lines?.length ?? 0 },
	  })

  return order
}

/**
 * Transition a Purchase Order to a new stage
 */
export async function transitionPurchaseOrderStage(
  orderId: string,
  targetStatus: PurchaseOrderStatus,
  stageData: StageTransitionInput,
  user: UserContext
): Promise<PurchaseOrder> {
  const prisma = await getTenantPrisma()

  // Get the current order
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: orderId },
    include: { lines: true },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${orderId}`)
  }

  // Check if order is legacy
  if (order.isLegacy) {
    throw new ConflictError('Cannot transition legacy orders. They are archived.')
  }

  const rawStatus = order.status as PurchaseOrderStatus
  const currentStatus = normalizeWorkflowStatus(rawStatus)
  const isInPlaceUpdate = targetStatus === currentStatus

  if (!isInPlaceUpdate && targetStatus === PurchaseOrderStatus.SHIPPED) {
    throw new ValidationError(
      'Purchase orders no longer ship inventory. Create a fulfillment order to ship stock.'
    )
  }

  if (!isInPlaceUpdate && !isValidTransition(currentStatus, targetStatus)) {
    const validTargets = getValidNextStages(currentStatus)
    throw new ValidationError(
      `Invalid transition from ${currentStatus} to ${targetStatus}. ` +
        `Valid targets: ${validTargets.length > 0 ? validTargets.join(', ') : 'none'}`
    )
  }

  if (isInPlaceUpdate) {
    const canEdit = await hasPermission(user.id, 'po.edit')
    if (!canEdit && !isSuperAdmin(user.email)) {
      throw new ValidationError(`You don't have permission to edit purchase orders`)
    }
  } else if (targetStatus === PurchaseOrderStatus.CLOSED) {
    const canCancel = await hasPermission(user.id, 'po.cancel')
    if (!canCancel && !isSuperAdmin(user.email)) {
      throw new ValidationError(`You don't have permission to close purchase orders`)
    }
  } else {
    const canApprove = await canApproveStageTransition(user.id, currentStatus, targetStatus)

    if (!canApprove && !isSuperAdmin(user.email)) {
      throw new ValidationError(
        `You don't have permission to approve the transition from ${currentStatus} to ${targetStatus}`
      )
    }
  }

  if (!isInPlaceUpdate && targetStatus === PurchaseOrderStatus.CLOSED) {
    const storageRecalcInputs = await prisma.inventoryTransaction.findMany({
      where: { purchaseOrderId: order.id },
      select: {
        warehouseCode: true,
        warehouseName: true,
        skuCode: true,
        skuDescription: true,
        lotRef: true,
        transactionDate: true,
      },
    })

    const updatedOrder = await prisma.$transaction(async tx => {
      await tx.inventoryTransaction.deleteMany({
        where: { purchaseOrderId: order.id },
      })

      await tx.purchaseOrderLine.updateMany({
        where: { purchaseOrderId: order.id },
        data: {
          status: PurchaseOrderLineStatus.CANCELLED,
          postedQuantity: 0,
          quantityReceived: 0,
        },
      })

      return tx.purchaseOrder.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          postedAt: null,
        },
        include: { lines: true },
      })
    })

    await auditLog({
      userId: user.id,
      action: 'STATUS_TRANSITION',
      entityType: 'PurchaseOrder',
      entityId: orderId,
      oldValue: { status: currentStatus },
      newValue: {
        status: targetStatus,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        approvedBy: user.name,
      },
    })

    await recalculateStorageLedgerForTransactions(
      storageRecalcInputs.map(transaction => ({
        warehouseCode: transaction.warehouseCode,
        warehouseName: transaction.warehouseName,
        skuCode: transaction.skuCode,
        skuDescription: transaction.skuDescription,
        lotRef: transaction.lotRef,
        transactionDate: transaction.transactionDate,
      }))
    )

    return updatedOrder
  }

  const filteredStageData = isInPlaceUpdate
    ? stageData
    : filterStageDataForTarget(currentStatus, stageData)

  if (!isInPlaceUpdate) {
    await validateTransitionGate({
      prisma,
      order,
      targetStatus,
      stageData: filteredStageData,
    })

    validateStageDateOrdering(targetStatus, filteredStageData, order)
  }

  const derivedManufacturingTotals =
    !isInPlaceUpdate && targetStatus === PurchaseOrderStatus.MANUFACTURING
      ? await computeManufacturingCargoTotals(order.lines)
      : null

  if (targetStatus === PurchaseOrderStatus.MANUFACTURING && derivedManufacturingTotals) {
    if (derivedManufacturingTotals.totalCartons <= 0) {
      throw new ValidationError('Cannot advance to manufacturing with no cargo lines')
    }
  }

  const updateData: Prisma.PurchaseOrderUpdateInput = isInPlaceUpdate
    ? {}
    : {
        status: targetStatus,
      }

  if (!isInPlaceUpdate && currentStatus === PurchaseOrderStatus.ISSUED && !order.poNumber) {
    const orderReferenceSeed = resolveOrderReferenceSeed({
      orderNumber: order.orderNumber,
      poNumber: order.poNumber,
      skuGroup: order.skuGroup,
    })
    updateData.poNumber = buildPurchaseOrderReference(orderReferenceSeed.sequence, orderReferenceSeed.skuGroup)
  }

  if (!isInPlaceUpdate && currentStatus === PurchaseOrderStatus.ISSUED && !order.rfqApprovedAt) {
    updateData.rfqApprovedAt = order.createdAt
    updateData.rfqApprovedById = order.createdById
    updateData.rfqApprovedByName = order.createdByName
  }

  if (!isInPlaceUpdate && targetStatus === PurchaseOrderStatus.ISSUED && !order.poNumber) {
    const orderReferenceSeed = resolveOrderReferenceSeed({
      orderNumber: order.orderNumber,
      poNumber: order.poNumber,
      skuGroup: order.skuGroup,
    })
    updateData.poNumber = buildPurchaseOrderReference(
      orderReferenceSeed.sequence,
      orderReferenceSeed.skuGroup
    )
  }

  const warehouseCodeFromStageData =
    typeof filteredStageData.warehouseCode === 'string' ? filteredStageData.warehouseCode : undefined

  if (warehouseCodeFromStageData !== undefined) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { code: warehouseCodeFromStageData },
      select: { name: true },
    })

    if (!warehouse) {
      throw new ValidationError(`Invalid warehouse code: ${warehouseCodeFromStageData}`)
    }

    filteredStageData.warehouseName = filteredStageData.warehouseName ?? warehouse.name
  }

  applyStageFieldDataToOrderUpdate(updateData, filteredStageData)

  if (derivedManufacturingTotals) {
    if (filteredStageData.totalWeightKg === undefined && derivedManufacturingTotals.totalWeightKg != null) {
      updateData.totalWeightKg = derivedManufacturingTotals.totalWeightKg
    }
    if (filteredStageData.totalVolumeCbm === undefined && derivedManufacturingTotals.totalVolumeCbm != null) {
      updateData.totalVolumeCbm = derivedManufacturingTotals.totalVolumeCbm
    }
    if (filteredStageData.totalCartons === undefined && derivedManufacturingTotals.totalCartons) {
      updateData.totalCartons = derivedManufacturingTotals.totalCartons
    }
    if (filteredStageData.totalPallets === undefined && derivedManufacturingTotals.totalPallets != null) {
      updateData.totalPallets = derivedManufacturingTotals.totalPallets
    }
  }

  if (!isInPlaceUpdate) {
    const existingCommercialInvoiceNumber =
      typeof order.commercialInvoiceNumber === 'string' ? order.commercialInvoiceNumber.trim() : ''
    const shouldGenerateCommercialInvoiceNumber =
      targetStatus === PurchaseOrderStatus.OCEAN && existingCommercialInvoiceNumber.length === 0

    if (shouldGenerateCommercialInvoiceNumber) {
      const orderReferenceSeed = resolveOrderReferenceSeed({
        orderNumber: order.orderNumber,
        poNumber: order.poNumber,
        skuGroup: order.skuGroup,
      })
      const nextCiSequence = await getNextCommercialInvoiceSequence(prisma, orderReferenceSeed.skuGroup)
      updateData.commercialInvoiceNumber = buildCommercialInvoiceReference(
        nextCiSequence,
        orderReferenceSeed.skuGroup
      )
    }
  }

  if (isInPlaceUpdate && Object.keys(updateData).length === 0) {
    return order
  }

  const now = new Date()
  if (!isInPlaceUpdate) {
    switch (targetStatus) {
      case PurchaseOrderStatus.ISSUED:
        updateData.rfqApprovedAt = now
        updateData.rfqApprovedById = user.id
        updateData.rfqApprovedByName = user.name
        break
      case PurchaseOrderStatus.OCEAN:
        updateData.manufacturingApprovedAt = now
        updateData.manufacturingApprovedById = user.id
        updateData.manufacturingApprovedByName = user.name
        break
      case PurchaseOrderStatus.WAREHOUSE:
        updateData.oceanApprovedAt = now
        updateData.oceanApprovedById = user.id
        updateData.oceanApprovedByName = user.name
        break
    }
  }

  const isDispatchTransition =
    !isInPlaceUpdate &&
    currentStatus === PurchaseOrderStatus.MANUFACTURING &&
    targetStatus === PurchaseOrderStatus.OCEAN

  const allocationRows =
    isDispatchTransition && Array.isArray(filteredStageData.splitAllocations)
      ? filteredStageData.splitAllocations
      : null

  type RemainderLineSeed = Omit<Prisma.PurchaseOrderLineCreateManyInput, 'purchaseOrderId'>
  type DispatchSplitPlan = {
    groupId: string
    shippingLineUpdates: Array<{ lineId: string; data: Prisma.PurchaseOrderLineUpdateInput }>
    remainderLineSeeds: RemainderLineSeed[]
    shippingTotals: Awaited<ReturnType<typeof computeManufacturingCargoTotals>>
    remainderTotals: Awaited<ReturnType<typeof computeManufacturingCargoTotals>>
  }

  const buildDispatchSplitPlan = async (): Promise<DispatchSplitPlan | null> => {
    if (!isDispatchTransition || !allocationRows) return null

    const allocationsByLineId = new Map<string, number>()
    for (const row of allocationRows) {
      if (!row) continue
      const lineId = row.lineId
      if (typeof lineId !== 'string' || lineId.trim().length === 0) {
        throw new ValidationError('Dispatch allocation is missing a lineId')
      }
      const shipNowCartons = row.shipNowCartons
      if (typeof shipNowCartons !== 'number' || !Number.isInteger(shipNowCartons) || shipNowCartons < 0) {
        throw new ValidationError(`Dispatch cartons (ship now) is invalid for line ${lineId}`)
      }
      allocationsByLineId.set(lineId, shipNowCartons)
    }

    const activeLines = order.lines.filter(line => line.status !== PurchaseOrderLineStatus.CANCELLED)

    const shippingLineUpdates: Array<{ lineId: string; data: Prisma.PurchaseOrderLineUpdateInput }> = []
    const remainderLineSeeds: RemainderLineSeed[] = []

    let hasRemainder = false

    const shippingLinesForTotals: PurchaseOrderLine[] = []
    const remainderLinesForTotals: PurchaseOrderLine[] = []

    for (const line of activeLines) {
      const shipNowCartons = allocationsByLineId.get(line.id)
      if (shipNowCartons === undefined) {
        throw new ValidationError(`Dispatch allocation is missing for line ${line.id}`)
      }

      const currentRange = resolveLineCartonRange(line)
      const availableCartons = currentRange.end - currentRange.start + 1
      if (shipNowCartons > availableCartons) {
        throw new ValidationError(`Dispatch cartons (ship now) cannot exceed ${availableCartons} for line ${line.id}`)
      }

      const unitCost =
        line.unitCost !== null && line.unitCost !== undefined
          ? new Prisma.Decimal(line.unitCost)
          : line.totalCost !== null && line.totalCost !== undefined && line.unitsOrdered > 0
            ? new Prisma.Decimal(line.totalCost).div(line.unitsOrdered)
            : null

      if (unitCost === null) {
        throw new ValidationError(
          `Missing unit cost for line ${line.skuCode}${line.lotRef ? ` (${line.lotRef})` : ''}`
        )
      }

      const originalTotalCost =
        line.totalCost !== null && line.totalCost !== undefined ? new Prisma.Decimal(line.totalCost) : null
      if (originalTotalCost === null) {
        throw new ValidationError(
          `Missing total cost for line ${line.skuCode}${line.lotRef ? ` (${line.lotRef})` : ''}`
        )
      }

      const shipNowUnits = shipNowCartons * line.unitsPerCarton
      const remainderCartons = availableCartons - shipNowCartons
      const remainderUnits = remainderCartons * line.unitsPerCarton

      const shipNowCostRaw = unitCost.mul(shipNowUnits)
      const shipNowCostRounded =
        shipNowUnits === 0
          ? new Prisma.Decimal('0')
          : shipNowUnits === line.unitsOrdered
            ? originalTotalCost
            : new Prisma.Decimal(shipNowCostRaw.toFixed(2))
      const remainderCostRounded =
        shipNowUnits === 0
          ? originalTotalCost
          : shipNowUnits === line.unitsOrdered
            ? new Prisma.Decimal('0')
            : originalTotalCost.minus(shipNowCostRounded)

      const shipNowRange =
        shipNowCartons === 0
          ? null
          : {
              start: currentRange.start,
              end: currentRange.start + shipNowCartons - 1,
              total: currentRange.total,
            }

      if (shipNowRange && shipNowRange.end > currentRange.end) {
        throw new ValidationError(`Dispatch carton range exceeds available cartons for line ${line.id}`)
      }

      if (remainderCartons > 0) {
        hasRemainder = true
        const remainderRangeStart = shipNowRange ? shipNowRange.end + 1 : currentRange.start

        remainderLineSeeds.push({
          skuCode: line.skuCode,
          skuDescription: line.skuDescription,
          lotRef: line.lotRef,
          productionDate: line.productionDate,
          piNumber: line.piNumber,
          commodityCode: line.commodityCode,
          countryOfOrigin: line.countryOfOrigin,
          netWeightKg: line.netWeightKg,
          material: line.material,
          cartonDimensionsCm: line.cartonDimensionsCm,
          cartonSide1Cm: line.cartonSide1Cm,
          cartonSide2Cm: line.cartonSide2Cm,
          cartonSide3Cm: line.cartonSide3Cm,
          cartonWeightKg: line.cartonWeightKg,
          packagingType: line.packagingType,
          storageCartonsPerPallet: line.storageCartonsPerPallet,
          shippingCartonsPerPallet: line.shippingCartonsPerPallet,
          cartonRangeStart: remainderRangeStart,
          cartonRangeEnd: currentRange.end,
          cartonRangeTotal: currentRange.total,
          unitsOrdered: remainderUnits,
          unitsPerCarton: line.unitsPerCarton,
          quantity: remainderCartons,
          unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
          totalCost: new Prisma.Decimal(remainderCostRounded.toFixed(2)),
          currency: line.currency,
          status: PurchaseOrderLineStatus.PENDING,
          postedQuantity: 0,
          quantityReceived: null,
          lineNotes: line.lineNotes,
        })

        remainderLinesForTotals.push({
          ...line,
          id: line.id,
          status: PurchaseOrderLineStatus.PENDING,
          quantity: remainderCartons,
          unitsOrdered: remainderUnits,
          totalCost: new Prisma.Decimal(remainderCostRounded.toFixed(2)),
          cartonRangeStart: remainderRangeStart,
          cartonRangeEnd: currentRange.end,
          cartonRangeTotal: currentRange.total,
        })
      }

      if (shipNowCartons === 0) {
        shippingLineUpdates.push({
          lineId: line.id,
          data: {
            status: PurchaseOrderLineStatus.CANCELLED,
            quantity: 0,
            unitsOrdered: 0,
            unitCost: null,
            totalCost: new Prisma.Decimal('0'),
            cartonRangeStart: null,
            cartonRangeEnd: null,
            cartonRangeTotal: null,
            postedQuantity: 0,
            quantityReceived: null,
          },
        })
        shippingLinesForTotals.push({
          ...line,
          id: line.id,
          status: PurchaseOrderLineStatus.CANCELLED,
          quantity: 0,
        })
        continue
      }

      shippingLineUpdates.push({
        lineId: line.id,
        data: {
          status: PurchaseOrderLineStatus.PENDING,
          quantity: shipNowCartons,
          unitsOrdered: shipNowUnits,
          unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
          totalCost: new Prisma.Decimal(shipNowCostRounded.toFixed(2)),
          cartonRangeStart: shipNowRange?.start ?? null,
          cartonRangeEnd: shipNowRange?.end ?? null,
          cartonRangeTotal: shipNowRange?.total ?? null,
        },
      })

      shippingLinesForTotals.push({
        ...line,
        id: line.id,
        status: PurchaseOrderLineStatus.PENDING,
        quantity: shipNowCartons,
        unitsOrdered: shipNowUnits,
        totalCost: new Prisma.Decimal(shipNowCostRounded.toFixed(2)),
        cartonRangeStart: shipNowRange?.start ?? null,
        cartonRangeEnd: shipNowRange?.end ?? null,
        cartonRangeTotal: shipNowRange?.total ?? null,
      })
    }

    if (!hasRemainder) {
      return null
    }

    const groupId = order.splitGroupId ?? randomUUID()

    const shippingTotals = await computeManufacturingCargoTotals(shippingLinesForTotals)
    const remainderTotals = await computeManufacturingCargoTotals(remainderLinesForTotals)

    return {
      groupId,
      shippingLineUpdates,
      remainderLineSeeds,
      shippingTotals,
      remainderTotals,
    }
  }

  const dispatchSplitPlan = await buildDispatchSplitPlan()

  const dispatchSplitGeneratedAt = dispatchSplitPlan ? now : null
  if (dispatchSplitPlan) {
    updateData.splitGroupId = dispatchSplitPlan.groupId
    updateData.totalCartons = dispatchSplitPlan.shippingTotals.totalCartons
    updateData.totalPallets = dispatchSplitPlan.shippingTotals.totalPallets
    updateData.totalWeightKg = dispatchSplitPlan.shippingTotals.totalWeightKg
    updateData.totalVolumeCbm = dispatchSplitPlan.shippingTotals.totalVolumeCbm
    updateData.shippingMarksGeneratedAt = dispatchSplitGeneratedAt
    updateData.shippingMarksGeneratedById = user.id
    updateData.shippingMarksGeneratedByName = user.name
  }

  const storageCostInputs: Array<{
    warehouseCode: string
    warehouseName: string
    skuCode: string
    skuDescription: string
    lotRef: string
    transactionDate: Date
  }> = []

  const MAX_SPLIT_ORDER_ATTEMPTS = 5
  let createdRemainderOrderId: string | null = null
  const orderReferenceSeed = dispatchSplitPlan
    ? resolveOrderReferenceSeed({
        orderNumber: order.orderNumber,
        poNumber: order.poNumber,
        skuGroup: order.skuGroup,
      })
    : null

  // Execute the transition + inventory impacts atomically.
  let updatedOrder: PurchaseOrder | null = null

  for (let attempt = 0; attempt < MAX_SPLIT_ORDER_ATTEMPTS; attempt += 1) {
    createdRemainderOrderId = null
    const remainderOrderNumber =
      dispatchSplitPlan && orderReferenceSeed
        ? await generateOrderNumber(orderReferenceSeed.skuGroup)
        : null
    const remainderOrderReference =
      typeof remainderOrderNumber === 'string' ? parseOrderReference(remainderOrderNumber) : null

    try {
      updatedOrder = await prisma.$transaction(async tx => {
        if (dispatchSplitPlan && remainderOrderNumber) {
          if (!remainderOrderReference) {
            throw new ValidationError('Unable to generate a valid split PO reference')
          }

          for (const update of dispatchSplitPlan.shippingLineUpdates) {
            await tx.purchaseOrderLine.update({
              where: { id: update.lineId },
              data: update.data,
            })
          }

          const remainder = await tx.purchaseOrder.create({
            data: {
              orderNumber: remainderOrderNumber,
              skuGroup: remainderOrderReference.skuGroup,
              poNumber: toPublicOrderNumber(remainderOrderNumber),
              splitGroupId: dispatchSplitPlan.groupId,
              splitParentId: order.id,
              type: order.type,
              status: PurchaseOrderStatus.MANUFACTURING,
              counterpartyName: order.counterpartyName,
              counterpartyAddress: order.counterpartyAddress,
              notes: order.notes,
              createdById: user.id,
              createdByName: user.name,
              expectedDate: order.expectedDate,
              incoterms: order.incoterms,
              paymentTerms: order.paymentTerms,
              proformaInvoiceNumber: order.proformaInvoiceNumber,
              proformaInvoiceDate: order.proformaInvoiceDate,
              factoryName: order.factoryName,
              manufacturingStartDate: order.manufacturingStartDate,
              expectedCompletionDate: order.expectedCompletionDate,
              actualCompletionDate: order.actualCompletionDate,
              totalWeightKg:
                dispatchSplitPlan.remainderTotals.totalWeightKg !== null
                  ? new Prisma.Decimal(dispatchSplitPlan.remainderTotals.totalWeightKg.toFixed(2))
                  : null,
              totalVolumeCbm:
                dispatchSplitPlan.remainderTotals.totalVolumeCbm !== null
                  ? new Prisma.Decimal(dispatchSplitPlan.remainderTotals.totalVolumeCbm.toFixed(3))
                  : null,
              totalCartons: dispatchSplitPlan.remainderTotals.totalCartons,
              totalPallets: dispatchSplitPlan.remainderTotals.totalPallets,
              packagingNotes: order.packagingNotes,
	              rfqApprovedAt: order.rfqApprovedAt,
	              rfqApprovedById: order.rfqApprovedById,
	              rfqApprovedByName: order.rfqApprovedByName,
              shippingMarksGeneratedAt: dispatchSplitGeneratedAt,
              shippingMarksGeneratedById: user.id,
              shippingMarksGeneratedByName: user.name,
            },
          })

          createdRemainderOrderId = remainder.id

          if (dispatchSplitPlan.remainderLineSeeds.length > 0) {
            await tx.purchaseOrderLine.createMany({
              data: dispatchSplitPlan.remainderLineSeeds.map(seed => ({
                ...seed,
                lotRef: buildLotReference(
                  remainderOrderReference.sequence,
                  remainderOrderReference.skuGroup,
                  seed.skuCode
                ),
                purchaseOrderId: remainder.id,
              })),
            })
          }

          const documentsToCopy = await tx.purchaseOrderDocument.findMany({
            where: {
              purchaseOrderId: order.id,
              stage: {
                in: [
                  PurchaseOrderDocumentStage.RFQ,
                  PurchaseOrderDocumentStage.ISSUED,
                  PurchaseOrderDocumentStage.MANUFACTURING,
                ],
              },
            },
          })

          if (documentsToCopy.length > 0) {
            await tx.purchaseOrderDocument.createMany({
              data: documentsToCopy.map(doc => ({
                purchaseOrderId: remainder.id,
                stage:
                  doc.stage === PurchaseOrderDocumentStage.RFQ
                    ? PurchaseOrderDocumentStage.ISSUED
                    : doc.stage,
                documentType: doc.documentType,
                fileName: doc.fileName,
                contentType: doc.contentType,
                size: doc.size,
                s3Key: doc.s3Key,
                uploadedAt: doc.uploadedAt,
                uploadedById: doc.uploadedById,
                uploadedByName: doc.uploadedByName,
                metadata: doc.metadata,
              })),
            })
          }

          const invoicesToCopy = await tx.purchaseOrderProformaInvoice.findMany({
            where: { purchaseOrderId: order.id },
          })

          if (invoicesToCopy.length > 0) {
            await tx.purchaseOrderProformaInvoice.createMany({
              data: invoicesToCopy.map(pi => ({
                purchaseOrderId: remainder.id,
                piNumber: pi.piNumber,
                invoiceDate: pi.invoiceDate,
                createdAt: pi.createdAt,
                createdById: pi.createdById,
                createdByName: pi.createdByName,
              })),
            })
          }
        }

        const nextOrder = await tx.purchaseOrder.update({
          where: { id: orderId },
          data: updateData,
          include: { lines: true },
        })

    if (filteredStageData.proformaInvoiceNumber !== undefined) {
      const piNumber = filteredStageData.proformaInvoiceNumber?.trim()
      if (piNumber) {
        const invoiceDate =
          filteredStageData.proformaInvoiceDate !== undefined
            ? new Date(filteredStageData.proformaInvoiceDate)
            : undefined

        await tx.purchaseOrderProformaInvoice.upsert({
          where: {
            purchaseOrderId_piNumber: {
              purchaseOrderId: nextOrder.id,
              piNumber,
            },
          },
          create: {
            purchaseOrderId: nextOrder.id,
            piNumber,
            invoiceDate: invoiceDate ?? null,
            createdById: user.id,
            createdByName: user.name,
          },
          update: invoiceDate !== undefined ? { invoiceDate } : {},
        })
      }
    }
    // Receiving inventory is handled via a dedicated receive action, not the stage transition.

        const refreshed = await tx.purchaseOrder.findUnique({
          where: { id: nextOrder.id },
          include: { lines: true, proformaInvoices: { orderBy: [{ createdAt: 'asc' }] } },
        })

        if (!refreshed) {
          throw new NotFoundError(`Purchase Order not found after transition: ${nextOrder.id}`)
        }

        return refreshed
      })
      break
    } catch (error) {
      if (
        dispatchSplitPlan &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        continue
      }
      throw error
    }
  }

  if (!updatedOrder) {
    throw new ValidationError('Unable to split purchase order. Please retry.')
  }

  const auditOldValue: Record<string, unknown> = isInPlaceUpdate
    ? {}
    : { status: currentStatus }
  const auditNewValue: Record<string, unknown> = isInPlaceUpdate
    ? { updatedBy: user.name }
    : {
        status: targetStatus,
        fromStatus: currentStatus,
        toStatus: targetStatus,
        approvedBy: user.name,
      }

  for (const key of Object.keys(filteredStageData ?? {})) {
    if (key === 'targetStatus') continue
    const before = normalizeAuditValue((order as Record<string, unknown>)[key])
    const after = normalizeAuditValue((updatedOrder as Record<string, unknown>)[key])
    if (before === after) continue
    auditOldValue[key] = before
    auditNewValue[key] = after
  }

  await auditLog({
    userId: user.id,
    action: isInPlaceUpdate ? 'STAGE_UPDATE' : 'STATUS_TRANSITION',
    entityType: 'PurchaseOrder',
    entityId: orderId,
    oldValue: auditOldValue,
    newValue: auditNewValue,
  })

  if (createdRemainderOrderId) {
    await auditLog({
      userId: user.id,
      action: 'SPLIT',
      entityType: 'PurchaseOrder',
      entityId: orderId,
      oldValue: { purchaseOrderId: orderId },
      newValue: {
        splitGroupId: dispatchSplitPlan?.groupId ?? null,
        remainderPurchaseOrderId: createdRemainderOrderId,
      },
    })
  }

  await Promise.all(
    storageCostInputs.map(input =>
      recordStorageCostEntry(input).catch(storageError => {
        const message = storageError instanceof Error ? storageError.message : 'Unknown error'
        console.error(
          `Storage cost recording failed for ${input.warehouseCode}/${input.skuCode}/${input.lotRef}:`,
          message
        )
      })
    )
  )

  return updatedOrder
}

export interface ReceivePurchaseOrderInventoryInput {
  warehouseCode: string
  receiveType: InboundReceiveType
  customsEntryNumber?: string | null
  customsClearedDate: Date | string
  receivedDate: Date | string
  dutyAmount?: number | null
  dutyCurrency?: string | null
  discrepancyNotes?: string | null
  lineReceipts?: Array<{ lineId: string; quantityReceived: number }>
}

export async function receivePurchaseOrderInventory(params: {
  orderId: string
  input: ReceivePurchaseOrderInventoryInput
  user: UserContext
}): Promise<PurchaseOrder> {
  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: params.orderId },
    include: { lines: true, proformaInvoices: { orderBy: [{ createdAt: 'asc' }] } },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${params.orderId}`)
  }

  if (order.isLegacy) {
    throw new ConflictError('Cannot receive inventory for legacy orders. They are archived.')
  }

  if (order.status !== PurchaseOrderStatus.WAREHOUSE) {
    throw new ConflictError('Inventory can only be received at the Warehouse stage')
  }

  if (order.postedAt) {
    throw new ConflictError('Inventory has already been received for this purchase order')
  }

  const tenant = await getCurrentTenant()
  const tenantCostCurrency = normalizePoCostCurrency(tenant.currency)
  if (!tenantCostCurrency) {
    throw new ValidationError(`Unsupported tenant currency: ${tenant.currency}`)
  }

  const issues: Record<string, string> = {}

  const warehouseCode = params.input.warehouseCode.trim()
  if (!warehouseCode) {
    recordGateIssue(issues, 'details.warehouseCode', 'Warehouse is required')
  }

  const receiveType = params.input.receiveType
  if (!receiveType) {
    recordGateIssue(issues, 'details.receiveType', 'Receive type is required')
  }

  const customsEntryNumberText =
    typeof params.input.customsEntryNumber === 'string' ? params.input.customsEntryNumber.trim() : ''
  const customsEntryNumber = customsEntryNumberText.length > 0 ? customsEntryNumberText : null

  const customsClearedDate = resolveDateValue(params.input.customsClearedDate, 'Customs cleared date')
  if (!customsClearedDate) {
    recordGateIssue(issues, 'details.customsClearedDate', 'Customs cleared date is required')
  }

  const receivedDate = resolveDateValue(params.input.receivedDate, 'Received date')
  if (!receivedDate) {
    recordGateIssue(issues, 'details.receivedDate', 'Received date is required')
  }

  if (customsClearedDate && receivedDate && receivedDate < customsClearedDate) {
    recordGateIssue(
      issues,
      'details.receivedDate',
      'Received date cannot be earlier than customs cleared date'
    )
  }

  const activeLines = order.lines.filter(line => line.status !== PurchaseOrderLineStatus.CANCELLED)
  if (activeLines.length === 0) {
    recordGateIssue(issues, 'cargo.lines', 'At least one cargo line is required')
  }

  const receiptOverrides = new Map<string, number>()
  if (params.input.lineReceipts && params.input.lineReceipts.length > 0) {
    for (const receipt of params.input.lineReceipts) {
      receiptOverrides.set(receipt.lineId, receipt.quantityReceived)
    }
  }

  let mismatch = false
  for (const line of activeLines) {
    const received = receiptOverrides.has(line.id)
      ? receiptOverrides.get(line.id)
      : line.quantityReceived ?? line.quantity

    if (!Number.isInteger(received) || received < 0) {
      recordGateIssue(
        issues,
        `cargo.lines.${line.id}.quantityReceived`,
        'Received cartons must be a non-negative integer'
      )
      continue
    }

    if (received !== line.quantity) {
      mismatch = true
    }
  }

  const discrepancyNotesText =
    typeof params.input.discrepancyNotes === 'string' ? params.input.discrepancyNotes.trim() : ''

  if (mismatch) {
    if (!discrepancyNotesText) {
      recordGateIssue(
        issues,
        'details.discrepancyNotes',
        'Discrepancy notes are required when received quantity differs from ordered'
      )
    }
  }

  const warehouse = warehouseCode
    ? await prisma.warehouse.findUnique({
        where: { code: warehouseCode },
        select: { id: true, code: true, name: true, address: true },
      })
    : null

  if (warehouseCode && !warehouse) {
    recordGateIssue(issues, 'details.warehouseCode', 'Warehouse code is invalid')
  }

  const supplierDiscrepancyAdjustment = (() => {
    if (!mismatch) return null
    if (!discrepancyNotesText) return null

    let rawAmount = new Prisma.Decimal(0)
    for (const line of activeLines) {
      const receivedCartons = receiptOverrides.has(line.id)
        ? receiptOverrides.get(line.id)
        : line.quantityReceived ?? line.quantity

      if (receivedCartons === undefined) {
        continue
      }

      const orderedUnits = new Prisma.Decimal(line.unitsOrdered)
      const receivedUnits = new Prisma.Decimal(receivedCartons).mul(line.unitsPerCarton)
      const diffUnits = orderedUnits.sub(receivedUnits)
      if (diffUnits.isZero()) continue

      if (!line.unitCost) continue
      rawAmount = rawAmount.plus(line.unitCost.mul(diffUnits))
    }

    const rounded = rawAmount.toDecimalPlaces(2)
    if (rounded.isZero()) return null

    const sourceId = `po_receiving_discrepancy:${order.id}`

    if (rounded.gt(0)) {
      return {
        sourceId,
        category: FinancialLedgerCategory.SupplierCredit,
        costName: 'Supplier Credit Note',
        amount: rounded.neg(),
      }
    }

    return {
      sourceId,
      category: FinancialLedgerCategory.SupplierDebit,
      costName: 'Supplier Debit Note',
      amount: rounded.abs(),
    }
  })()

  await requireDocuments({
    prisma,
    purchaseOrderId: order.id,
    stage: PurchaseOrderDocumentStage.WAREHOUSE,
    documentTypes: ['grn', 'custom_declaration'],
    issues,
    issueKeyPrefix: 'documents',
    issueLabel: (docType) =>
      docType === 'custom_declaration'
        ? 'Customs & Border Patrol Clearance Proof'
        : 'GRN',
  })

  if (warehouse) {
    const forwardingCost = await prisma.purchaseOrderForwardingCost.findFirst({
      where: { purchaseOrderId: order.id },
      select: { id: true },
    })
    if (!forwardingCost) {
      recordGateIssue(issues, 'costs.forwarding', 'Freight (forwarding) cost is required')
    }
  }

  if (Object.keys(issues).length > 0) {
    throw new StageGateError('Missing required information', issues)
  }

  const receivedAt = receivedDate as Date

  const storageCostInputs: Array<{
    warehouseCode: string
    warehouseName: string
    skuCode: string
    skuDescription: string
    lotRef: string
    transactionDate: Date
  }> = []

  const updatedOrder = await prisma.$transaction(async tx => {
    const existingCount = await tx.inventoryTransaction.count({
      where: { purchaseOrderId: order.id },
    })
    if (existingCount > 0) {
      throw new ConflictError('Inventory transactions already exist for this purchase order')
    }

    const skuCodes = Array.from(new Set(activeLines.map(line => line.skuCode)))
    const skus = await tx.sku.findMany({
      where: { skuCode: { in: skuCodes } },
      select: {
        id: true,
        skuCode: true,
        description: true,
        unitDimensionsCm: true,
        unitWeightKg: true,
        cartonDimensionsCm: true,
        cartonWeightKg: true,
        packagingType: true,
        unitsPerCarton: true,
      },
    })
    const skuMap = new Map(skus.map(sku => [sku.skuCode, sku]))
    const warehouseSkuConfigs = await tx.warehouseSkuStorageConfig.findMany({
      where: {
        warehouseId: warehouse!.id,
        skuId: { in: skus.map(sku => sku.id) },
      },
      select: {
        skuId: true,
        storageCartonsPerPallet: true,
        shippingCartonsPerPallet: true,
      },
    })
    const configBySkuId = new Map(warehouseSkuConfigs.map(row => [row.skuId, row]))

    const createdTransactions: Array<{
      id: string
      purchaseOrderId: string
      purchaseOrderLineId: string
      skuCode: string
      cartons: number
      pallets: number
      cartonDimensionsCm: string | null
      warehouseCode: string
      warehouseName: string
      skuDescription: string
      lotRef: string
      transactionDate: Date
    }> = []

    let totalStoragePalletsIn = 0
    const referenceId =
      order.commercialInvoiceNumber ??
      order.proformaInvoiceNumber ??
      toPublicOrderNumber(order.orderNumber)

    for (const line of activeLines) {
      const sku = skuMap.get(line.skuCode)
      if (!sku) {
        throw new ValidationError(`SKU ${line.skuCode} not found. Create the SKU first.`)
      }

      const config = configBySkuId.get(sku.id) ?? null

      const storageCartonsPerPallet =
        line.storageCartonsPerPallet && line.storageCartonsPerPallet > 0
          ? line.storageCartonsPerPallet
          : config?.storageCartonsPerPallet ?? null
      const shippingCartonsPerPallet =
        line.shippingCartonsPerPallet && line.shippingCartonsPerPallet > 0
          ? line.shippingCartonsPerPallet
          : config?.shippingCartonsPerPallet ?? null

      if (!storageCartonsPerPallet || storageCartonsPerPallet <= 0) {
        throw new ValidationError(
          `Storage cartons per pallet is required for SKU ${line.skuCode} in warehouse ${warehouse!.code}.`
        )
      }

      if (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0) {
        throw new ValidationError(
          `Shipping cartons per pallet is required for SKU ${line.skuCode} in warehouse ${warehouse!.code}.`
        )
      }

      const cartonsRaw = receiptOverrides.has(line.id)
        ? receiptOverrides.get(line.id)
        : line.quantityReceived ?? line.quantity
      const cartons = Number(cartonsRaw)
      if (!Number.isInteger(cartons) || cartons < 0) {
        throw new ValidationError(`Invalid received cartons quantity for SKU ${line.skuCode}`)
      }

      if (cartons === 0) {
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            postedQuantity: 0,
            quantityReceived: 0,
            status: PurchaseOrderLineStatus.POSTED,
          },
        })
        continue
      }

      const { storagePalletsIn } = calculatePalletValues({
        transactionType: 'RECEIVE',
        cartons,
        storageCartonsPerPallet,
      })

      if (storagePalletsIn <= 0) {
        throw new ValidationError('Storage pallet count is required for inbound transactions')
      }

      const txRow = await tx.inventoryTransaction.create({
        data: {
          warehouseCode: warehouse!.code,
          warehouseName: warehouse!.name,
          warehouseAddress: warehouse!.address,
          skuCode: sku.skuCode,
          skuDescription: line.skuDescription ?? sku.description,
          unitDimensionsCm: sku.unitDimensionsCm,
          unitWeightKg: sku.unitWeightKg,
          cartonDimensionsCm: line.cartonDimensionsCm ?? sku.cartonDimensionsCm,
          cartonWeightKg: line.cartonWeightKg ?? sku.cartonWeightKg,
          packagingType: line.packagingType ?? sku.packagingType,
          unitsPerCarton: line.unitsPerCarton,
          lotRef: line.lotRef,
          transactionType: TransactionType.RECEIVE,
          referenceId,
          cartonsIn: cartons,
          cartonsOut: 0,
          storagePalletsIn,
          shippingPalletsOut: 0,
          storageCartonsPerPallet,
          shippingCartonsPerPallet,
          shipName: null,
          trackingNumber: null,
          supplier: order.counterpartyName ?? null,
          attachments: null,
          transactionDate: receivedAt,
          pickupDate: receivedAt,
          createdById: params.user.id,
          createdByName: params.user.name,
          purchaseOrderId: order.id,
          purchaseOrderLineId: line.id,
          isReconciled: false,
          isDemo: false,
        },
        select: {
          id: true,
          purchaseOrderId: true,
          purchaseOrderLineId: true,
          skuCode: true,
          cartonDimensionsCm: true,
          storagePalletsIn: true,
          warehouseCode: true,
          warehouseName: true,
          skuDescription: true,
          lotRef: true,
          transactionDate: true,
        },
      })

      totalStoragePalletsIn += Number(txRow.storagePalletsIn ?? 0)

      createdTransactions.push({
        id: txRow.id,
        purchaseOrderId: txRow.purchaseOrderId,
        purchaseOrderLineId: txRow.purchaseOrderLineId,
        skuCode: txRow.skuCode,
        cartons,
        pallets: Number(txRow.storagePalletsIn ?? 0),
        cartonDimensionsCm: txRow.cartonDimensionsCm,
        warehouseCode: txRow.warehouseCode,
        warehouseName: txRow.warehouseName,
        skuDescription: txRow.skuDescription,
        lotRef: txRow.lotRef,
        transactionDate: txRow.transactionDate,
      })

      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: {
          postedQuantity: cartons,
          quantityReceived: cartons,
          status: PurchaseOrderLineStatus.POSTED,
        },
      })
    }

    if (createdTransactions.length === 0) {
      throw new ValidationError('No inventory transactions were created for this receipt')
    }

    if (totalStoragePalletsIn <= 0) {
      throw new ValidationError('Storage pallet count is required for inbound transactions')
    }

    const rates = await tx.costRate.findMany({
      where: {
        warehouseId: warehouse!.id,
        isActive: true,
      },
      orderBy: [{ costName: 'asc' }, { updatedAt: 'desc' }],
    })

    const ratesByCostName = new Map<
      string,
      { costName: string; costValue: number; unitOfMeasure: string }
    >()
    for (const rate of rates) {
      if (!ratesByCostName.has(rate.costName)) {
        ratesByCostName.set(rate.costName, {
          costName: rate.costName,
          costValue: Number(rate.costValue),
          unitOfMeasure: rate.unitOfMeasure,
        })
      }
    }

    let inboundLedgerEntries: Prisma.CostLedgerCreateManyInput[] = []
    try {
      inboundLedgerEntries = buildTacticalCostLedgerEntries({
        transactionType: 'RECEIVE',
        receiveType,
        shipMode: null,
        ratesByCostName,
        lines: createdTransactions.map(row => ({
          transactionId: row.id,
          skuCode: row.skuCode,
          cartons: row.cartons,
          pallets: row.pallets,
          cartonDimensionsCm: row.cartonDimensionsCm,
        })),
        warehouseCode: warehouse!.code,
        warehouseName: warehouse!.name,
        createdAt: receivedAt,
        createdByName: params.user.name,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cost calculation failed'
      throw new ValidationError(message)
    }

    if (inboundLedgerEntries.length > 0) {
      await tx.costLedger.createMany({ data: inboundLedgerEntries })

      const transactionIds = createdTransactions.map(row => row.id)
      const inserted = await tx.costLedger.findMany({
        where: {
          transactionId: { in: transactionIds },
          costCategory: CostCategory.Inbound,
        },
        select: {
          id: true,
          transactionId: true,
          costCategory: true,
          costName: true,
          quantity: true,
          unitRate: true,
          totalCost: true,
          warehouseCode: true,
          warehouseName: true,
          createdAt: true,
          createdByName: true,
        },
      })

      const txById = new Map(createdTransactions.map(row => [row.id, row]))
      const financialEntries: Prisma.FinancialLedgerEntryCreateManyInput[] = inserted.map(row => {
        const txRow = txById.get(row.transactionId)
        if (!txRow) {
          throw new ValidationError(`Missing inventory transaction context for ${row.transactionId}`)
        }

        return {
          id: row.id,
          sourceType: FinancialLedgerSourceType.COST_LEDGER,
          sourceId: row.id,
          category: toFinancialCategory(row.costCategory),
          costName: row.costName,
          quantity: row.quantity,
          unitRate: row.unitRate,
          amount: row.totalCost,
          warehouseCode: row.warehouseCode,
          warehouseName: row.warehouseName,
          skuCode: txRow.skuCode,
          skuDescription: txRow.skuDescription,
          lotRef: txRow.lotRef,
          inventoryTransactionId: row.transactionId,
          purchaseOrderId: txRow.purchaseOrderId,
          purchaseOrderLineId: txRow.purchaseOrderLineId,
          effectiveAt: row.createdAt,
          createdAt: row.createdAt,
          createdByName: row.createdByName,
        }
      })

      if (financialEntries.length > 0) {
        await tx.financialLedgerEntry.createMany({
          data: financialEntries,
          skipDuplicates: true,
        })
      }
    }

    const forwardingCosts = await tx.purchaseOrderForwardingCost.findMany({
      where: {
        purchaseOrderId: order.id,
      },
      select: {
        costName: true,
        totalCost: true,
        currency: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    const transactionIds = createdTransactions.map(row => row.id)
    await tx.costLedger.deleteMany({
      where: {
        transactionId: { in: transactionIds },
        costCategory: CostCategory.Forwarding,
      },
    })
    await tx.financialLedgerEntry.deleteMany({
      where: {
        sourceType: FinancialLedgerSourceType.COST_LEDGER,
        inventoryTransactionId: { in: transactionIds },
        category: FinancialLedgerCategory.Forwarding,
      },
    })

    if (forwardingCosts.length > 0) {
      const lines = createdTransactions.map(row => ({
        transactionId: row.id,
        skuCode: row.skuCode,
        cartons: row.cartons,
        cartonDimensionsCm: row.cartonDimensionsCm,
      }))

      let forwardingLedgerEntries: Array<Prisma.CostLedgerCreateManyInput & { currency: string }> =
        []
      try {
        forwardingLedgerEntries = forwardingCosts.flatMap(cost => {
          const resolvedCurrency = normalizePoCostCurrency(cost.currency) ?? tenantCostCurrency
          return buildPoForwardingCostLedgerEntries({
            costName: cost.costName,
            totalCost: Number(cost.totalCost),
            lines,
            warehouseCode: warehouse!.code,
            warehouseName: warehouse!.name,
            createdAt: receivedAt,
            createdByName: params.user.name,
          }).map(entry => ({
            id: randomUUID(),
            ...entry,
            currency: resolvedCurrency,
          }))
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cost allocation failed'
        throw new ValidationError(message)
      }

      if (forwardingLedgerEntries.length > 0) {
        await tx.costLedger.createMany({
          data: forwardingLedgerEntries.map(({ currency: _currency, ...entry }) => entry),
        })

        const txById = new Map(createdTransactions.map(row => [row.id, row]))
        const financialEntries: Prisma.FinancialLedgerEntryCreateManyInput[] =
          forwardingLedgerEntries.map(row => {
            const txRow = txById.get(row.transactionId)
            if (!txRow) {
              throw new ValidationError(
                `Missing inventory transaction context for ${row.transactionId}`
              )
            }

            return {
              id: row.id,
              sourceType: FinancialLedgerSourceType.COST_LEDGER,
              sourceId: row.id,
              category: toFinancialCategory(row.costCategory),
              costName: row.costName,
              quantity: row.quantity,
              unitRate: row.unitRate,
              amount: row.totalCost,
              currency: row.currency,
              warehouseCode: row.warehouseCode,
              warehouseName: row.warehouseName,
              skuCode: txRow.skuCode,
              skuDescription: txRow.skuDescription,
              lotRef: txRow.lotRef,
              inventoryTransactionId: row.transactionId,
              purchaseOrderId: txRow.purchaseOrderId,
              purchaseOrderLineId: txRow.purchaseOrderLineId,
              effectiveAt: row.createdAt,
              createdAt: row.createdAt,
              createdByName: row.createdByName,
            }
          })

        if (financialEntries.length > 0) {
          await tx.financialLedgerEntry.createMany({
            data: financialEntries,
            skipDuplicates: true,
          })
        }
      }
    }

    const dutyAmount =
      typeof params.input.dutyAmount === 'number' && Number.isFinite(params.input.dutyAmount)
        ? new Prisma.Decimal(params.input.dutyAmount.toFixed(2))
        : null
    const dutyCurrency =
      typeof params.input.dutyCurrency === 'string' && params.input.dutyCurrency.trim().length > 0
        ? params.input.dutyCurrency.trim().toUpperCase()
        : null
    const discrepancyNotes =
      typeof params.input.discrepancyNotes === 'string' && params.input.discrepancyNotes.trim().length > 0
        ? params.input.discrepancyNotes.trim()
        : null

    await tx.purchaseOrder.update({
      where: { id: order.id },
      data: {
        warehouseCode: warehouse!.code,
        warehouseName: warehouse!.name,
        receiveType,
        customsEntryNumber,
        customsClearedDate,
        receivedDate: receivedAt,
        dutyAmount,
        dutyCurrency,
        discrepancyNotes,
        postedAt: receivedAt,
      },
    })

    if (supplierDiscrepancyAdjustment) {
      await tx.financialLedgerEntry.upsert({
        where: {
          sourceType_sourceId: {
            sourceType: FinancialLedgerSourceType.MANUAL,
            sourceId: supplierDiscrepancyAdjustment.sourceId,
          },
        },
        create: {
          id: randomUUID(),
          sourceType: FinancialLedgerSourceType.MANUAL,
          sourceId: supplierDiscrepancyAdjustment.sourceId,
          category: supplierDiscrepancyAdjustment.category,
          costName: supplierDiscrepancyAdjustment.costName,
          amount: supplierDiscrepancyAdjustment.amount,
          currency: tenant.currency,
          warehouseCode: warehouse!.code,
          warehouseName: warehouse!.name,
          purchaseOrderId: order.id,
          effectiveAt: receivedAt,
          createdAt: receivedAt,
          createdByName: params.user.name,
          notes: discrepancyNotesText,
        },
        update: {
          category: supplierDiscrepancyAdjustment.category,
          costName: supplierDiscrepancyAdjustment.costName,
          amount: supplierDiscrepancyAdjustment.amount,
          currency: tenant.currency,
          warehouseCode: warehouse!.code,
          warehouseName: warehouse!.name,
          purchaseOrderId: order.id,
          effectiveAt: receivedAt,
          createdByName: params.user.name,
          notes: discrepancyNotesText,
        },
      })
    }

    const refreshed = await tx.purchaseOrder.findUnique({
      where: { id: order.id },
      include: { lines: true, proformaInvoices: { orderBy: [{ createdAt: 'asc' }] } },
    })

    if (!refreshed) {
      throw new NotFoundError(`Purchase Order not found after receiving: ${order.id}`)
    }

    storageCostInputs.push(
      ...createdTransactions.map(row => ({
        warehouseCode: row.warehouseCode,
        warehouseName: row.warehouseName,
        skuCode: row.skuCode,
        skuDescription: row.skuDescription,
        lotRef: row.lotRef,
        transactionDate: row.transactionDate,
      }))
    )

    return refreshed
  })

  await auditLog({
    userId: params.user.id,
    action: 'INVENTORY_RECEIVE',
    entityType: 'PurchaseOrder',
    entityId: params.orderId,
    oldValue: { postedAt: null },
    newValue: {
      postedAt: updatedOrder.postedAt?.toISOString() ?? null,
      receivedDate: updatedOrder.receivedDate?.toISOString() ?? null,
      warehouseCode: updatedOrder.warehouseCode ?? null,
      warehouseName: updatedOrder.warehouseName ?? null,
    },
  })

  await Promise.all(
    storageCostInputs.map(input =>
      recordStorageCostEntry(input).catch(storageError => {
        const message = storageError instanceof Error ? storageError.message : 'Unknown error'
        console.error(
          `Storage cost recording failed for ${input.warehouseCode}/${input.skuCode}/${input.lotRef}:`,
          message
        )
      })
    )
  )

  return updatedOrder
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatCommodityCode(value: string): string {
  const digits = value.replace(/[^0-9]/g, '')
  if (digits.length < 2) return value
  const groups: string[] = []
  for (let i = 0; i < digits.length; i += 2) {
    groups.push(digits.slice(i, i + 2))
  }
  return groups.join(' ')
}


export async function generatePurchaseOrderShippingMarks(params: {
  orderId: string
  user: UserContext
}): Promise<string> {
  const prisma = await getTenantPrisma()

  const order = await prisma.purchaseOrder.findUnique({
    where: { id: params.orderId },
    include: { lines: true },
  })

  if (!order) {
    throw new NotFoundError(`Purchase Order not found: ${params.orderId}`)
  }

  if (order.isLegacy) {
    throw new ConflictError('Cannot generate shipping marks for legacy orders. They are archived.')
  }

  if (normalizeWorkflowStatus(order.status as PurchaseOrderStatus) === PurchaseOrderStatus.CLOSED) {
    throw new ConflictError('Cannot generate shipping marks for closed purchase orders')
  }

  const tenant = await getCurrentTenant()
  const tenantCode = tenant.code
  const unitSystem = getDefaultUnitSystem(tenant.code)

  const issues: Record<string, string> = {}
  const activeLines = order.lines.filter(line => line.status !== PurchaseOrderLineStatus.CANCELLED)

  let supplierCountry: string | null = null
  if (order.counterpartyName && order.counterpartyName.trim().length > 0) {
    const supplierName = order.counterpartyName.trim()
    const supplier = await prisma.supplier.findFirst({
      where: { name: { equals: supplierName, mode: 'insensitive' } },
      select: { address: true },
    })

    supplierCountry = deriveSupplierCountry(supplier ? supplier.address : null)
  }

  if (activeLines.length === 0) {
    recordGateIssue(issues, 'cargo.lines', 'At least one cargo line is required')
  }

  for (const line of activeLines) {
    const piNumber = typeof line.piNumber === 'string' ? line.piNumber.trim() : ''
    if (!piNumber) {
      recordGateIssue(issues, `cargo.lines.${line.id}.piNumber`, 'PI number is required')
    }

    const commodityCode = typeof line.commodityCode === 'string' ? line.commodityCode.trim() : ''
    if (!commodityCode) {
      recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code is required')
    } else if (!validateCommodityCodeFormat({ tenantCode, commodityCode })) {
      recordGateIssue(issues, `cargo.lines.${line.id}.commodityCode`, 'Commodity code format is invalid')
    }

    if (!supplierCountry) {
      recordGateIssue(issues, `cargo.lines.${line.id}.countryOfOrigin`, 'Supplier country is required')
    }

    const material = typeof line.material === 'string' ? line.material.trim() : ''
    if (!material) {
      recordGateIssue(issues, `cargo.lines.${line.id}.material`, 'Material is required')
    }

    const lotRef = typeof line.lotRef === 'string' ? line.lotRef.trim() : ''
    if (!lotRef) {
      recordGateIssue(issues, `cargo.lines.${line.id}.lotRef`, 'Lot reference is required')
    }

    const netWeightKg = line.netWeightKg ? Number(line.netWeightKg) : null
    if (netWeightKg === null || !Number.isFinite(netWeightKg) || netWeightKg <= 0) {
      recordGateIssue(issues, `cargo.lines.${line.id}.netWeightKg`, 'Net weight is required')
    }

    const grossWeightKg = line.cartonWeightKg ? Number(line.cartonWeightKg) : null
    if (grossWeightKg === null || !Number.isFinite(grossWeightKg) || grossWeightKg <= 0) {
      recordGateIssue(issues, `cargo.lines.${line.id}.cartonWeightKg`, 'Gross weight is required')
    }

    const cartonVolumeCbm =
      computeCartonVolumeCbm({
        cartonSide1Cm: line.cartonSide1Cm,
        cartonSide2Cm: line.cartonSide2Cm,
        cartonSide3Cm: line.cartonSide3Cm,
        cartonDimensionsCm: line.cartonDimensionsCm,
      }) ?? null
    if (cartonVolumeCbm === null) {
      recordGateIssue(issues, `cargo.lines.${line.id}.cartonDimensions`, 'Carton dimensions are required')
    }

    if (!Number.isInteger(line.unitsOrdered) || !Number.isInteger(line.unitsPerCarton)) {
      recordGateIssue(issues, `cargo.lines.${line.id}.unitsPerCarton`, 'Units per carton is required')
    } else if (line.unitsOrdered % line.unitsPerCarton !== 0) {
      recordGateIssue(
        issues,
        `cargo.lines.${line.id}.unitsPerCarton`,
        'Units must be divisible by units per carton'
      )
    }
  }

  if (Object.keys(issues).length > 0) {
    throw new StageGateError('Missing required information', issues)
  }

  const generatedAt = new Date()
  await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      shippingMarksGeneratedAt: generatedAt,
      shippingMarksGeneratedById: params.user.id,
      shippingMarksGeneratedByName: params.user.name,
    },
  })

  const poNumber = order.poNumber ? escapeHtml(order.poNumber) : ''
  const consignee = order.shipToName ? escapeHtml(order.shipToName) : ''
  const destination = [order.shipToCity, order.shipToCountry].filter(Boolean).join(', ')
  const portOfDischarge = order.portOfDischarge ? escapeHtml(order.portOfDischarge) : ''

  const labels = activeLines.map(line => {
    const cartonRange = resolveLineCartonRange(line)
    const cartonTriplet = resolveDimensionTripletCm({
      side1Cm: line.cartonSide1Cm,
      side2Cm: line.cartonSide2Cm,
      side3Cm: line.cartonSide3Cm,
      legacy: line.cartonDimensionsCm,
    })
    const dimsLabel = cartonTriplet ? formatDimensionTripletDisplayFromCm(cartonTriplet, unitSystem) : ''
    const commodityLabel = typeof line.commodityCode === 'string' ? formatCommodityCode(line.commodityCode) : ''
    const origin = supplierCountry ? supplierCountry : ''
    const material = typeof line.material === 'string' ? line.material.trim() : ''
    const piNumber = typeof line.piNumber === 'string' ? normalizePiNumber(line.piNumber) : ''
    const netWeightKg = Number(line.netWeightKg)
    const grossWeightKg = Number(line.cartonWeightKg)
    const netWeightLabel = formatWeightDisplayFromKg(netWeightKg, unitSystem, 1)
    const grossWeightLabel = formatWeightDisplayFromKg(grossWeightKg, unitSystem, 1)
    const shippingMark = typeof line.lotRef === 'string' ? line.lotRef.trim() : ''

    return `
      <div class="label">
        <div class="label-header">${escapeHtml(piNumber)}</div>
        <div class="label-row"><span class="k">PO</span><span class="v">${poNumber}</span></div>
        <div class="label-row"><span class="k">Consignee</span><span class="v">${consignee}</span></div>${destination ? `
        <div class="label-row"><span class="k">Destination</span><span class="v">${escapeHtml(destination)}</span></div>` : ''}${portOfDischarge ? `
        <div class="label-row"><span class="k">Port</span><span class="v">${portOfDischarge}</span></div>` : ''}
        <div class="label-row"><span class="k">Cartons</span><span class="v">${cartonRange.start}–${cartonRange.end} of ${cartonRange.total}</span></div>
        <div class="label-row"><span class="k">Shipping Mark</span><span class="v">${escapeHtml(shippingMark)}</span></div>
        <div class="label-row"><span class="k">Commodity Code</span><span class="v mono">${escapeHtml(commodityLabel)}</span></div>
        <div class="label-row"><span class="k">Units/Carton</span><span class="v">${line.unitsPerCarton} pcs</span></div>
        <div class="label-row"><span class="k">N/W per carton</span><span class="v">${escapeHtml(netWeightLabel)}</span></div>
        <div class="label-row"><span class="k">G/W per carton</span><span class="v">${escapeHtml(grossWeightLabel)}</span></div>
        <div class="label-row"><span class="k">Dims (L×W×H)</span><span class="v mono">${escapeHtml(dimsLabel)}</span></div>
        <div class="label-row"><span class="k">Material</span><span class="v">${escapeHtml(material)}</span></div>
        <div class="label-footer">MADE IN ${escapeHtml(origin)}</div>
      </div>
    `
  })

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shipping Marks</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 20px; background: #f6f7fb; color: #000; }
      .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .print-btn { background: #0ea5a4; color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: 600; cursor: pointer; }
      .meta { color: #475569; font-size: 12px; }
      .labels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .label { background: white; border: 2px solid #000; padding: 16px; break-inside: avoid; }
      .label-header { font-weight: 900; font-size: 18px; text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #000; text-transform: uppercase; letter-spacing: 0.03em; }
      .label-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid #ccc; }
      .label-row:last-of-type { border-bottom: none; }
      .k { color: #000; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
      .v { color: #000; font-size: 15px; font-weight: 600; text-align: right; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }
      .label-footer { margin-top: 10px; padding-top: 8px; border-top: 2px solid #000; text-align: center; font-weight: 900; font-size: 20px; text-transform: uppercase; letter-spacing: 0.06em; color: #000; }
      .handling { margin-top: 20px; padding: 10px 16px; background: white; border: 2px solid #000; }
      .handling-title { font-weight: 900; font-size: 13px; text-transform: uppercase; text-align: center; margin-bottom: 8px; letter-spacing: 0.04em; }
      .handling-icons { display: flex; justify-content: center; gap: 24px; flex-wrap: wrap; }
      .handling-icon { display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .handling-icon svg { width: 36px; height: 36px; }
      .handling-icon span { font-size: 9px; font-weight: 700; text-transform: uppercase; text-align: center; line-height: 1.2; }
      @media print {
        @page { size: A4; margin: 10mm; }
        body { background: white; padding: 0; }
        .toolbar { display: none; }
        .labels { gap: 10mm; }
        .label { border: 2pt solid #000; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
      <div class="meta">Generated ${generatedAt.toISOString()} by ${escapeHtml(params.user.name)}</div>
    </div>
    <div class="labels">
      ${labels.join('')}
    </div>
    <div class="handling">
      <div class="handling-title">Handling Instructions / 操作说明</div>
      <div class="handling-icons">
        <div class="handling-icon">
          <svg viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="3">
            <polygon points="30,55 50,20 70,55" fill="none" />
            <polygon points="30,80 50,45 70,80" fill="none" />
          </svg>
          <span>This Side Up<br/>此面朝上</span>
        </div>
        <div class="handling-icon">
          <svg viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="3">
            <path d="M35,85 L35,40 Q35,25 50,25 Q65,25 65,40 L65,55" />
            <line x1="35" y1="85" x2="65" y2="85" />
            <line x1="65" y1="55" x2="75" y2="70" />
            <line x1="65" y1="55" x2="55" y2="70" />
            <line x1="50" y1="25" x2="50" y2="15" />
          </svg>
          <span>Fragile<br/>易碎品</span>
        </div>
        <div class="handling-icon">
          <svg viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="3">
            <path d="M50,20 L50,55 M40,20 Q50,10 60,20" />
            <line x1="35" y1="45" x2="30" y2="55" />
            <line x1="65" y1="45" x2="70" y2="55" />
            <line x1="42" y1="60" x2="38" y2="70" />
            <line x1="58" y1="60" x2="62" y2="70" />
            <line x1="50" y1="65" x2="50" y2="75" />
            <path d="M25,80 Q40,70 50,80 Q60,70 75,80" />
          </svg>
          <span>Keep Dry<br/>防潮</span>
        </div>
        <div class="handling-icon">
          <svg viewBox="0 0 100 100" fill="none" stroke="#000" stroke-width="3">
            <rect x="25" y="50" width="50" height="30" />
            <rect x="30" y="30" width="40" height="20" stroke-dasharray="6,3" />
            <line x1="20" y1="20" x2="80" y2="80" stroke-width="4" />
            <line x1="80" y1="20" x2="20" y2="80" stroke-width="4" />
          </svg>
          <span>Do Not Stack<br/>禁止堆放</span>
        </div>
      </div>
    </div>
  </body>
</html>`
}

/**
 * Get stage approval history for a Purchase Order
 */
export function getStageApprovalHistory(order: PurchaseOrder): {
  stage: string
  approvedAt: Date | null
  approvedBy: string | null
}[] {
  const history = []

  if (order.rfqApprovedAt) {
    history.push({
      stage: 'ISSUED',
      approvedAt: order.rfqApprovedAt,
      approvedBy: order.rfqApprovedByName,
    })
  }

  if (order.manufacturingApprovedAt) {
    history.push({
      stage: 'MANUFACTURING → OCEAN',
      approvedAt: order.manufacturingApprovedAt,
      approvedBy: order.manufacturingApprovedByName,
    })
  }

  if (order.oceanApprovedAt) {
    history.push({
      stage: 'OCEAN → WAREHOUSE',
      approvedAt: order.oceanApprovedAt,
      approvedBy: order.oceanApprovedByName,
    })
  }

  if (order.warehouseApprovedAt) {
    history.push({
      stage: 'WAREHOUSE → SHIPPED',
      approvedAt: order.warehouseApprovedAt,
      approvedBy: order.warehouseApprovedByName,
    })
  }

  return history
}

/**
 * Get current stage data for display
 */
export function getStageData(order: PurchaseOrder): StageData {
  return {
    manufacturing: {
      proformaInvoiceNumber: order.proformaInvoiceNumber,
      proformaInvoiceDate: order.proformaInvoiceDate,
      factoryName: order.factoryName,
      manufacturingStartDate: order.manufacturingStartDate,
      expectedCompletionDate: order.expectedCompletionDate,
      actualCompletionDate: order.actualCompletionDate,
      totalWeightKg: order.totalWeightKg ? Number(order.totalWeightKg) : null,
      totalVolumeCbm: order.totalVolumeCbm ? Number(order.totalVolumeCbm) : null,
      totalCartons: order.totalCartons,
      totalPallets: order.totalPallets,
      packagingNotes: order.packagingNotes,
      // Legacy fields
      proformaInvoiceId: order.proformaInvoiceId,
      proformaInvoiceData: order.proformaInvoiceData,
      manufacturingStart: order.manufacturingStart,
      manufacturingEnd: order.manufacturingEnd,
      cargoDetails: order.cargoDetails,
    },
    ocean: {
      houseBillOfLading: order.houseBillOfLading,
      masterBillOfLading: order.masterBillOfLading,
      commercialInvoiceNumber: order.commercialInvoiceNumber,
      packingListRef: order.packingListRef,
      vesselName: order.vesselName,
      voyageNumber: order.voyageNumber,
      portOfLoading: order.portOfLoading,
      portOfDischarge: order.portOfDischarge,
      estimatedDeparture: order.estimatedDeparture,
      estimatedArrival: order.estimatedArrival,
      actualDeparture: order.actualDeparture,
      actualArrival: order.actualArrival,
      // Legacy
      commercialInvoiceId: order.commercialInvoiceId,
    },
    warehouse: {
      warehouseCode: order.warehouseCode,
      warehouseName: order.warehouseName,
      customsEntryNumber: order.customsEntryNumber,
      customsClearedDate: order.customsClearedDate,
      dutyAmount: order.dutyAmount ? Number(order.dutyAmount) : null,
      dutyCurrency: order.dutyCurrency,
      surrenderBlDate: order.surrenderBlDate,
      transactionCertNumber: order.transactionCertNumber,
      receivedDate: order.receivedDate,
      discrepancyNotes: order.discrepancyNotes,
      // Legacy
      warehouseInvoiceId: order.warehouseInvoiceId,
      surrenderBL: order.surrenderBL,
      transactionCertificate: order.transactionCertificate,
      customsDeclaration: order.customsDeclaration,
    },
    shipped: {
      shipToName: order.shipToName,
      shipToAddress: order.shipToAddress,
      shipToCity: order.shipToCity,
      shipToCountry: order.shipToCountry,
      shipToPostalCode: order.shipToPostalCode,
      shippingCarrier: order.shippingCarrier,
      shippingMethod: order.shippingMethod,
      trackingNumber: order.trackingNumber,
      shippedDate: order.shippedDate,
      proofOfDeliveryRef: order.proofOfDeliveryRef,
      deliveredDate: order.deliveredDate,
      // Legacy
      proofOfDelivery: order.proofOfDelivery,
      shippedAt: order.shippedAt,
      shippedBy: order.shippedByName,
    },
  }
}

/**
 * Helper to serialize a date field
 */
function serializeDate(value: Date | null | undefined): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

/**
 * Serialize stage data dates to ISO strings
 */
function serializeStageData(data: StageData): SerializedStageData {
  return {
    manufacturing: {
      ...data.manufacturing,
      proformaInvoiceDate: serializeDate(data.manufacturing.proformaInvoiceDate),
      manufacturingStartDate: serializeDate(data.manufacturing.manufacturingStartDate),
      expectedCompletionDate: serializeDate(data.manufacturing.expectedCompletionDate),
      actualCompletionDate: serializeDate(data.manufacturing.actualCompletionDate),
      // Legacy
      manufacturingStart: serializeDate(data.manufacturing.manufacturingStart),
      manufacturingEnd: serializeDate(data.manufacturing.manufacturingEnd),
    },
    ocean: {
      ...data.ocean,
      estimatedDeparture: serializeDate(data.ocean.estimatedDeparture),
      estimatedArrival: serializeDate(data.ocean.estimatedArrival),
      actualDeparture: serializeDate(data.ocean.actualDeparture),
      actualArrival: serializeDate(data.ocean.actualArrival),
    },
    warehouse: {
      ...data.warehouse,
      customsClearedDate: serializeDate(data.warehouse.customsClearedDate),
      surrenderBlDate: serializeDate(data.warehouse.surrenderBlDate),
      receivedDate: serializeDate(data.warehouse.receivedDate),
    },
    shipped: {
      ...data.shipped,
      shippedDate: serializeDate(data.shipped.shippedDate),
      deliveredDate: serializeDate(data.shipped.deliveredDate),
      // Legacy
      shippedAt: serializeDate(data.shipped.shippedAt),
    },
  }
}

function getLatestGrnNumber(order: PurchaseOrderWithOptionalLines): string | null {
  if (!order.grns || order.grns.length === 0) {
    return null
  }

  let latestReference: string | null = null
  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const grn of order.grns) {
    if (typeof grn.referenceNumber !== 'string') {
      continue
    }

    const trimmedReference = grn.referenceNumber.trim()
    if (trimmedReference.length === 0) {
      continue
    }

    const receivedAtTimestamp = grn.receivedAt.getTime()
    const createdAtTimestamp = grn.createdAt.getTime()
    const effectiveTimestamp = Number.isNaN(receivedAtTimestamp)
      ? createdAtTimestamp
      : receivedAtTimestamp

    if (effectiveTimestamp > latestTimestamp) {
      latestTimestamp = effectiveTimestamp
      latestReference = trimmedReference
    }
  }

  return latestReference
}

/**
 * Serialize a PurchaseOrder for API responses
 */
export function serializePurchaseOrder(
  order: PurchaseOrderWithOptionalLines,
  options?: { defaultCurrency?: string }
): Record<string, unknown> {
  const defaultCurrency = options?.defaultCurrency ?? 'USD'

  const lastLineUpdatedAt = (() => {
    if (!order.lines || order.lines.length === 0) return null
    let max = order.lines[0].updatedAt
    for (const line of order.lines) {
      if (line.updatedAt > max) {
        max = line.updatedAt
      }
    }
    return max
  })()

  const lastChangedAt =
    lastLineUpdatedAt && lastLineUpdatedAt > order.updatedAt ? lastLineUpdatedAt : order.updatedAt

  const rfqPdfGeneratedAt = order.rfqPdfGeneratedAt ?? null
  const poPdfGeneratedAt = order.poPdfGeneratedAt ?? null
  const shippingMarksGeneratedAt = order.shippingMarksGeneratedAt ?? null

  return {
    id: order.id,
    orderNumber: toPublicOrderNumber(order.orderNumber),
    skuGroup: order.skuGroup ?? null,
    poNumber: order.poNumber,
    grnNumber: getLatestGrnNumber(order),
    splitGroupId: order.splitGroupId ?? null,
    splitParentId: order.splitParentId ?? null,
    type: order.type,
    status: normalizeWorkflowStatus(order.status as PurchaseOrderStatus),
    warehouseCode: order.warehouseCode,
    warehouseName: order.warehouseName,
    counterpartyName: order.counterpartyName,
    expectedDate: order.expectedDate?.toISOString() ?? null,
    incoterms: order.incoterms,
    paymentTerms: order.paymentTerms,
    manufacturingStartDate: order.manufacturingStartDate?.toISOString() ?? null,
    notes: order.notes,
    receiveType: order.receiveType,
    postedAt: order.postedAt ? order.postedAt.toISOString() : null,
    isLegacy: order.isLegacy,
    outputs: {
      rfqPdf: {
        generatedAt: rfqPdfGeneratedAt ? rfqPdfGeneratedAt.toISOString() : null,
        generatedByName: order.rfqPdfGeneratedByName ?? null,
        outOfDate: rfqPdfGeneratedAt ? rfqPdfGeneratedAt < lastChangedAt : false,
      },
      poPdf: {
        generatedAt: poPdfGeneratedAt ? poPdfGeneratedAt.toISOString() : null,
        generatedByName: order.poPdfGeneratedByName ?? null,
        outOfDate: poPdfGeneratedAt ? poPdfGeneratedAt < lastChangedAt : false,
      },
      shippingMarks: {
        generatedAt: shippingMarksGeneratedAt ? shippingMarksGeneratedAt.toISOString() : null,
        generatedByName: order.shippingMarksGeneratedByName ?? null,
        outOfDate: shippingMarksGeneratedAt ? shippingMarksGeneratedAt < lastChangedAt : false,
      },
    },

    // Stage data - serialize dates to ISO strings
    stageData: serializeStageData(getStageData(order)),
    proformaInvoices: order.proformaInvoices
      ? order.proformaInvoices.map(pi => ({
          id: pi.id,
          piNumber: pi.piNumber,
          invoiceDate: pi.invoiceDate ? pi.invoiceDate.toISOString() : null,
        }))
      : [],
    approvalHistory: getStageApprovalHistory(order).map(h => ({
      ...h,
      approvedAt: h.approvedAt?.toISOString() ?? null,
    })),

    // Metadata
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    createdById: order.createdById,
    createdByName: order.createdByName,

    // Lines if included
	    lines: order.lines?.map(line => ({
	      id: line.id,
	      skuCode: line.skuCode,
	      skuDescription: line.skuDescription,
	      lotRef: line.lotRef,
        piNumber: line.piNumber ?? null,
        commodityCode: line.commodityCode ?? null,
        countryOfOrigin: line.countryOfOrigin ?? null,
        netWeightKg: toFiniteNumber(line.netWeightKg),
        material: line.material ?? null,
        cartonDimensionsCm: line.cartonDimensionsCm ?? null,
        cartonSide1Cm: toFiniteNumber(line.cartonSide1Cm),
        cartonSide2Cm: toFiniteNumber(line.cartonSide2Cm),
        cartonSide3Cm: toFiniteNumber(line.cartonSide3Cm),
        cartonWeightKg: toFiniteNumber(line.cartonWeightKg),
        packagingType: line.packagingType ? line.packagingType.trim().toUpperCase() : null,
        storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
        shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
        cartonRangeStart: line.cartonRangeStart ?? null,
        cartonRangeEnd: line.cartonRangeEnd ?? null,
        cartonRangeTotal: line.cartonRangeTotal ?? null,
	      unitsOrdered: line.unitsOrdered,
	      unitsPerCarton: line.unitsPerCarton,
	      quantity: line.quantity,
	      unitCost: line.unitCost !== null && line.unitCost !== undefined ? Number(Math.abs(Number(line.unitCost)).toFixed(2)) : null,
	      totalCost: line.totalCost !== null && line.totalCost !== undefined ? Number(Math.abs(Number(line.totalCost)).toFixed(2)) : null,
	      currency: line.currency ?? defaultCurrency,
	      status: line.status,
	      postedQuantity: line.postedQuantity,
	      quantityReceived: line.quantityReceived,
      lineNotes: line.lineNotes,
      createdAt: line.createdAt?.toISOString?.() ?? line.createdAt,
      updatedAt: line.updatedAt?.toISOString?.() ?? line.updatedAt,
    })),
  }
}
