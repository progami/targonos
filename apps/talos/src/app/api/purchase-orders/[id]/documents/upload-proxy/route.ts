import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { scanFileContent, validateFile } from '@/lib/security/file-upload'
import { PurchaseOrderDocumentStage, PurchaseOrderStatus } from '@targon/prisma-talos'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'
import { Readable, Transform } from 'node:stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large file uploads (up to 1GB)

const MAX_DOCUMENT_SIZE_MB = 1024
const MAX_SNIFF_BYTES = 16 * 1024

const STAGES: readonly PurchaseOrderDocumentStage[] = [
  'RFQ',
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'SHIPPED',
]

const DOCUMENT_STAGE_ORDER: Record<PurchaseOrderDocumentStage, number> = {
  RFQ: 0,
  ISSUED: 1,
  MANUFACTURING: 2,
  OCEAN: 3,
  WAREHOUSE: 4,
  SHIPPED: 5,
}

function statusToDocumentStage(status: PurchaseOrderStatus): PurchaseOrderDocumentStage | null {
  switch (status) {
    case PurchaseOrderStatus.RFQ:
      return PurchaseOrderDocumentStage.RFQ
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

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadValidationError'
  }
}

export const PUT = withAuthAndParams(async (request, params, session) => {
  let purchaseOrderId: string | null = null
  let stage: PurchaseOrderDocumentStage | null = null
  let documentType: string | null = null
  let fileName: string | null = null
  let fileType: string | null = null
  let fileSize: number | null = null

  try {
    const { id } = params as { id: string }
    purchaseOrderId = id
    if (!id) {
      return NextResponse.json({ error: 'Purchase order ID is required' }, { status: 400 })
    }

    const searchParams = request.nextUrl.searchParams
    const stageRaw = searchParams.get('stage')
    const documentTypeRaw = searchParams.get('documentType')
    const fileNameRaw = searchParams.get('fileName')
    const fileTypeRaw = searchParams.get('fileType')
    const fileSizeRaw = searchParams.get('fileSize')
    const s3KeyRaw = searchParams.get('s3Key')

    const parsedStage = parseStage(stageRaw)
    const parsedDocumentType = parseDocumentType(documentTypeRaw)
    stage = parsedStage
    documentType = parsedDocumentType
    if (!parsedStage || !parsedDocumentType) {
      return NextResponse.json({ error: 'stage and documentType are required' }, { status: 400 })
    }

    if (typeof fileNameRaw !== 'string' || !fileNameRaw.trim()) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
    }
    if (typeof fileTypeRaw !== 'string' || !fileTypeRaw.trim()) {
      return NextResponse.json({ error: 'fileType is required' }, { status: 400 })
    }
    if (typeof fileSizeRaw !== 'string' || !fileSizeRaw.trim()) {
      return NextResponse.json({ error: 'fileSize is required' }, { status: 400 })
    }
    if (typeof s3KeyRaw !== 'string' || !s3KeyRaw.trim()) {
      return NextResponse.json({ error: 's3Key is required' }, { status: 400 })
    }

    fileName = fileNameRaw
    fileType = fileTypeRaw

    const parsedFileSize = Number(fileSizeRaw)
    if (!Number.isFinite(parsedFileSize) || parsedFileSize <= 0) {
      return NextResponse.json({ error: 'fileSize must be a positive number' }, { status: 400 })
    }
    fileSize = parsedFileSize

    const contentLengthRaw = request.headers.get('content-length')
    if (contentLengthRaw) {
      const parsedContentLength = Number(contentLengthRaw)
      if (!Number.isFinite(parsedContentLength) || parsedContentLength <= 0) {
        return NextResponse.json({ error: 'Invalid Content-Length header' }, { status: 400 })
      }
      if (parsedContentLength !== parsedFileSize) {
        return NextResponse.json(
          { error: `File size mismatch (expected ${parsedFileSize}, got ${parsedContentLength})` },
          { status: 400 }
        )
      }
    }

    const validation = await validateFile(
      { name: fileNameRaw, size: parsedFileSize, type: fileTypeRaw },
      'purchase-order-document',
      { maxSizeMB: MAX_DOCUMENT_SIZE_MB }
    )
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const body = request.body
    if (!body) {
      return NextResponse.json({ error: 'Upload body is required' }, { status: 400 })
    }

    const reader = body.getReader()
    const sniffChunks: Uint8Array[] = []
    let sniffBytes = 0
    while (sniffBytes < MAX_SNIFF_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      sniffChunks.push(value)
      sniffBytes += value.byteLength
    }

    const sniffBuffer = Buffer.concat(sniffChunks.map(chunk => Buffer.from(chunk)))
    const scanResult = await scanFileContent(sniffBuffer, fileTypeRaw)
    if (!scanResult.valid) {
      await reader.cancel()
      return NextResponse.json({ error: scanResult.error }, { status: 400 })
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
    if (currentStage && DOCUMENT_STAGE_ORDER[parsedStage] < DOCUMENT_STAGE_ORDER[currentStage]) {
      return NextResponse.json(
        { error: `Documents for completed stages are locked (current stage: ${order.status})` },
        { status: 409 }
      )
    }

    const tenantCode = await getCurrentTenantCode()
    const purchaseOrderNumber = toPublicOrderNumber(order.orderNumber)
    const expectedPrefix = `purchase-orders/${tenantCode.toLowerCase()}/${purchaseOrderNumber.toLowerCase()}--${id}/${parsedStage}/${parsedDocumentType}/`
    if (!s3KeyRaw.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 })
    }

    const stream = Readable.from((async function* () {
      for (const chunk of sniffChunks) {
        yield Buffer.from(chunk)
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        yield Buffer.from(value)
      }
    })())

    let uploadedBytes = 0
    const sizeGuard = new Transform({
      transform(chunk, _encoding, callback) {
        uploadedBytes += chunk.length
        if (uploadedBytes > parsedFileSize) {
          callback(new UploadValidationError('Uploaded file exceeds expected size'))
          return
        }
        callback(null, chunk)
      },
    })

    const s3Service = getS3Service()
    await s3Service.uploadFile(stream.pipe(sizeGuard), s3KeyRaw, {
      contentType: fileTypeRaw,
      metadata: {
        purchaseOrderId: id,
        tenantCode,
        purchaseOrderNumber,
        stage: parsedStage,
        documentType: parsedDocumentType,
        uploadedBy: session.user.id,
      },
    })

    if (uploadedBytes !== parsedFileSize) {
      return NextResponse.json({ error: 'Uploaded file is incomplete' }, { status: 400 })
    }

    return new NextResponse(null, { status: 200 })
  } catch (_error) {
    if (_error instanceof UploadValidationError) {
      return NextResponse.json({ error: _error.message }, { status: 400 })
    }

    apiLogger.error('Failed to proxy purchase order document upload', {
      purchaseOrderId,
      stage,
      documentType,
      fileName,
      fileType,
      fileSize,
      userId: session.user.id,
      error: _error instanceof Error ? _error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        error: 'Failed to upload purchase order document',
        details: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})
