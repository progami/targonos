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
  Prisma,
} from '@targon/prisma-talos'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/api'
import { canApproveStageTransition, hasPermission, isSuperAdmin } from './permission-service'
import { auditLog } from '@/lib/security/audit-logger'
import { toPublicOrderNumber } from './purchase-order-utils'
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
type PurchaseOrderWithOptionalLines = PurchaseOrder & {
  lines?: PurchaseOrderLine[]
  proformaInvoices?: PurchaseOrderProformaInvoice[]
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

// Valid stage transitions for new 5-stage workflow
export const VALID_TRANSITIONS: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  // RFQ = editable PO shared with supplier (negotiation)
  DRAFT: [PurchaseOrderStatus.ISSUED, PurchaseOrderStatus.REJECTED, PurchaseOrderStatus.CANCELLED],
  ISSUED: [
    PurchaseOrderStatus.MANUFACTURING,
    PurchaseOrderStatus.CANCELLED,
  ],
  MANUFACTURING: [PurchaseOrderStatus.OCEAN, PurchaseOrderStatus.CANCELLED],
  OCEAN: [PurchaseOrderStatus.WAREHOUSE, PurchaseOrderStatus.CANCELLED],
  WAREHOUSE: [PurchaseOrderStatus.CANCELLED],
  SHIPPED: [], // Terminal state
  REJECTED: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.CANCELLED], // Terminal unless reopened
  CANCELLED: [], // Terminal state
}

// Stage-specific required fields for transition
export const STAGE_REQUIREMENTS: Record<string, string[]> = {
  // Issued = PO issued to supplier
  ISSUED: ['expectedDate', 'incoterms', 'paymentTerms'],
  // Manufacturing = production started
  MANUFACTURING: ['manufacturingStartDate'],
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
  MANUFACTURING: ['box_artwork'],
  OCEAN: ['commercial_invoice', 'bill_of_lading', 'packing_list'],
  WAREHOUSE: ['movement_note', 'custom_declaration'],
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
  const validTargets = VALID_TRANSITIONS[fromStatus]
  return validTargets?.includes(toStatus) ?? false
}

/**
 * Get valid next stages from current status
 */
export function getValidNextStages(currentStatus: PurchaseOrderStatus): PurchaseOrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] ?? []
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

