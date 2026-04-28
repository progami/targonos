import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { scanFileContent, validateFile } from '@/lib/security/file-upload'
import { enforceCrossTenantManufacturingOnlyForInboundOrder } from '@/lib/services/inbound-cross-tenant-access'
import { InboundOrderStatus } from '@targon/prisma-talos'
import { toPublicOrderNumber } from '@/lib/services/inbound-utils'
import { Readable, Transform } from 'node:stream'
import { ApiResponses } from '@/lib/api'
import { assertInboundOrderMutable } from '@/lib/inbound/workflow'
import {
  getInboundOrderDocumentStageForStatus,
  parseActiveInboundOrderDocumentStage,
  INBOUND_DOCUMENT_STAGE_ORDER,
  type ActiveInboundOrderDocumentStage,
} from '@/lib/inbound/document-stages'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large file uploads (up to 1GB)

const MAX_DOCUMENT_SIZE_MB = 1024
const MAX_SNIFF_BYTES = 16 * 1024
const DISABLE_PO_DOCUMENT_STAGE_LOCK = process.env.TALOS_DISABLE_PO_DOCUMENT_STAGE_LOCK === 'true'

function statusToDocumentStage(status: InboundOrderStatus): ActiveInboundOrderDocumentStage | null {
  return getInboundOrderDocumentStageForStatus(status)
}

function parseStage(value: unknown): ActiveInboundOrderDocumentStage | null {
  return parseActiveInboundOrderDocumentStage(value)
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
  let inboundOrderId: string | null = null
  let stage: ActiveInboundOrderDocumentStage | null = null
  let documentType: string | null = null
  let fileName: string | null = null
  let fileType: string | null = null
  let fileSize: number | null = null

  try {
    const { id } = params as { id: string }
    inboundOrderId = id
    if (!id) {
      return NextResponse.json({ error: 'Inbound ID is required' }, { status: 400 })
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
      'inbound-document',
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
    const order = await prisma.inboundOrder.findUnique({
      where: { id },
      select: { id: true, isLegacy: true, orderNumber: true, status: true, postedAt: true },
    })

	    if (!order) {
	      return NextResponse.json({ error: 'Inbound not found' }, { status: 404 })
	    }

	    const crossTenantGuard = await enforceCrossTenantManufacturingOnlyForInboundOrder({
	      prisma,
	      inboundOrderId: id,
	      inboundOrderStatus: order.status,
	    })
	    if (crossTenantGuard) {
	      return crossTenantGuard
	    }

	    if (order.isLegacy) {
	      return NextResponse.json({ error: 'Cannot attach documents to legacy orders' }, { status: 409 })
	    }

    try {
      assertInboundOrderMutable({
        status: order.status,
        postedAt: order.postedAt,
      })
    } catch (error) {
      return ApiResponses.handleError(error)
    }

    if (!DISABLE_PO_DOCUMENT_STAGE_LOCK) {
      const currentStage = statusToDocumentStage(order.status as InboundOrderStatus)
      if (
        currentStage &&
        INBOUND_DOCUMENT_STAGE_ORDER[parsedStage] <
          INBOUND_DOCUMENT_STAGE_ORDER[currentStage]
      ) {
        return NextResponse.json(
          { error: `Documents for completed stages are locked (current stage: ${order.status})` },
          { status: 409 }
        )
      }
    }

    const tenantCode = await getCurrentTenantCode()
    const inboundOrderNumber = toPublicOrderNumber(order.orderNumber)
    const expectedPrefix = `inbound/${tenantCode.toLowerCase()}/${inboundOrderNumber.toLowerCase()}--${id}/${parsedStage}/${parsedDocumentType}/`
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
      contentLength: parsedFileSize,
      metadata: {
        inboundOrderId: id,
        tenantCode,
        inboundOrderNumber,
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

    apiLogger.error('Failed to proxy inbound document upload', {
      inboundOrderId,
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
        error: 'Failed to upload inbound document',
        details: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})
