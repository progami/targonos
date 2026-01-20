import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { validateFile } from '@/lib/security/file-upload'
import { FulfillmentOrderDocumentStage } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

const MAX_DOCUMENT_SIZE_MB = 50

const STAGES: readonly FulfillmentOrderDocumentStage[] = ['PACKING', 'SHIPPING', 'DELIVERY']

function parseStage(value: unknown): FulfillmentOrderDocumentStage | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return (STAGES as readonly string[]).includes(trimmed)
    ? (trimmed as FulfillmentOrderDocumentStage)
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
  let fulfillmentOrderId: string | null = null

  try {
    const { id } = params as { id: string }
    fulfillmentOrderId = id
    if (!id) {
      return NextResponse.json({ error: 'Fulfillment order ID is required' }, { status: 400 })
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
      'fulfillment-order-document',
      { maxSizeMB: MAX_DOCUMENT_SIZE_MB }
    )
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const prisma = await getTenantPrisma()
    const order = await prisma.fulfillmentOrder.findUnique({
      where: { id },
      select: { id: true, foNumber: true },
    })

    if (!order) {
      return NextResponse.json({ error: 'Fulfillment order not found' }, { status: 404 })
    }

    const tenantCode = await getCurrentTenantCode()
    const s3Service = getS3Service()

    const s3Key = s3Service.generateKey(
      {
        type: 'fulfillment-order',
        fulfillmentOrderId: id,
        tenantCode,
        fulfillmentOrderNumber: order.foNumber ?? undefined,
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
    apiLogger.error('Failed to generate fulfillment order document presigned URL', {
      fulfillmentOrderId,
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

