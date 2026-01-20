import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { validateFile } from '@/lib/security/file-upload'
import { PurchaseOrderDocumentStage, PurchaseOrderStatus } from '@targon/prisma-talos'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'

export const dynamic = 'force-dynamic'

const MAX_DOCUMENT_SIZE_MB = 50

const STAGES: readonly PurchaseOrderDocumentStage[] = [
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'SHIPPED',
]

const DOCUMENT_STAGE_ORDER: Record<PurchaseOrderDocumentStage, number> = {
  ISSUED: 1,
  MANUFACTURING: 2,
  OCEAN: 3,
  WAREHOUSE: 4,
  SHIPPED: 5,
}

function statusToDocumentStage(status: PurchaseOrderStatus): PurchaseOrderDocumentStage | null {
  switch (status) {
    case PurchaseOrderStatus.ISSUED:
      return PurchaseOrderDocumentStage.ISSUED
    case PurchaseOrderStatus.MANUFACTURING:
      return PurchaseOrderDocumentStage.MANUFACTURING
    case PurchaseOrderStatus.OCEAN:
      return PurchaseOrderDocumentStage.OCEAN
    case PurchaseOrderStatus.WAREHOUSE:
      return PurchaseOrderDocumentStage.WAREHOUSE
    case PurchaseOrderStatus.SHIPPED:
      return PurchaseOrderDocumentStage.SHIPPED
    default:
      return null
  }
}

function parseStage(value: unknown): PurchaseOrderDocumentStage | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return (STAGES as readonly string[]).includes(trimmed)
    ? (trimmed as PurchaseOrderDocumentStage)
    : null
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
      select: { id: true, isLegacy: true, orderNumber: true, status: true },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (order.isLegacy) {
      return NextResponse.json({ error: 'Cannot attach documents to legacy orders' }, { status: 409 })
    }

    if (order.status === PurchaseOrderStatus.CANCELLED || order.status === PurchaseOrderStatus.REJECTED) {
      return NextResponse.json(
        { error: `Cannot modify documents for ${order.status.toLowerCase()} purchase orders` },
        { status: 409 }
      )
    }

    const currentStage = statusToDocumentStage(order.status as PurchaseOrderStatus)
    if (currentStage && DOCUMENT_STAGE_ORDER[stage] < DOCUMENT_STAGE_ORDER[currentStage]) {
      return NextResponse.json(
        { error: `Documents for completed stages are locked (current stage: ${order.status})` },
        { status: 409 }
      )
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

    const uploadUrl = await s3Service.getPresignedUrl(s3Key, 'put', {
      expiresIn: 300,
      contentType: fileType,
    })

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

