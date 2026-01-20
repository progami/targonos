import { NextResponse } from 'next/server'
import { withAuthAndParams } from '@/lib/api/auth-wrapper'
import { apiLogger } from '@/lib/logger/server'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { getS3Service } from '@/services/s3.service'
import { validateFile, scanFileContent } from '@/lib/security/file-upload'
import { auditLog } from '@/lib/security/audit-logger'
import { PurchaseOrderDocumentStage, Prisma, PurchaseOrderStatus } from '@targon/prisma-talos'
import { toPublicOrderNumber } from '@/lib/services/purchase-order-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 seconds for file uploads

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

  // Keep this strict so S3 keys and DB composite keys stay predictable.
  // UI uses snake_case ids (e.g. bill_of_lading).
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)) return null
  return trimmed
}

export const POST = withAuthAndParams(async (request, params, session) => {
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

    const prisma = await getTenantPrisma()
    const s3Service = getS3Service()

    const contentType = request.headers.get('content-type')
    const isJson = typeof contentType === 'string' && contentType.includes('application/json')

    let file: File | null = null
    let s3KeyFromClient: string | null = null

    if (isJson) {
      const payload = await request.json().catch(() => null)

      const stageRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).stage : null
      const documentTypeRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).documentType : null
      const fileNameRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileName : null
      const fileTypeRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileType : null
      const fileSizeRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).fileSize : null
      const s3KeyRaw =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>).s3Key : null

      const parsedStage = parseStage(stageRaw)
      const parsedDocumentType = parseDocumentType(documentTypeRaw)
      stage = parsedStage
      documentType = parsedDocumentType

      if (!parsedStage || !parsedDocumentType) {
        return NextResponse.json({ error: 'documentType and stage are required' }, { status: 400 })
      }

      if (typeof fileNameRaw !== 'string' || !fileNameRaw.trim()) {
        return NextResponse.json({ error: 'fileName is required' }, { status: 400 })
      }
      if (typeof fileTypeRaw !== 'string' || !fileTypeRaw.trim()) {
        return NextResponse.json({ error: 'fileType is required' }, { status: 400 })
      }
      if (typeof fileSizeRaw !== 'number' || !Number.isFinite(fileSizeRaw) || fileSizeRaw <= 0) {
        return NextResponse.json({ error: 'fileSize must be a positive number' }, { status: 400 })
      }
      if (typeof s3KeyRaw !== 'string' || !s3KeyRaw.trim()) {
        return NextResponse.json({ error: 's3Key is required' }, { status: 400 })
      }

      fileName = fileNameRaw
      fileType = fileTypeRaw
      fileSize = fileSizeRaw
      s3KeyFromClient = s3KeyRaw
    } else {
      const formData = await request.formData()
      const fileCandidate = formData.get('file') as File
      const documentTypeRaw = formData.get('documentType')
      const stageRaw = formData.get('stage')

      const parsedStage = parseStage(stageRaw)
      const parsedDocumentType = parseDocumentType(documentTypeRaw)
      stage = parsedStage
      documentType = parsedDocumentType

      if (!fileCandidate || !parsedDocumentType || !parsedStage) {
        return NextResponse.json({ error: 'File, documentType, and stage are required' }, { status: 400 })
      }

      file = fileCandidate
      fileName = fileCandidate.name
      fileType = fileCandidate.type
      fileSize = fileCandidate.size
    }

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
    if (currentStage && stage && DOCUMENT_STAGE_ORDER[stage] < DOCUMENT_STAGE_ORDER[currentStage]) {
      return NextResponse.json(
        { error: `Documents for completed stages are locked (current stage: ${order.status})` },
        { status: 409 }
      )
    }

    const validation = isJson
      ? await validateFile(
          { name: fileName as string, size: fileSize as number, type: fileType as string },
          'purchase-order-document',
          { maxSizeMB: MAX_DOCUMENT_SIZE_MB }
        )
      : await validateFile(file as File, 'purchase-order-document', { maxSizeMB: MAX_DOCUMENT_SIZE_MB })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const tenantCode = await getCurrentTenantCode()
    const purchaseOrderNumber = toPublicOrderNumber(order.orderNumber)

    let s3Key: string
    let uploadSize: number

    if (isJson) {
      const expectedPrefix = `purchase-orders/${tenantCode.toLowerCase()}/${purchaseOrderNumber.toLowerCase()}--${id}/${stage}/${documentType}/`
      if (!s3KeyFromClient || !s3KeyFromClient.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Invalid upload key' }, { status: 400 })
      }

      const verifyUrl = await s3Service.getPresignedUrl(s3KeyFromClient, 'get', { expiresIn: 60 })
      const verifyResponse = await fetch(verifyUrl, { headers: { Range: 'bytes=0-10000' } })
      if (!verifyResponse.ok) {
        return NextResponse.json(
          { error: 'Failed to verify uploaded document', details: `HTTP ${verifyResponse.status}` },
          { status: 400 }
        )
      }

      const verifyBytes = await verifyResponse.arrayBuffer()
      const verifyBuffer = Buffer.from(verifyBytes)
      const scanResult = await scanFileContent(verifyBuffer, fileType as string)
      if (!scanResult.valid) {
        await s3Service.deleteFile(s3KeyFromClient)
        return NextResponse.json({ error: scanResult.error }, { status: 400 })
      }

      s3Key = s3KeyFromClient
      uploadSize = fileSize as number
    } else {
      const bytes = await (file as File).arrayBuffer()
      const buffer = Buffer.from(bytes)

      const scanResult = await scanFileContent(buffer, (file as File).type)
      if (!scanResult.valid) {
        return NextResponse.json({ error: scanResult.error }, { status: 400 })
      }

      const generatedKey = s3Service.generateKey(
        {
          type: 'purchase-order',
          purchaseOrderId: id,
          tenantCode,
          purchaseOrderNumber,
          stage: stage as PurchaseOrderDocumentStage,
          documentType: documentType as string,
        },
        (file as File).name
      )

      const uploadResult = await s3Service.uploadFile(buffer, generatedKey, {
        contentType: (file as File).type,
        metadata: {
          purchaseOrderId: id,
          tenantCode,
          purchaseOrderNumber,
          stage: stage as PurchaseOrderDocumentStage,
          documentType: documentType as string,
          originalName: (file as File).name,
          uploadedBy: session.user.id,
        },
      })

      s3Key = uploadResult.key
      uploadSize = uploadResult.size
    }

    const presignedUrl = await s3Service.getPresignedUrl(s3Key, 'get', { expiresIn: 3600 })

    const compositeKey = {
      purchaseOrderId_stage_documentType: {
        purchaseOrderId: id,
        stage: stage as PurchaseOrderDocumentStage,
        documentType: documentType as string,
      },
    }

    const existing = await prisma.purchaseOrderDocument.findUnique({
      where: compositeKey,
      select: {
        id: true,
        stage: true,
        documentType: true,
        fileName: true,
        contentType: true,
        size: true,
        s3Key: true,
        uploadedAt: true,
        uploadedByName: true,
      },
    })

    if (existing?.s3Key && existing.s3Key !== s3Key) {
      try {
        await s3Service.deleteFile(existing.s3Key)
      } catch {
        // Best-effort cleanup only.
      }
    }

    const stored = await prisma.purchaseOrderDocument.upsert({
      where: compositeKey,
      create: {
        purchaseOrderId: id,
        stage: stage as PurchaseOrderDocumentStage,
        documentType: documentType as string,
        fileName: fileName as string,
        contentType: fileType as string,
        size: uploadSize,
        s3Key,
        uploadedById: session.user.id,
        uploadedByName: session.user.name ?? session.user.email ?? null,
        metadata: {
          originalName: fileName as string,
        } as unknown as Prisma.InputJsonValue,
      },
      update: {
        fileName: fileName as string,
        contentType: fileType as string,
        size: uploadSize,
        s3Key,
        uploadedAt: new Date(),
        uploadedById: session.user.id,
        uploadedByName: session.user.name ?? session.user.email ?? null,
        metadata: {
          originalName: fileName as string,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await auditLog({
      entityType: 'PurchaseOrder',
      entityId: id,
      action: existing ? 'DOCUMENT_REPLACE' : 'DOCUMENT_UPLOAD',
      userId: session.user.id,
      oldValue: existing
        ? {
            documentId: existing.id,
            stage: existing.stage,
            documentType: existing.documentType,
            fileName: existing.fileName,
            contentType: existing.contentType,
            size: existing.size,
            uploadedAt: existing.uploadedAt.toISOString(),
            uploadedByName: existing.uploadedByName,
          }
        : null,
      newValue: {
        documentId: stored.id,
        stage: stored.stage,
        documentType: stored.documentType,
        fileName: stored.fileName,
        contentType: stored.contentType,
        size: stored.size,
        uploadedAt: stored.uploadedAt.toISOString(),
        uploadedByName: stored.uploadedByName,
      },
    })

    return NextResponse.json({
      success: true,
      document: {
        id: stored.id,
        stage: stored.stage,
        documentType: stored.documentType,
        fileName: stored.fileName,
        contentType: stored.contentType,
        size: stored.size,
        uploadedAt: stored.uploadedAt.toISOString(),
        uploadedByName: stored.uploadedByName,
        s3Key: stored.s3Key,
        viewUrl: presignedUrl,
      },
    })
  } catch (_error) {
    apiLogger.error('Failed to upload purchase order document', {
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

export const GET = withAuthAndParams(async (request, params, _session) => {
  try {
    const { id } = params as { id: string }
    if (!id) {
      return NextResponse.json({ error: 'Purchase order ID is required' }, { status: 400 })
    }

    const prisma = await getTenantPrisma()
    const s3Service = getS3Service()

    const searchParams = request.nextUrl.searchParams
    const download = searchParams.get('download') === 'true'

    const docs = await prisma.purchaseOrderDocument.findMany({
      where: { purchaseOrderId: id },
      orderBy: [{ stage: 'asc' }, { documentType: 'asc' }, { uploadedAt: 'desc' }],
    })

    const withUrls = await Promise.all(
      docs.map(async doc => {
        const url = await s3Service.getPresignedUrl(doc.s3Key, 'get', {
          expiresIn: 3600,
          responseContentDisposition: download
            ? `attachment; filename="${doc.fileName}"`
            : undefined,
        })

        return {
          id: doc.id,
          stage: doc.stage,
          documentType: doc.documentType,
          fileName: doc.fileName,
          contentType: doc.contentType,
          size: doc.size,
          uploadedAt: doc.uploadedAt.toISOString(),
          uploadedByName: doc.uploadedByName,
          s3Key: doc.s3Key,
          viewUrl: url,
        }
      })
    )

    return NextResponse.json({ documents: withUrls })
  } catch (_error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch purchase order documents',
        details: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})
