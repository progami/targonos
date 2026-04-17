import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { validateFile } from '@/lib/security/file-upload'
import { enforceCrossTenantManufacturingOnlyForPurchaseOrder } from '@/lib/services/purchase-order-cross-tenant-access'
import { PurchaseOrderStatus } from '@targon/prisma-talos'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'
import { ApiResponses } from '@/lib/api'
import { assertPurchaseOrderMutable } from '@/lib/purchase-orders/workflow'
import {
  getPurchaseOrderDocumentStageForStatus,
  parseActivePurchaseOrderDocumentStage,
  PURCHASE_ORDER_DOCUMENT_STAGE_ORDER,
  type ActivePurchaseOrderDocumentStage,
} from '@/lib/purchase-orders/document-stages'

export const dynamic = 'force-dynamic'

const MAX_DOCUMENT_SIZE_MB = 1024
const DISABLE_PO_DOCUMENT_STAGE_LOCK = process.env.TALOS_DISABLE_PO_DOCUMENT_STAGE_LOCK === 'true'

function statusToDocumentStage(status: PurchaseOrderStatus): ActivePurchaseOrderDocumentStage | null {
  return getPurchaseOrderDocumentStageForStatus(status)
}

function parseStage(value: unknown): ActivePurchaseOrderDocumentStage | null {
  return parseActivePurchaseOrderDocumentStage(value)
}

function parseDocumentType(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) return null
  return trimmed
}

export const POST = withAuthAndParams(async (request, params, session) => {
  let purchaseOrderId: string | null = null

  try {
    const { id } = params as { id: string }
    purchaseOrderId = id
    if (!id) {
      return NextResponse.json({ error: 'Purchase order ID is required' }, { status: 400 })
    }

    const payload = await request.json().catch(() => null)
    const fileName = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileName : null
    const fileType = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileType : null
    const fileSize = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileSize : null
    const stageRaw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).stage : null
    const documentTypeRaw =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>).documentType : null

    if (typeof fileName !== 'string' || !fileName.trim()) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }
    if (typeof fileType !== 'string' || !fileType.trim()) {
      return NextResponse.json({ error: 'fileType is required' }, { status: 400 })
    }
    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'fileSize must be a positive number' }, { status: 400 })
    }

    const stage = parseStage(stageRaw)
    const documentType = parseDocumentType(documentTypeRaw)
    if (!stage || !documentType) {
      return NextResponse.json({ error: 'stage and documentType are required' }, { status: 400 })
    }

    const validation = await validateFile(
      { name: fileName, size: fileSize, type: fileType },
      'purchase-order-document',
      { maxSizeMB: MAX_DOCUMENT_SIZE_MB }
    )
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const prisma = await getTenantPrisma()
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, isLegacy: true, orderNumber: true, status: true, postedAt: true },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForPurchaseOrder({
      prisma,
      purchaseOrderId: id,
      purchaseOrderStatus: order.status,
    })
    if (crossTenantGuard) {
      return crossTenantGuard
    }

    if (order.isLegacy) {
      return NextResponse.json({ error: 'Cannot attach documents to legacy orders' }, { status: 409 })
    }

    try {
      assertPurchaseOrderMutable({
        status: order.status,
        postedAt: order.postedAt,
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }

    if (!DISABLE_PO_DOCUMENT_STAGE_LOCK) {
      const currentStage = statusToDocumentStage(order.status as PurchaseOrderStatus)
      if (
        currentStage &&
        PURCHASE_ORDER_DOCUMENT_STAGE_ORDER[stage] <
          PURCHASE_ORDER_DOCUMENT_STAGE_ORDER[currentStage]
      ) {
        return NextResponse.json(
          { error: `Documents for completed stages are locked (current stage: ${order.status})` },
          { status: 409 }
        )
      }
    }

    const tenantCode = await getCurrentTenantCode()
    const purchaseOrderNumber = toPublicOrderNumber(order.orderNumber)
    const s3Service = getS3Service()

    const s3Key = s3Service.generateKey(
      {
        type: 'purchase-order',
        purchaseOrderId: id,
        tenantCode,
        purchaseOrderNumber,
        stage,
        documentType,
      },
      fileName
    )

    // Browsers cannot PUT directly to our S3 bucket (CORS). Return a same-origin upload URL that
    // proxies the PUT through our API. Keep this URL relative so the client can apply its base
    // path logic (e.g. /talos) consistently even when the server environment lacks BASE_PATH.
    const uploadUrl = `/api/purchase-orders/${id}/documents/upload-proxy?s3Key=${encodeURIComponent(
      s3Key
    )}&stage=${encodeURIComponent(stage)}&documentType=${encodeURIComponent(
      documentType
    )}&fileName=${encodeURIComponent(fileName)}&fileType=${encodeURIComponent(
      fileType
    )}&fileSize=${encodeURIComponent(String(fileSize))}`

    return NextResponse.json({ uploadUrl, s3Key, expiresIn: 300 })
  } catch (_error) {
    apiLogger.error('Failed to generate purchase order document presigned URL', {
      purchaseOrderId,
      userId: session.user.id,
      error: _error instanceof Error ? _error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        error: 'Failed to generate upload URL',
        details: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})