function validateCustomsEntryNumberFormat(params: { tenantCode: string; customsEntryNumber: string }): boolean {
  const normalized = params.customsEntryNumber.replace(/\s+/g, '').toUpperCase()

  if (params.tenantCode === 'US') {
    const digits = normalized.replace(/[^0-9]/g, '')
    return digits.length === 11
  }

  if (params.tenantCode === 'UK') {
    return /^[0-9]{2}[A-Z]{2}[A-Z0-9]{14}$/.test(normalized)
  }

  return normalized.length > 0
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

    const piNumbers: string[] = []
    for (const line of activeLines) {
      const piNumber = typeof line.piNumber === 'string' ? normalizePiNumber(line.piNumber) : ''
      if (!piNumber) {
        recordGateIssue(issues, `cargo.lines.${line.id}.piNumber`, 'PI number is required')
      } else {
        piNumbers.push(piNumber)
      }
    }

    const uniquePiNumbers = Array.from(new Set(piNumbers))
    if (uniquePiNumbers.length > 0) {
      const requiredDocTypes = uniquePiNumbers.map(piNumber => buildPiDocumentType(piNumber))
      await requireDocuments({
        prisma: params.prisma,
        purchaseOrderId: params.order.id,
        stage: PurchaseOrderDocumentStage.ISSUED,
        documentTypes: requiredDocTypes,
        issues,
        issueKeyPrefix: 'documents.pi',
        issueLabel: (docType) => `PI document (${docType.replace(/^pi_/, '').toUpperCase()})`,
      })
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
    }
  }

  if (params.targetStatus === PurchaseOrderStatus.OCEAN) {
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

    const manufacturingStartDate = resolveOrderDate(
      'manufacturingStartDate',
      params.stageData,
      params.order,
      'Manufacturing start date'
    )
    if (!manufacturingStartDate) {
      recordGateIssue(issues, 'details.manufacturingStartDate', 'Manufacturing start date is required')
    }

    await requireDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      stage: PurchaseOrderDocumentStage.MANUFACTURING,
      documentTypes: ['box_artwork'],
      issues,
      issueKeyPrefix: 'documents',
      issueLabel: () => 'Box artwork',
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

    await requireDocuments({
      prisma: params.prisma,
      purchaseOrderId: params.order.id,
      stage: PurchaseOrderDocumentStage.OCEAN,
      documentTypes: ['commercial_invoice', 'bill_of_lading', 'packing_list'],
      issues,
      issueKeyPrefix: 'documents',
      issueLabel: (docType) => docType.replace(/_/g, ' '),
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
 * Generate the next order number in sequence (TG-<Country>-<number> format)
 * Used as RFQ number in DRAFT and becomes PO number at ISSUED.
 *
 * Format: TG-US-2601, TG-US-2602, etc. for US tenant
 *         TG-UK-2601, TG-UK-2602, etc. for UK tenant
 *
 * Starting number: 2601
 */
export async function generateOrderNumber(): Promise<string> {
  const prisma = await getTenantPrisma()

  const tenant = await getCurrentTenant()
  const prefix = `TG-${tenant.code}-`
  const startingNumber = 2601

  const lastOrderRows = await prisma.$queryRaw<{ order_number: string | null }[]>`
    SELECT order_number
    FROM purchase_orders
    WHERE order_number LIKE ${`${prefix}%`}
    ORDER BY CAST(substring(order_number FROM '\\d+$') AS bigint) DESC
    LIMIT 1
  `

  const lastOrderNumber = lastOrderRows.length > 0 ? lastOrderRows[0]?.order_number : null

  let nextNumber = startingNumber
  if (typeof lastOrderNumber === 'string') {
    const match = lastOrderNumber.match(new RegExp(`^${prefix}(\\d+)$`))
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  return `${prefix}${nextNumber}`
}

export interface CreatePurchaseOrderLineInput {
  skuCode: string
  skuDescription?: string
  batchLot: string
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
 * Create a new Purchase Order in DRAFT status
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
      description: true
      cartonDimensionsCm: true
      cartonSide1Cm: true
      cartonSide2Cm: true
      cartonSide3Cm: true
      cartonWeightKg: true
      packagingType: true
    }
  }>

  type LineBatchRecord = Prisma.SkuBatchGetPayload<{
    select: {
      skuId: true
      batchCode: true
      cartonDimensionsCm: true
      cartonSide1Cm: true
      cartonSide2Cm: true
      cartonSide3Cm: true
      cartonWeightKg: true
      packagingType: true
      storageCartonsPerPallet: true
      shippingCartonsPerPallet: true
    }
  }>

  let skuRecordsForLines: LineSkuRecord[] = []

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
      batchLot: line.batchLot?.trim() ? line.batchLot.trim().toUpperCase() : undefined,
    }))

    const keySet = new Set<string>()
    for (const line of normalizedLines) {
      if (!line.skuCode) {
        throw new ValidationError('SKU code is required for all line items')
      }

      const key = `${line.skuCode.toLowerCase()}::${line.batchLot?.trim().toUpperCase()}`
      if (keySet.has(key)) {
        throw new ValidationError(
          `Duplicate SKU/batch line detected: ${line.skuCode} ${line.batchLot}. Combine quantities into a single line.`
        )
      }
      keySet.add(key)

      if (!line.batchLot || line.batchLot === 'DEFAULT') {
        throw new ValidationError(`Batch is required for SKU ${line.skuCode}`)
      }

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

    input.lines = normalizedLines
    skuRecordsForLines = skus
  }

  const MAX_ORDER_NUMBER_ATTEMPTS = 5
  let order: PurchaseOrderWithLines | null = null

  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const orderNumber = await generateOrderNumber()

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
          const batchByKey = new Map<string, LineBatchRecord>()

	        if (input.lines && input.lines.length > 0) {
	          const requiredCombos: Array<{ skuId: string; skuCode: string; batchCode: string }> = []
	          const requiredKeySet = new Set<string>()

	          for (const line of input.lines) {
	            const skuRecord = skuByCode.get(line.skuCode.trim().toLowerCase())
	            if (!skuRecord) continue

	            const batchCode = line.batchLot?.trim().toUpperCase() ?? ''
	            if (!batchCode || batchCode === 'DEFAULT') {
	              throw new ValidationError(`Batch is required for SKU ${skuRecord.skuCode}`)
	            }

	            const key = `${skuRecord.id}::${batchCode}`
	            if (requiredKeySet.has(key)) continue
	            requiredKeySet.add(key)

	            requiredCombos.push({
	              skuId: skuRecord.id,
	              skuCode: skuRecord.skuCode,
	              batchCode,
	            })
	          }

	          if (requiredCombos.length > 0) {
	            const existing = await tx.skuBatch.findMany({
	              where: {
	                OR: requiredCombos.map(combo => ({
	                  skuId: combo.skuId,
	                  batchCode: { equals: combo.batchCode, mode: 'insensitive' },
	                })),
	              },
	              select: {
                  skuId: true,
                  batchCode: true,
                  cartonDimensionsCm: true,
                  cartonSide1Cm: true,
                  cartonSide2Cm: true,
                  cartonSide3Cm: true,
                  cartonWeightKg: true,
                  packagingType: true,
                  storageCartonsPerPallet: true,
                  shippingCartonsPerPallet: true,
                },
	            })

	            const existingMap = new Set(
	              existing.map(row => `${row.skuId}::${row.batchCode.toUpperCase()}`)
	            )

	            for (const combo of requiredCombos) {
	              if (!existingMap.has(`${combo.skuId}::${combo.batchCode}`)) {
	                throw new ValidationError(
	                  `Batch ${combo.batchCode} not found for SKU ${combo.skuCode}. Create it in Products → Batches first.`
	                )
	              }
	            }

              existing.forEach(row => {
                batchByKey.set(`${row.skuId}::${row.batchCode.toUpperCase()}`, row)
              })
	          }
	        }

	        return tx.purchaseOrder.create({
	          data: {
	            orderNumber,
            type: 'PURCHASE',
            status: 'DRAFT',
	            counterpartyName: counterpartyNameCanonical,
	            counterpartyAddress,
            expectedDate,
            incoterms,
            paymentTerms,
            notes: input.notes,
            createdById: user.id,
            createdByName: user.name,
            isLegacy: false,
            // Create lines if provided
            lines:
              input.lines && input.lines.length > 0
                ? {
                    create: input.lines.map(line => ({
                      ...(line.batchLot
                        ? (() => {
                            const skuRecord = skuByCode.get(line.skuCode.trim().toLowerCase())
                            const batchCode = line.batchLot.trim().toUpperCase()
                            const batchRecord = skuRecord
                              ? batchByKey.get(`${skuRecord.id}::${batchCode}`)
                              : null

                            const baseDimensionsCm =
                              batchRecord?.cartonDimensionsCm ?? skuRecord?.cartonDimensionsCm ?? null
                            const baseTriplet = resolveDimensionTripletCm({
                              side1Cm: batchRecord?.cartonSide1Cm ?? skuRecord?.cartonSide1Cm ?? null,
                              side2Cm: batchRecord?.cartonSide2Cm ?? skuRecord?.cartonSide2Cm ?? null,
                              side3Cm: batchRecord?.cartonSide3Cm ?? skuRecord?.cartonSide3Cm ?? null,
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
                                  cartonSide1Cm: batchRecord?.cartonSide1Cm ?? skuRecord?.cartonSide1Cm ?? null,
                                  cartonSide2Cm: batchRecord?.cartonSide2Cm ?? skuRecord?.cartonSide2Cm ?? null,
                                  cartonSide3Cm: batchRecord?.cartonSide3Cm ?? skuRecord?.cartonSide3Cm ?? null,
                                }

                            const overrideCartonWeightKg =
                              typeof line.cartonWeightKg === 'number' && Number.isFinite(line.cartonWeightKg)
                                ? new Prisma.Decimal(line.cartonWeightKg.toFixed(3))
                                : null

                            return {
                              batchLot: batchRecord?.batchCode ?? batchCode,
                              skuDescription:
                                typeof line.skuDescription === 'string' && line.skuDescription.trim()
                                  ? line.skuDescription
                                  : skuRecord?.description ?? '',
                              ...dimensionData,
                              cartonWeightKg:
                                overrideCartonWeightKg ??
                                batchRecord?.cartonWeightKg ??
                                skuRecord?.cartonWeightKg ??
                                null,
                              packagingType: batchRecord?.packagingType ?? skuRecord?.packagingType ?? null,
                              storageCartonsPerPallet: batchRecord?.storageCartonsPerPallet ?? null,
                              shippingCartonsPerPallet: batchRecord?.shippingCartonsPerPallet ?? null,
                            }
                          })()
                        : {
                            skuDescription:
                              typeof line.skuDescription === 'string' && line.skuDescription.trim()
                                ? line.skuDescription
                                : skuByCode.get(line.skuCode.trim().toLowerCase())?.description ?? '',
                          }),
                      unitsOrdered: line.unitsOrdered,
                      unitsPerCarton: line.unitsPerCarton,
                      skuCode: line.skuCode,
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
                          ? line.totalCost.toFixed(2)
                          : undefined,
                      unitCost:
                        typeof line.totalCost === 'number' &&
                        Number.isFinite(line.totalCost) &&
                        line.unitsOrdered > 0
                          ? (line.totalCost / line.unitsOrdered).toFixed(4)
                          : undefined,
                      currency: line.currency.trim().toUpperCase(),
                      lineNotes: line.notes,
                      status: 'PENDING',
                    })),
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
    data: { orderNumber: order.orderNumber, status: 'DRAFT', lineCount: input.lines?.length ?? 0 },
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

  const currentStatus = order.status as PurchaseOrderStatus

  if (targetStatus === PurchaseOrderStatus.SHIPPED) {
    throw new ValidationError(
      'Purchase orders no longer ship inventory. Create a fulfillment order to ship stock.'
    )
  }

  // Validate the transition is allowed
  if (!isValidTransition(currentStatus, targetStatus)) {
    const validTargets = getValidNextStages(currentStatus)
    throw new ValidationError(
      `Invalid transition from ${currentStatus} to ${targetStatus}. ` +
        `Valid targets: ${validTargets.length > 0 ? validTargets.join(', ') : 'none'}`
    )
  }

  // Check user permission for this transition (unless cancelling)
  if (targetStatus === PurchaseOrderStatus.CANCELLED) {
    const canCancel = await hasPermission(user.id, 'po.cancel')
    if (!canCancel && !isSuperAdmin(user.email)) {
      throw new ValidationError(`You don't have permission to cancel purchase orders`)
    }
  } else {
    const canApprove = await canApproveStageTransition(user.id, currentStatus, targetStatus)

    if (!canApprove && !isSuperAdmin(user.email)) {
      throw new ValidationError(
        `You don't have permission to approve the transition from ${currentStatus} to ${targetStatus}`
      )
    }
  }

  if (targetStatus === PurchaseOrderStatus.CANCELLED) {
    const storageRecalcInputs = await prisma.inventoryTransaction.findMany({
      where: { purchaseOrderId: order.id },
      select: {
        warehouseCode: true,
        warehouseName: true,
        skuCode: true,
        skuDescription: true,
        batchLot: true,
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
        batchLot: transaction.batchLot,
        transactionDate: transaction.transactionDate,
      }))
    )

    return updatedOrder
  }

  // Validate stage data requirements
  const filteredStageData = filterStageDataForTarget(currentStatus, stageData)

  await validateTransitionGate({
    prisma,
    order,
    targetStatus,
    stageData: filteredStageData,
  })

  validateStageDateOrdering(targetStatus, filteredStageData, order)

  const derivedManufacturingTotals =
    targetStatus === PurchaseOrderStatus.MANUFACTURING
      ? await computeManufacturingCargoTotals(order.lines)
      : null

  if (targetStatus === PurchaseOrderStatus.MANUFACTURING && derivedManufacturingTotals) {
    if (derivedManufacturingTotals.totalCartons <= 0) {
      throw new ValidationError('Cannot advance to manufacturing with no cargo lines')
    }
  }

  // Build the update data
  const updateData: Prisma.PurchaseOrderUpdateInput = {
    status: targetStatus,
  }

  if (targetStatus === PurchaseOrderStatus.ISSUED && !order.poNumber) {
    updateData.poNumber = toPublicOrderNumber(order.orderNumber)
  }

  // Stage 2: Manufacturing fields
  if (filteredStageData.proformaInvoiceNumber !== undefined) {
    updateData.proformaInvoiceNumber = filteredStageData.proformaInvoiceNumber
  }
  if (filteredStageData.proformaInvoiceDate !== undefined) {
    updateData.proformaInvoiceDate = new Date(filteredStageData.proformaInvoiceDate)
  }
  if (filteredStageData.factoryName !== undefined) {
    updateData.factoryName = filteredStageData.factoryName
  }
  if (filteredStageData.manufacturingStartDate !== undefined) {
    updateData.manufacturingStartDate = new Date(filteredStageData.manufacturingStartDate)
  }
  if (filteredStageData.expectedCompletionDate !== undefined) {
    updateData.expectedCompletionDate = new Date(filteredStageData.expectedCompletionDate)
  }
  if (filteredStageData.actualCompletionDate !== undefined) {
    updateData.actualCompletionDate = new Date(filteredStageData.actualCompletionDate)
  }
  if (filteredStageData.totalWeightKg !== undefined) {
    updateData.totalWeightKg = filteredStageData.totalWeightKg
  } else if (derivedManufacturingTotals?.totalWeightKg != null) {
    updateData.totalWeightKg = derivedManufacturingTotals.totalWeightKg
  }
  if (filteredStageData.totalVolumeCbm !== undefined) {
    updateData.totalVolumeCbm = filteredStageData.totalVolumeCbm
  } else if (derivedManufacturingTotals?.totalVolumeCbm != null) {
    updateData.totalVolumeCbm = derivedManufacturingTotals.totalVolumeCbm
  }
  if (filteredStageData.totalCartons !== undefined) {
    updateData.totalCartons = filteredStageData.totalCartons
  } else if (derivedManufacturingTotals?.totalCartons) {
    updateData.totalCartons = derivedManufacturingTotals.totalCartons
  }
  if (filteredStageData.totalPallets !== undefined) {
    updateData.totalPallets = filteredStageData.totalPallets
  } else if (derivedManufacturingTotals?.totalPallets != null) {
    updateData.totalPallets = derivedManufacturingTotals.totalPallets
  }
  if (filteredStageData.packagingNotes !== undefined) {
    updateData.packagingNotes = filteredStageData.packagingNotes
  }

  // Stage 3: Ocean fields
  if (filteredStageData.houseBillOfLading !== undefined) {
    updateData.houseBillOfLading = filteredStageData.houseBillOfLading
  }
  if (filteredStageData.masterBillOfLading !== undefined) {
    updateData.masterBillOfLading = filteredStageData.masterBillOfLading
  }
  if (filteredStageData.commercialInvoiceNumber !== undefined) {
    updateData.commercialInvoiceNumber = filteredStageData.commercialInvoiceNumber
  }
  if (filteredStageData.packingListRef !== undefined) {
    updateData.packingListRef = filteredStageData.packingListRef
  }
  if (filteredStageData.vesselName !== undefined) {
    updateData.vesselName = filteredStageData.vesselName
  }
  if (filteredStageData.voyageNumber !== undefined) {
    updateData.voyageNumber = filteredStageData.voyageNumber
  }
  if (filteredStageData.portOfLoading !== undefined) {
    updateData.portOfLoading = filteredStageData.portOfLoading
  }
  if (filteredStageData.portOfDischarge !== undefined) {
    updateData.portOfDischarge = filteredStageData.portOfDischarge
  }
  if (filteredStageData.estimatedDeparture !== undefined) {
    updateData.estimatedDeparture = new Date(filteredStageData.estimatedDeparture)
  }
  if (filteredStageData.estimatedArrival !== undefined) {
    updateData.estimatedArrival = new Date(filteredStageData.estimatedArrival)
  }
  if (filteredStageData.actualDeparture !== undefined) {
    updateData.actualDeparture = new Date(filteredStageData.actualDeparture)
  }
  if (filteredStageData.actualArrival !== undefined) {
    updateData.actualArrival = new Date(filteredStageData.actualArrival)
  }

  // Stage 4: Warehouse fields
  if (filteredStageData.warehouseCode !== undefined) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { code: filteredStageData.warehouseCode },
      select: { name: true },
    })
    if (!warehouse) {
      throw new ValidationError(`Invalid warehouse code: ${filteredStageData.warehouseCode}`)
    }

    updateData.warehouseCode = filteredStageData.warehouseCode
    updateData.warehouseName = filteredStageData.warehouseName ?? warehouse.name
  }
  if (filteredStageData.warehouseName !== undefined && filteredStageData.warehouseCode === undefined) {
    updateData.warehouseName = filteredStageData.warehouseName
  }
  if (filteredStageData.receiveType !== undefined) {
    updateData.receiveType = filteredStageData.receiveType as InboundReceiveType
  }
  if (filteredStageData.customsEntryNumber !== undefined) {
    updateData.customsEntryNumber = filteredStageData.customsEntryNumber
  }
  if (filteredStageData.customsClearedDate !== undefined) {
    updateData.customsClearedDate = new Date(filteredStageData.customsClearedDate)
  }
  if (filteredStageData.dutyAmount !== undefined) {
    updateData.dutyAmount = filteredStageData.dutyAmount
  }
  if (filteredStageData.dutyCurrency !== undefined) {
    updateData.dutyCurrency = filteredStageData.dutyCurrency
  }
  if (filteredStageData.surrenderBlDate !== undefined) {
    updateData.surrenderBlDate = new Date(filteredStageData.surrenderBlDate)
  }
  if (filteredStageData.transactionCertNumber !== undefined) {
    updateData.transactionCertNumber = filteredStageData.transactionCertNumber
  }
  if (filteredStageData.receivedDate !== undefined) {
    updateData.receivedDate = new Date(filteredStageData.receivedDate)
  }
  if (filteredStageData.discrepancyNotes !== undefined) {
    updateData.discrepancyNotes = filteredStageData.discrepancyNotes
  }

  // Legacy fields (for backward compatibility)
  if (filteredStageData.proformaInvoiceId !== undefined) {
    updateData.proformaInvoiceId = filteredStageData.proformaInvoiceId
  }
  if (filteredStageData.proformaInvoiceData !== undefined) {
    updateData.proformaInvoiceData = filteredStageData.proformaInvoiceData
  }
  if (filteredStageData.manufacturingStart !== undefined) {
    updateData.manufacturingStart = new Date(filteredStageData.manufacturingStart)
  }
  if (filteredStageData.manufacturingEnd !== undefined) {
    updateData.manufacturingEnd = new Date(filteredStageData.manufacturingEnd)
  }
  if (filteredStageData.cargoDetails !== undefined) {
    updateData.cargoDetails = filteredStageData.cargoDetails
  }
  if (filteredStageData.commercialInvoiceId !== undefined) {
    updateData.commercialInvoiceId = filteredStageData.commercialInvoiceId
  }
  if (filteredStageData.warehouseInvoiceId !== undefined) {
    updateData.warehouseInvoiceId = filteredStageData.warehouseInvoiceId
  }
  if (filteredStageData.surrenderBL !== undefined) {
    updateData.surrenderBL = filteredStageData.surrenderBL
  }
  if (filteredStageData.transactionCertificate !== undefined) {
    updateData.transactionCertificate = filteredStageData.transactionCertificate
  }
  if (filteredStageData.customsDeclaration !== undefined) {
    updateData.customsDeclaration = filteredStageData.customsDeclaration
  }
  if (filteredStageData.proofOfDelivery !== undefined) {
    updateData.proofOfDelivery = filteredStageData.proofOfDelivery
  }

  // Set approval tracking based on target status
  const now = new Date()
  switch (targetStatus) {
    case PurchaseOrderStatus.ISSUED:
      updateData.draftApprovedAt = now
      updateData.draftApprovedById = user.id
      updateData.draftApprovedByName = user.name
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

  const isDispatchTransition =
    currentStatus === PurchaseOrderStatus.MANUFACTURING && targetStatus === PurchaseOrderStatus.OCEAN

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
        throw new ValidationError(`Missing unit cost for line ${line.skuCode}${line.batchLot ? ` (${line.batchLot})` : ''}`)
      }

      const originalTotalCost =
        line.totalCost !== null && line.totalCost !== undefined ? new Prisma.Decimal(line.totalCost) : null
      if (originalTotalCost === null) {
        throw new ValidationError(`Missing total cost for line ${line.skuCode}${line.batchLot ? ` (${line.batchLot})` : ''}`)
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
          batchLot: line.batchLot,
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
          unitCost: new Prisma.Decimal(unitCost.toFixed(4)),
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
          unitCost: new Prisma.Decimal(unitCost.toFixed(4)),
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
    batchLot: string
    transactionDate: Date
  }> = []

  const MAX_SPLIT_ORDER_ATTEMPTS = 5
  let createdRemainderOrderId: string | null = null

  // Execute the transition + inventory impacts atomically.
  let updatedOrder: PurchaseOrder | null = null

  for (let attempt = 0; attempt < MAX_SPLIT_ORDER_ATTEMPTS; attempt += 1) {
    createdRemainderOrderId = null
    const remainderOrderNumber = dispatchSplitPlan ? await generateOrderNumber() : null

    try {
      updatedOrder = await prisma.$transaction(async tx => {
        if (dispatchSplitPlan && remainderOrderNumber) {
          for (const update of dispatchSplitPlan.shippingLineUpdates) {
            await tx.purchaseOrderLine.update({
              where: { id: update.lineId },
              data: update.data,
            })
          }

          const remainder = await tx.purchaseOrder.create({
            data: {
              orderNumber: remainderOrderNumber,
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
              draftApprovedAt: order.draftApprovedAt,
              draftApprovedById: order.draftApprovedById,
              draftApprovedByName: order.draftApprovedByName,
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
                purchaseOrderId: remainder.id,
              })),
            })
          }

          const documentsToCopy = await tx.purchaseOrderDocument.findMany({
            where: {
              purchaseOrderId: order.id,
              stage: {
                in: [
                  PurchaseOrderDocumentStage.DRAFT,
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
                stage: doc.stage,
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

    if (targetStatus === PurchaseOrderStatus.WAREHOUSE) {
      // Receiving inventory is handled via a dedicated receive action, not the stage transition.
      /*
      const batchCodes = Array.from(new Set(activeLines.map(line => String(line.batchLot))))
      const batchRecords = await tx.skuBatch.findMany({
        where: {
          skuId: { in: skus.map(sku => sku.id) },
          batchCode: { in: batchCodes },
        },
        select: {
          skuId: true,
          batchCode: true,
          unitsPerCarton: true,
          cartonDimensionsCm: true,
          cartonWeightKg: true,
          packagingType: true,
          storageCartonsPerPallet: true,
          shippingCartonsPerPallet: true,
        },
      })
      const batchMap = new Map(
        batchRecords.map(batch => [`${batch.skuId}::${batch.batchCode}`, batch])
      )

      const createdTransactions: Array<{
        id: string
        skuCode: string
        cartons: number
        pallets: number
        cartonDimensionsCm: string | null
        warehouseCode: string
        warehouseName: string
        skuDescription: string
        batchLot: string
        transactionDate: Date
      }> = []

      let totalStoragePalletsIn = 0
      const referenceId =
        nextOrder.commercialInvoiceNumber ??
        nextOrder.proformaInvoiceNumber ??
        toPublicOrderNumber(nextOrder.orderNumber)

      for (const line of activeLines) {
        const sku = skuMap.get(line.skuCode)
        if (!sku) continue

        const batchLot = String(line.batchLot)
        const batch = batchMap.get(`${sku.id}::${batchLot}`)
        if (!batch) {
          throw new ValidationError(
            `Batch ${batchLot} is not configured for SKU ${line.skuCode}. Create it in Config → Products → Batches.`
          )
        }

        const storageCartonsPerPallet = batch.storageCartonsPerPallet ?? null
        const shippingCartonsPerPallet = batch.shippingCartonsPerPallet ?? null

        if (!storageCartonsPerPallet || storageCartonsPerPallet <= 0) {
          throw new ValidationError(
            `Storage cartons per pallet is required for SKU ${line.skuCode} batch ${batchLot}. Configure it on the batch in Config → Products → Batches.`
          )
        }

        if (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0) {
          throw new ValidationError(
            `Shipping cartons per pallet is required for SKU ${line.skuCode} batch ${batchLot}. Configure it on the batch in Config → Products → Batches.`
          )
        }

        const cartons = line.quantity
        if (!Number.isInteger(cartons) || cartons <= 0) {
          throw new ValidationError(`Invalid cartons quantity for SKU ${line.skuCode}`)
        }

        const unitsPerCarton = line.unitsPerCarton ?? batch.unitsPerCarton ?? sku.unitsPerCarton ?? 1

        const { storagePalletsIn } = calculatePalletValues({
          transactionType: 'RECEIVE',
          cartons,
          storageCartonsPerPallet,
        })

        if (storagePalletsIn <= 0) {
          throw new ValidationError(`Storage pallet count is required for inbound transactions`)
        }

        const txRow = await tx.inventoryTransaction.create({
          data: {
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            warehouseAddress: warehouse.address,
            skuCode: sku.skuCode,
            skuDescription: line.skuDescription ?? sku.description,
            unitDimensionsCm: sku.unitDimensionsCm,
            unitWeightKg: sku.unitWeightKg,
            cartonDimensionsCm: batch.cartonDimensionsCm ?? sku.cartonDimensionsCm,
            cartonWeightKg: batch.cartonWeightKg ?? sku.cartonWeightKg,
            packagingType: batch.packagingType ?? sku.packagingType,
            unitsPerCarton,
            batchLot,
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
            supplier: nextOrder.counterpartyName ?? null,
            attachments: null,
            transactionDate: receivedAt,
            pickupDate: receivedAt,
            createdById: user.id,
            createdByName: user.name,
            purchaseOrderId: nextOrder.id,
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
            batchLot: true,
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
          batchLot: txRow.batchLot,
          transactionDate: txRow.transactionDate,
        })

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            postedQuantity: cartons,
            quantityReceived: cartons,
            status:
              cartons >= line.quantity
                ? PurchaseOrderLineStatus.POSTED
                : PurchaseOrderLineStatus.PENDING,
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
          warehouseId: warehouse.id,
          isActive: true,
          effectiveDate: { lte: receivedAt },
          OR: [{ endDate: null }, { endDate: { gte: receivedAt } }],
        },
        orderBy: [{ costName: 'asc' }, { effectiveDate: 'desc' }],
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
          receiveType: nextOrder.receiveType,
          shipMode: null,
          ratesByCostName,
          lines: createdTransactions.map(row => ({
            transactionId: row.id,
            skuCode: row.skuCode,
            cartons: row.cartons,
            pallets: row.pallets,
            cartonDimensionsCm: row.cartonDimensionsCm,
          })),
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          createdAt: receivedAt,
          createdByName: user.name,
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
            batchLot: txRow.batchLot,
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
          purchaseOrderId: nextOrder.id,
          warehouseId: warehouse.id,
        },
        select: {
          costName: true,
          totalCost: true,
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

        let forwardingLedgerEntries: Prisma.CostLedgerCreateManyInput[] = []
        try {
          forwardingLedgerEntries = forwardingCosts.flatMap(cost =>
            buildPoForwardingCostLedgerEntries({
              costName: cost.costName,
              totalCost: Number(cost.totalCost),
              lines,
              warehouseCode: warehouse.code,
              warehouseName: warehouse.name,
              createdAt: receivedAt,
              createdByName: user.name,
            })
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cost allocation failed'
          throw new ValidationError(message)
        }

        if (forwardingLedgerEntries.length > 0) {
          await tx.costLedger.createMany({ data: forwardingLedgerEntries })

          const inserted = await tx.costLedger.findMany({
            where: {
              transactionId: { in: transactionIds },
              costCategory: CostCategory.Forwarding,
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
              batchLot: txRow.batchLot,
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

      await tx.purchaseOrder.update({
        where: { id: nextOrder.id },
        data: {
          postedAt: nextOrder.postedAt ?? receivedAt,
        },
      })

      storageCostInputs.push(
        ...createdTransactions.map(row => ({
          warehouseCode: row.warehouseCode,
          warehouseName: row.warehouseName,
          skuCode: row.skuCode,
          skuDescription: row.skuDescription,
          batchLot: row.batchLot,
          transactionDate: row.transactionDate,
        }))
      )
      */
    }

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

  // Audit log the transition
  const auditOldValue: Record<string, unknown> = { status: currentStatus }
  const auditNewValue: Record<string, unknown> = {
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
    action: 'STATUS_TRANSITION',
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
          `Storage cost recording failed for ${input.warehouseCode}/${input.skuCode}/${input.batchLot}:`,
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
  customsEntryNumber: string
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
    throw new ConflictError('Inventory can only be received at the At Warehouse stage')
  }

  if (order.postedAt) {
    throw new ConflictError('Inventory has already been received for this purchase order')
  }

  const tenant = await getCurrentTenant()
  const tenantCode = tenant.code

  const issues: Record<string, string> = {}

  const warehouseCode = params.input.warehouseCode.trim()
  if (!warehouseCode) {
    recordGateIssue(issues, 'details.warehouseCode', 'Warehouse is required')
  }

  const receiveType = params.input.receiveType
  if (!receiveType) {
    recordGateIssue(issues, 'details.receiveType', 'Receive type is required')
  }

  const customsEntryNumber = params.input.customsEntryNumber.trim()
  if (!customsEntryNumber) {
    recordGateIssue(issues, 'details.customsEntryNumber', 'Import entry number is required')
  } else if (!validateCustomsEntryNumberFormat({ tenantCode, customsEntryNumber })) {
    recordGateIssue(issues, 'details.customsEntryNumber', 'Import entry number format is invalid')
  }

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
    documentTypes: ['movement_note', 'custom_declaration'],
    issues,
    issueKeyPrefix: 'documents',
    issueLabel: (docType) =>
      docType === 'custom_declaration'
        ? 'Customs & Border Patrol Clearance Proof'
        : 'Movement Note',
  })

  if (warehouse) {
    const forwardingCost = await prisma.purchaseOrderForwardingCost.findFirst({
      where: { purchaseOrderId: order.id, warehouseId: warehouse.id },
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
    batchLot: string
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

    const batchCodes = Array.from(
      new Set(activeLines.map(line => (typeof line.batchLot === 'string' ? line.batchLot : '')))
    ).filter(code => code.trim().length > 0)

    const batchRecords = await tx.skuBatch.findMany({
      where: {
        skuId: { in: skus.map(sku => sku.id) },
        batchCode: { in: batchCodes },
      },
      select: {
        skuId: true,
        batchCode: true,
        unitsPerCarton: true,
        cartonDimensionsCm: true,
        cartonWeightKg: true,
        packagingType: true,
        storageCartonsPerPallet: true,
        shippingCartonsPerPallet: true,
      },
    })
    const batchMap = new Map(
      batchRecords.map(batch => [`${batch.skuId}::${batch.batchCode}`, batch])
    )

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
      batchLot: string
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

      const batchLot = typeof line.batchLot === 'string' ? line.batchLot : ''
      const batch =
        batchLot.trim().length > 0 ? batchMap.get(`${sku.id}::${batchLot}`) : undefined

      const storageCartonsPerPallet =
        line.storageCartonsPerPallet && line.storageCartonsPerPallet > 0
          ? line.storageCartonsPerPallet
          : batch?.storageCartonsPerPallet ?? null
      const shippingCartonsPerPallet =
        line.shippingCartonsPerPallet && line.shippingCartonsPerPallet > 0
          ? line.shippingCartonsPerPallet
          : batch?.shippingCartonsPerPallet ?? null

      if (!storageCartonsPerPallet || storageCartonsPerPallet <= 0) {
        throw new ValidationError(
          `Storage cartons per pallet is required for SKU ${line.skuCode} batch ${batchLot}. Configure it on the batch in Config → Products → Batches.`
        )
      }

      if (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0) {
        throw new ValidationError(
          `Shipping cartons per pallet is required for SKU ${line.skuCode} batch ${batchLot}. Configure it on the batch in Config → Products → Batches.`
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
          cartonDimensionsCm: line.cartonDimensionsCm ?? batch?.cartonDimensionsCm ?? sku.cartonDimensionsCm,
          cartonWeightKg: line.cartonWeightKg ?? batch?.cartonWeightKg ?? sku.cartonWeightKg,
          packagingType: line.packagingType ?? batch?.packagingType ?? sku.packagingType,
          unitsPerCarton: line.unitsPerCarton,
          batchLot,
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
          batchLot: true,
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
        batchLot: txRow.batchLot,
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
        effectiveDate: { lte: receivedAt },
        OR: [{ endDate: null }, { endDate: { gte: receivedAt } }],
      },
      orderBy: [{ costName: 'asc' }, { effectiveDate: 'desc' }],
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
          batchLot: txRow.batchLot,
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
        warehouseId: warehouse!.id,
      },
      select: {
        costName: true,
        totalCost: true,
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

      let forwardingLedgerEntries: Prisma.CostLedgerCreateManyInput[] = []
      try {
        forwardingLedgerEntries = forwardingCosts.flatMap(cost =>
          buildPoForwardingCostLedgerEntries({
            costName: cost.costName,
            totalCost: Number(cost.totalCost),
            lines,
            warehouseCode: warehouse!.code,
            warehouseName: warehouse!.name,
            createdAt: receivedAt,
            createdByName: params.user.name,
          })
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cost allocation failed'
        throw new ValidationError(message)
      }

      if (forwardingLedgerEntries.length > 0) {
        await tx.costLedger.createMany({ data: forwardingLedgerEntries })

        const inserted = await tx.costLedger.findMany({
          where: {
            transactionId: { in: transactionIds },
            costCategory: CostCategory.Forwarding,
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
            batchLot: txRow.batchLot,
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
        batchLot: row.batchLot,
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
          `Storage cost recording failed for ${input.warehouseCode}/${input.skuCode}/${input.batchLot}:`,
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

  if (order.status === PurchaseOrderStatus.DRAFT) {
    throw new ConflictError('Shipping marks can be generated after the RFQ is issued')
  }

  if (order.status === PurchaseOrderStatus.CANCELLED || order.status === PurchaseOrderStatus.REJECTED) {
    throw new ConflictError(`Cannot generate shipping marks for ${order.status.toLowerCase()} purchase orders`)
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

  const labels = activeLines.flatMap(line => {
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
    const shippingMark = `${line.skuCode}${line.batchLot ? ` - ${line.batchLot}` : ''}`

    const perCarton: string[] = []
    for (let index = cartonRange.start; index <= cartonRange.end; index += 1) {
      perCarton.push(`
        <div class="label">
          <div class="label-header">${escapeHtml(piNumber)} / TARGON/唛头格式</div>
          <div class="label-row"><span class="k">Carton</span><span class="v">${index} / ${cartonRange.total} Ctns</span></div>
          <div class="label-row"><span class="k">Shipping Mark</span><span class="v">${escapeHtml(shippingMark)}</span></div>
          <div class="label-row"><span class="k">Commodity Code</span><span class="v mono">${escapeHtml(commodityLabel)}</span></div>
          <div class="label-row"><span class="k"># of Units</span><span class="v">${line.unitsPerCarton} sets</span></div>
          <div class="label-row"><span class="k">Net Weight</span><span class="v">${escapeHtml(netWeightLabel)}</span></div>
          <div class="label-row"><span class="k">Gross Weight</span><span class="v">${escapeHtml(grossWeightLabel)}</span></div>
          <div class="label-row"><span class="k">Dimensions</span><span class="v mono">${escapeHtml(dimsLabel)}</span></div>
          <div class="label-row"><span class="k">Material</span><span class="v">${escapeHtml(material)}</span></div>
          <div class="label-footer">${escapeHtml(origin)}</div>
        </div>
      `)
    }

    return perCarton
  })

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shipping Marks</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 16px; background: #f6f7fb; }
      .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
      .print-btn { background: #0ea5a4; color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: 600; cursor: pointer; }
      .meta { color: #475569; font-size: 12px; }
      .labels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .label { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 12px 10px 12px; break-inside: avoid; }
      .label-header { font-weight: 700; font-size: 12px; margin-bottom: 8px; }
      .label-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px dashed #e2e8f0; }
      .label-row:last-of-type { border-bottom: none; }
      .k { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
      .v { color: #0f172a; font-size: 12px; font-weight: 600; text-align: right; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }
      .label-footer { margin-top: 8px; text-align: center; font-weight: 800; color: #0f172a; }
      @media print {
        body { background: white; padding: 0; }
        .toolbar { display: none; }
        .labels { gap: 8px; }
        .label { border-radius: 8px; }
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

  if (order.draftApprovedAt) {
    history.push({
      stage: 'RFQ → ISSUED',
      approvedAt: order.draftApprovedAt,
      approvedBy: order.draftApprovedByName,
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
    poNumber: order.poNumber,
    splitGroupId: order.splitGroupId ?? null,
    splitParentId: order.splitParentId ?? null,
    type: order.type,
    status: order.status,
    warehouseCode: order.warehouseCode,
    warehouseName: order.warehouseName,
    counterpartyName: order.counterpartyName,
    expectedDate: order.expectedDate?.toISOString() ?? null,
    incoterms: order.incoterms,
    paymentTerms: order.paymentTerms,
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
	      batchLot: line.batchLot,
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
	      unitCost: line.unitCost ? Number(line.unitCost) : null,
	      totalCost: line.totalCost ? Number(line.totalCost) : null,
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
