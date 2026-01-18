import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { ValidationError } from '@/lib/api'
import { getTenantPrisma } from '@/lib/tenant/server'
import { Prisma, TransactionType, InboundReceiveType, OutboundShipMode } from '@targon/prisma-talos'
import { businessLogger, perfLogger } from '@/lib/logger/index'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { parseLocalDateTime } from '@/lib/utils/date-helpers'
import { recordStorageCostEntry } from '@/services/storageCost.service'
import { resolveBatchLot } from '@/lib/services/purchase-order-utils'
import { buildTacticalCostLedgerEntries } from '@/lib/costing/tactical-costing'
import { isRecord, asString, asNumber, asBoolean } from '@/lib/utils/type-coercion'
import {
  calculatePalletValues,
  type TransactionTypeForPallets,
} from '@/lib/utils/pallet-calculations'
import { checkRateLimit, rateLimitConfigs } from '@/lib/security/rate-limiter'
export const dynamic = 'force-dynamic'

type MutableTransactionLine = {
  skuCode?: string
  skuId?: string
  batchLot?: string
  cartons?: number
  pallets?: number
  storageCartonsPerPallet?: number
  shippingCartonsPerPallet?: number
  storagePalletsIn?: number
  shippingPalletsOut?: number
  unitsPerCarton?: number
  cartonsIn?: number
  cartonsOut?: number
}

type ValidatedTransactionLine = {
  skuCode: string
  batchLot: string
  cartons: number
  pallets?: number
  storageCartonsPerPallet?: number | null
  shippingCartonsPerPallet?: number | null
  storagePalletsIn?: number
  shippingPalletsOut?: number
  unitsPerCarton?: number
}

type AttachmentPayload = {
  type?: string
  content?: string
  s3Key?: string
  name?: string
}

// Type coercion utilities imported from @/lib/utils/type-coercion

const parseInboundReceiveType = (value: unknown): InboundReceiveType | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return Object.values(InboundReceiveType).includes(trimmed as InboundReceiveType)
    ? (trimmed as InboundReceiveType)
    : null
}

const parseOutboundShipMode = (value: unknown): OutboundShipMode | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return Object.values(OutboundShipMode).includes(trimmed as OutboundShipMode)
    ? (trimmed as OutboundShipMode)
    : null
}

function normalizeTransactionLine(input: unknown): MutableTransactionLine {
  if (!isRecord(input)) {
    return {}
  }

  return {
    skuCode: asString(input.skuCode),
    skuId: asString(input.skuId),
    batchLot: asString(input.batchLot),
    cartons: asNumber(input.cartons),
    pallets: asNumber(input.pallets),
    storageCartonsPerPallet: asNumber(input.storageCartonsPerPallet),
    shippingCartonsPerPallet: asNumber(input.shippingCartonsPerPallet),
    storagePalletsIn: asNumber(input.storagePalletsIn),
    shippingPalletsOut: asNumber(input.shippingPalletsOut),
    unitsPerCarton: asNumber(input.unitsPerCarton),
    cartonsIn: asNumber(input.cartonsIn),
    cartonsOut: asNumber(input.cartonsOut),
  }
}

function normalizeAttachmentInput(input: unknown): AttachmentPayload | null {
  if (!isRecord(input)) {
    return null
  }

  const type = asString(input.type)
  const content = asString(input.content)
  const s3Key = asString(input.s3Key)
  const name = asString(input.name)

  if (!type && !content && !s3Key && !name) {
    return null
  }

  return {
    type,
    content,
    s3Key,
    name,
  }
}

export const GET = withAuth(async (request, _session) => {
  try {
    const prisma = await getTenantPrisma()

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '100')
    const _includeAttachments = searchParams.get('includeAttachments') === 'true'

    const transactions = await prisma.inventoryTransaction.findMany({
      take: limit,
      orderBy: { transactionDate: 'desc' },
      select: {
        id: true,
        transactionDate: true,
        transactionType: true,
        batchLot: true,
        referenceId: true,
        cartonsIn: true,
        cartonsOut: true,
        storagePalletsIn: true,
        shippingPalletsOut: true,
        createdAt: true,
        shipName: true,
        trackingNumber: true,
        pickupDate: true,
        attachments: true,
        storageCartonsPerPallet: true,
        shippingCartonsPerPallet: true,
        unitsPerCarton: true,
        supplier: true,
        purchaseOrderId: true,
        purchaseOrderLineId: true,
        // Use snapshot data
        warehouseCode: true,
        warehouseName: true,
        skuCode: true,
        skuDescription: true,
        createdById: true,
        createdByName: true,
      },
    })

    // Extract notes from attachments for each transaction and add nested objects for backward compatibility
    const transactionsWithNotes = transactions.map(transaction => {
      let notes = null
      if (transaction.attachments && Array.isArray(transaction.attachments)) {
        const notesAttachment = (
          transaction.attachments as Array<{ type: string; content: string }>
        ).find(att => att.type === 'notes')
        if (notesAttachment) {
          notes = notesAttachment.content
        }
      }

      return {
        ...transaction,
        notes,
        // Add nested objects for backward compatibility
        warehouse: {
          id: '', // No longer have warehouse ID
          code: transaction.warehouseCode,
          name: transaction.warehouseName,
        },
        sku: {
          id: '', // No longer have SKU ID
          skuCode: transaction.skuCode,
          description: transaction.skuDescription,
        },
        createdBy: {
          id: transaction.createdById,
          fullName: transaction.createdByName,
        },
      }
    })

    return NextResponse.json({ transactions: transactionsWithNotes })
  } catch (_error) {
    // console.error('Failed to fetch transactions:', _error)
    return NextResponse.json(
      {
        error: 'Failed to fetch transactions',
      },
      { status: 500 }
    )
  }
})

export const POST = withAuth(async (request, session) => {
  // Apply rate limiting
  const rateLimitResponse = await checkRateLimit(request, rateLimitConfigs.api)
  if (rateLimitResponse) return rateLimitResponse

  const errorContext: Record<string, unknown> = {}
  try {
    const prisma = await getTenantPrisma()

    const bodyText = await request.text()

    let body
    try {
      body = JSON.parse(bodyText)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const {
      type,
      transactionType,
      referenceNumber,
      referenceId,
      date,
      transactionDate,
      pickupDate,
      items,
      lineItems,
      shipName,
      trackingNumber,
      attachments,
      notes,
      warehouseId: bodyWarehouseId,
      skuId,
      batchLot,
      cartonsIn,
      cartonsOut,
      storagePalletsIn,
      shippingPalletsOut,
      supplier,
      receiveType,
      shipMode,
      costs,
    } = body

    // Extracted values were logged here

    // Sanitize text inputs
    const sanitizedReferenceNumber = referenceNumber ? sanitizeForDisplay(referenceNumber) : null
    const sanitizedReferenceId = referenceId ? sanitizeForDisplay(referenceId) : null
    const sanitizedShipName = shipName ? sanitizeForDisplay(shipName) : null
    const sanitizedTrackingNumber = trackingNumber ? sanitizeForDisplay(trackingNumber) : null
    const sanitizedNotes = notes ? sanitizeForDisplay(notes) : null
    const sanitizedSupplier = supplier ? sanitizeForDisplay(supplier) : null

    // Handle both 'type' and 'transactionType' fields for backward compatibility
    const txType = type || transactionType
    errorContext.txType = txType
    const refNumber = sanitizedReferenceNumber || sanitizedReferenceId
    errorContext.referenceNumber = refNumber
    const txDate = date || transactionDate

    // Validate transaction type
    if (!txType || !['RECEIVE', 'SHIP', 'ADJUST_IN', 'ADJUST_OUT'].includes(txType)) {
      return NextResponse.json(
        {
          error: 'Invalid transaction type. Must be RECEIVE, SHIP, ADJUST_IN, or ADJUST_OUT',
        },
        { status: 400 }
      )
    }

    const inboundReceiveType = txType === 'RECEIVE' ? parseInboundReceiveType(receiveType) : null
    const outboundShipMode = txType === 'SHIP' ? parseOutboundShipMode(shipMode) : null

    if (txType === 'RECEIVE' && !inboundReceiveType) {
      return NextResponse.json(
        { error: 'Inbound type is required for inbound transactions' },
        { status: 400 }
      )
    }

    if (txType === 'SHIP' && !outboundShipMode) {
      return NextResponse.json(
        { error: 'Outbound mode is required for outbound transactions' },
        { status: 400 }
      )
    }

    // Manual cost entry is disabled; costs are derived from warehouse rates.
    if (Array.isArray(costs) && costs.length > 0) {
      return NextResponse.json(
        {
          error:
            'Manual costs are disabled. Costs are calculated automatically from warehouse rates.',
        },
        { status: 400 }
      )
    }

    const rawItemsInput = Array.isArray(items) ? items : Array.isArray(lineItems) ? lineItems : []

    const hasInlineSkuCreation = rawItemsInput.some(item => {
      if (!isRecord(item)) return false
      return Boolean(asBoolean(item.isNewSku)) || item.skuData != null || item.batchData != null
    })

    if (hasInlineSkuCreation) {
      return NextResponse.json(
        {
          error:
            'Creating new SKUs/batches from transactions is disabled. Create SKUs and batches in Config → Products first.',
        },
        { status: 400 }
      )
    }

    let itemsArray: MutableTransactionLine[] = rawItemsInput.map(normalizeTransactionLine)

    // Require at least one line item
    if (itemsArray.length === 0) {
      return NextResponse.json(
        { error: 'At least one cargo line item is required' },
        { status: 400 }
      )
    }

    const attachmentList: AttachmentPayload[] = Array.isArray(attachments)
      ? attachments
          .map(normalizeAttachmentInput)
          .filter((item): item is AttachmentPayload => item !== null)
      : []
    const batchValidationCache = new Map<string, boolean>()

    if (['ADJUST_IN', 'ADJUST_OUT'].includes(txType)) {
      if (!skuId || !batchLot) {
        return NextResponse.json(
          {
            error: 'Missing required fields for adjustment: skuId and batchLot',
          },
          { status: 400 }
        )
      }

      const sku = await prisma.sku.findUnique({
        where: { id: skuId },
        select: { skuCode: true },
      })

      if (!sku) {
        return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
      }

      itemsArray = [
        {
          skuCode: sku.skuCode,
          batchLot,
          cartons: cartonsIn ?? cartonsOut ?? 0,
          pallets: storagePalletsIn ?? shippingPalletsOut ?? 0,
        },
      ]
    }

    // Validate required fields for non-adjustment transactions
    if (['RECEIVE', 'SHIP'].includes(txType)) {
      if (!refNumber || !txDate || itemsArray.length === 0) {
        // VALIDATION FAILED - missing required fields
        return NextResponse.json(
          {
            error: 'Missing required fields: PI/CI/PO number, date, and items',
            debug: {
              refNumber: refNumber || 'MISSING',
              txDate: txDate || 'MISSING',
              itemsLength: itemsArray?.length || 0,
            },
          },
          { status: 400 }
        )
      }
    }

    // Validate required fields for all transactions
    if (!refNumber || !txDate) {
      return NextResponse.json(
        {
          error: 'Missing required fields: reference number and date',
        },
        { status: 400 }
      )
    }

    // Validate date format - use parseLocalDateTime to handle both date and datetime formats
    const transactionDateObj = parseLocalDateTime(txDate)

    if (isNaN(transactionDateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    // Future date restriction removed - businesses may need to schedule future transactions

    // Historical date validation removed - businesses may need to enter old data for migration or corrections

    // Validate warehouse assignment for staff
    if (session.user.role === 'staff' && !session.user.warehouseId) {
      return NextResponse.json({ error: 'No warehouse assigned' }, { status: 400 })
    }

    // Staff users must use their assigned warehouse - cannot override via request body
    if (session.user.role === 'staff' && bodyWarehouseId && bodyWarehouseId !== session.user.warehouseId) {
      return NextResponse.json({ error: 'Staff users cannot specify a different warehouse' }, { status: 403 })
    }

    const warehouseId = session.user.warehouseId || bodyWarehouseId
    errorContext.warehouseId = warehouseId

    if (!warehouseId) {
      return NextResponse.json({ error: 'Warehouse ID required' }, { status: 400 })
    }

    // Get the full user data for createdByName
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { fullName: true, username: true },
    })

    // Log if user lookup fails
    if (!currentUser) {
      // console.error(`User lookup failed for session user ID: ${session.user.id}`)
    }

    const createdByName = currentUser?.fullName || currentUser?.username || 'Unknown User'

    // Duplicate check removed - businesses may have legitimate duplicate references
    // (e.g., multiple shipments with same PO number)

    // Backdating check temporarily disabled - businesses need flexibility for corrections
    // TODO: Re-enable with override capability for admins
    /*
 const lastTransaction = await prisma.inventoryTransaction.findFirst({
 where: { warehouseId },
 orderBy: { transactionDate: 'desc' },
 select: { transactionDate: true, id: true }
 })

 if (lastTransaction && transactionDateObj < lastTransaction.transactionDate) {
 return NextResponse.json({ 
 error: `Cannot create backdated transactions. The last transaction in this warehouse was on ${lastTransaction.transactionDate.toLocaleDateString()}. New transactions must have a date on or after this date.`,
 details: {
 lastTransactionDate: lastTransaction.transactionDate,
 attemptedDate: transactionDateObj,
 lastTransactionId: lastTransaction.transactionId
 }
 }, { status: 400 })
 }
 */

    // Validate all items before processing
    for (const item of itemsArray) {
      // Support both 'cartons' and 'cartonsIn' for backward compatibility
      if (item.cartonsIn !== undefined && item.cartons === undefined) {
        item.cartons = item.cartonsIn
      }
      // Support 'cartonsOut' for SHIP transactions
      if (item.cartonsOut !== undefined && item.cartons === undefined) {
        item.cartons = item.cartonsOut
      }
      // Support both 'pallets' and 'storagePalletsIn' for backward compatibility
      if (item.storagePalletsIn !== undefined && item.pallets === undefined) {
        item.pallets = item.storagePalletsIn
      }
      // Support 'shippingPalletsOut' for SHIP transactions
      if (item.shippingPalletsOut !== undefined && item.pallets === undefined) {
        item.pallets = item.shippingPalletsOut
      }

      // Handle both skuId and skuCode for backward compatibility
      if (!item.skuCode && item.skuId) {
        // If skuCode is missing but skuId is provided, look it up
        const sku = await prisma.sku.findUnique({
          where: { id: item.skuId },
        })
        if (sku) {
          item.skuCode = sku.skuCode
        }
      }

      // Validate item structure
      if (!item.skuCode || !item.batchLot || typeof item.cartons !== 'number') {
        return NextResponse.json(
          {
            error: `Invalid item structure. Each item must have skuCode, batchLot, and cartons`,
          },
          { status: 400 }
        )
      }

      // For RECEIVE, auto-fill missing units-per-carton from batch defaults (SkuBatch)
      if (txType === 'RECEIVE') {
        const needsUnitsPerCarton = !item.unitsPerCarton || item.unitsPerCarton <= 0

        if (needsUnitsPerCarton) {
          const normalizedSkuCode = sanitizeForDisplay(item.skuCode)
          const normalizedBatchCode = sanitizeForDisplay(item.batchLot)

          const defaults = await prisma.skuBatch.findFirst({
            where: {
              sku: {
                skuCode: {
                  equals: normalizedSkuCode || item.skuCode,
                  mode: 'insensitive',
                },
              },
              batchCode: {
                equals: normalizedBatchCode || item.batchLot,
                mode: 'insensitive',
              },
            },
            select: {
              unitsPerCarton: true,
            },
          })

          if (defaults) {
            if (needsUnitsPerCarton && defaults.unitsPerCarton) {
              item.unitsPerCarton = defaults.unitsPerCarton
            }
          }
        }
      }

      // Validate cartons is a positive integer
      if (!Number.isInteger(item.cartons) || item.cartons <= 0) {
        return NextResponse.json(
          {
            error: `Cartons must be positive integers. Invalid value for SKU ${item.skuCode}: ${item.cartons}`,
          },
          { status: 400 }
        )
      }

      // Validate maximum cartons (prevent unrealistic values)
      if (item.cartons > 10000) {
        return NextResponse.json(
          {
            error: `Cartons value too large for SKU ${item.skuCode}. Maximum allowed: 10,000`,
          },
          { status: 400 }
        )
      }

      // Validate pallets if provided
      if (item.pallets !== undefined && item.pallets !== null) {
        if (!Number.isInteger(item.pallets) || item.pallets < 0 || item.pallets > 5000) {
          return NextResponse.json(
            {
              error: `Pallets must be integers between 0 and 5,000. Invalid value for SKU ${item.skuCode}`,
            },
            { status: 400 }
          )
        }
      }

      // Validate and sanitize batch/lot
      if (!item.batchLot || item.batchLot.trim() === '') {
        return NextResponse.json(
          {
            error: `Batch is required for SKU ${item.skuCode}`,
          },
          { status: 400 }
        )
      }

      const sanitizedBatchLot = sanitizeForDisplay(item.batchLot)
      const sanitizedSkuCode = sanitizeForDisplay(item.skuCode)
      item.batchLot = sanitizedBatchLot || item.batchLot
      item.skuCode = sanitizedSkuCode || item.skuCode
    }

    // Check for duplicate SKU/batch combinations in the request
    const itemKeys = new Set<string>()
    for (const item of itemsArray) {
      const key = `${item.skuCode}-${item.batchLot}`
      if (itemKeys.has(key)) {
        return NextResponse.json(
          {
            error: `Duplicate SKU/Batch combination found: ${item.skuCode} - ${item.batchLot}`,
          },
          { status: 400 }
        )
      }
      itemKeys.add(key)
    }

    const validatedItems: ValidatedTransactionLine[] = itemsArray.map(item => ({
      skuCode: item.skuCode!,
      batchLot: item.batchLot!,
      cartons: item.cartons!,
      pallets: item.pallets ?? undefined,
      storageCartonsPerPallet: item.storageCartonsPerPallet ?? null,
      shippingCartonsPerPallet: item.shippingCartonsPerPallet ?? null,
      storagePalletsIn: item.storagePalletsIn ?? undefined,
      shippingPalletsOut: item.shippingPalletsOut ?? undefined,
      unitsPerCarton: item.unitsPerCarton ?? undefined,
    }))
    errorContext.itemCount = validatedItems.length

    // Get warehouse for transaction ID generation
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
    })

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    for (const item of validatedItems) {
      item.batchLot = resolveBatchLot({
        rawBatchLot: item.batchLot,
        orderNumber: refNumber,
        warehouseCode: warehouse.code,
        skuCode: item.skuCode,
        transactionDate: transactionDateObj,
      })
    }

    // Verify all SKUs exist and check inventory for SHIP transactions
    for (const item of validatedItems) {
      const sku = await prisma.sku.findFirst({
        where: { skuCode: item.skuCode },
      })

      if (!sku) {
        return NextResponse.json(
          {
            error: `SKU ${item.skuCode} not found. Please create the SKU first.`,
          },
          { status: 400 }
        )
      }

      const cacheKey = `${sku.id}::${item.batchLot}`
      if (!batchValidationCache.has(cacheKey)) {
        const batchRecord = await prisma.skuBatch.findFirst({
          where: {
            skuId: sku.id,
            batchCode: item.batchLot,
          },
          select: { id: true },
        })

        if (!batchRecord) {
          return NextResponse.json(
            {
              error: `Batch ${item.batchLot} is not configured for SKU ${item.skuCode}. Create it in Config → Products → Batches.`,
            },
            { status: 400 }
          )
        }

        batchValidationCache.set(cacheKey, true)
      }

        // For SHIP and ADJUST_OUT transactions, verify inventory availability
       if (['SHIP', 'ADJUST_OUT'].includes(txType)) {
         // Calculate current balance using DB aggregation (avoid pulling full history)
         const totals = await prisma.inventoryTransaction.aggregate({
           where: {
             warehouseCode: warehouse.code,
             skuCode: sku.skuCode,
             batchLot: item.batchLot,
             transactionDate: { lte: transactionDateObj },
           },
           _sum: {
             cartonsIn: true,
             cartonsOut: true,
           },
         })
 
         const currentCartons = (totals._sum.cartonsIn ?? 0) - (totals._sum.cartonsOut ?? 0)
 
         if (currentCartons < item.cartons) {
           return NextResponse.json(
             {
               error: `Insufficient inventory for SKU ${item.skuCode} batch ${item.batchLot}. Available: ${currentCartons}, Requested: ${item.cartons}`,
             },
             { status: 400 }
           )
         }
       }
    }

    // Start performance tracking
    const startTime = Date.now()

    // Create transactions with proper database transaction and locking
    const result = await prisma.$transaction(async tx => {
      const transactions = []

      // Pre-fetch all SKUs to reduce queries
      const skuCodes = validatedItems.map(item => item.skuCode)
      const skus = await tx.sku.findMany({
        where: { skuCode: { in: skuCodes } },
      })

      const skuMap = new Map(skus.map(sku => [sku.skuCode, sku]))

      const batchLots = [...new Set(validatedItems.map(item => item.batchLot))]
      const batchRecords = await tx.skuBatch.findMany({
        where: {
          skuId: { in: skus.map(sku => sku.id) },
          batchCode: { in: batchLots },
        },
        select: {
          skuId: true,
          batchCode: true,
          unitsPerCarton: true,
          unitDimensionsCm: true,
          unitWeightKg: true,
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

      let totalStoragePalletsIn = 0
      let totalShippingPalletsOut = 0

      for (const item of validatedItems) {
        const sku = skuMap.get(item.skuCode)
        if (!sku) {
          throw new Error(`SKU not found: ${item.skuCode}`)
        }

        const batchRecord = batchMap.get(`${sku.id}::${item.batchLot}`)
        if (!batchRecord) {
          throw new Error(`Batch ${item.batchLot} not found for SKU ${item.skuCode}`)
        }

        const resolvedStorageCartonsPerPallet =
          item.storageCartonsPerPallet ?? batchRecord.storageCartonsPerPallet ?? null
        let resolvedShippingCartonsPerPallet =
          item.shippingCartonsPerPallet ?? batchRecord.shippingCartonsPerPallet ?? null

        if (
          txType === 'RECEIVE' &&
          (!resolvedStorageCartonsPerPallet || resolvedStorageCartonsPerPallet <= 0)
        ) {
          throw new ValidationError(
            `Storage cartons per pallet is required for SKU ${item.skuCode} batch ${item.batchLot}. Configure it on the batch in Config → Products → Batches.`
          )
        }

        if (
          txType === 'RECEIVE' &&
          (!resolvedShippingCartonsPerPallet || resolvedShippingCartonsPerPallet <= 0)
        ) {
          throw new ValidationError(
            `Shipping cartons per pallet is required for SKU ${item.skuCode} batch ${item.batchLot}. Configure it on the batch in Config → Products → Batches.`
          )
        }

        if (txType === 'SHIP') {
          const hasPalletOverride =
            item.shippingPalletsOut !== undefined || item.pallets !== undefined
          if (
            !hasPalletOverride &&
            (!resolvedShippingCartonsPerPallet || resolvedShippingCartonsPerPallet <= 0)
          ) {
            throw new ValidationError(
              `Shipping cartons per pallet is required for SKU ${item.skuCode} batch ${item.batchLot}. Configure it on the batch in Config → Products → Batches.`
            )
          }

          const originalReceive = await tx.inventoryTransaction.findFirst({
            where: {
              warehouseCode: warehouse.code,
              skuCode: sku.skuCode,
              batchLot: item.batchLot,
              transactionType: 'RECEIVE',
            },
            orderBy: { transactionDate: 'asc' },
            select: { shippingCartonsPerPallet: true },
          })

          if (originalReceive?.shippingCartonsPerPallet) {
            resolvedShippingCartonsPerPallet = originalReceive.shippingCartonsPerPallet
          }
        }

        const {
          storagePalletsIn: finalStoragePalletsIn,
          shippingPalletsOut: finalShippingPalletsOut,
        } = calculatePalletValues({
          transactionType: txType as TransactionTypeForPallets,
          cartons: item.cartons,
          storageCartonsPerPallet:
            txType === 'RECEIVE' ? resolvedStorageCartonsPerPallet : item.storageCartonsPerPallet,
          shippingCartonsPerPallet: resolvedShippingCartonsPerPallet,
          providedStoragePallets: item.storagePalletsIn,
          providedShippingPallets: item.shippingPalletsOut,
          providedPallets: item.pallets,
        })

        if (txType === 'RECEIVE') {
          totalStoragePalletsIn += finalStoragePalletsIn
        }
        if (txType === 'SHIP') {
          totalShippingPalletsOut += finalShippingPalletsOut
        }

        // Use the provided reference number (commercial invoice) directly
        const referenceId = refNumber
        const unitsPerCarton = batchRecord.unitsPerCarton ?? sku.unitsPerCarton ?? 1
        const pickupDateCandidate = pickupDate ? parseLocalDateTime(pickupDate) : transactionDateObj
        const pickupDateObj = Number.isNaN(pickupDateCandidate.getTime())
          ? transactionDateObj
          : pickupDateCandidate

        const transaction = await tx.inventoryTransaction.create({
          data: {
            // Warehouse snapshot data
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            warehouseAddress: warehouse.address,
            // SKU snapshot data
            skuCode: sku.skuCode,
            skuDescription: sku.description,
            unitDimensionsCm: batchRecord.unitDimensionsCm ?? sku.unitDimensionsCm,
            unitWeightKg: batchRecord.unitWeightKg ?? sku.unitWeightKg,
            cartonDimensionsCm: batchRecord.cartonDimensionsCm ?? sku.cartonDimensionsCm,
            cartonWeightKg: batchRecord.cartonWeightKg ?? sku.cartonWeightKg,
            packagingType: batchRecord.packagingType ?? sku.packagingType,
            batchLot: item.batchLot,
            transactionType: txType as TransactionType,
            referenceId: referenceId,
            cartonsIn: ['RECEIVE', 'ADJUST_IN'].includes(txType) ? item.cartons : 0,
            cartonsOut: ['SHIP', 'ADJUST_OUT'].includes(txType) ? item.cartons : 0,
            storagePalletsIn: finalStoragePalletsIn,
            shippingPalletsOut: finalShippingPalletsOut,
            storageCartonsPerPallet:
              txType === 'RECEIVE' ? (resolvedStorageCartonsPerPallet ?? null) : null,
            shippingCartonsPerPallet:
              txType === 'RECEIVE'
                ? (resolvedShippingCartonsPerPallet ?? null)
                : txType === 'SHIP'
                  ? (resolvedShippingCartonsPerPallet ?? null)
                  : null,
            shipName: sanitizedShipName,
            trackingNumber: sanitizedTrackingNumber || null,
            supplier: txType === 'RECEIVE' ? sanitizedSupplier : null,
            attachments: (() => {
              const combinedAttachments = [...attachmentList]
              if (sanitizedNotes) {
                combinedAttachments.push({ type: 'notes', content: sanitizedNotes })
              }
              return combinedAttachments.length > 0 ? combinedAttachments : null
            })(),
            transactionDate: transactionDateObj,
            pickupDate: pickupDateObj,
            createdById: session.user.id,
            createdByName: createdByName,
            unitsPerCarton,
          },
        })

        transactions.push(transaction)
      }

      if (txType === 'RECEIVE' && totalStoragePalletsIn <= 0) {
        throw new ValidationError('Storage pallet count is required for inbound transactions')
      }

      if (
        txType === 'SHIP' &&
        outboundShipMode === OutboundShipMode.PALLETS &&
        totalShippingPalletsOut <= 0
      ) {
        throw new ValidationError('Total pallets is required for pallet outbound shipments')
      }

      // Create Tactical cost ledger entries automatically (manual costs are disabled).
      if (txType === 'RECEIVE' || txType === 'SHIP') {
        const rates = await tx.costRate.findMany({
          where: {
            warehouseId: warehouse.id,
            isActive: true,
            effectiveDate: { lte: transactionDateObj },
            OR: [{ endDate: null }, { endDate: { gte: transactionDateObj } }],
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

        let costLedgerEntries: Prisma.CostLedgerCreateManyInput[] = []
        try {
          costLedgerEntries = buildTacticalCostLedgerEntries({
            transactionType: txType,
            receiveType: inboundReceiveType,
            shipMode: outboundShipMode,
            ratesByCostName,
            lines: transactions.map(t => ({
              transactionId: t.id,
              skuCode: t.skuCode,
              cartons: txType === 'RECEIVE' ? t.cartonsIn : t.cartonsOut,
              pallets: txType === 'SHIP' ? t.shippingPalletsOut : t.storagePalletsIn,
              cartonDimensionsCm: t.cartonDimensionsCm,
            })),
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            createdAt: transactionDateObj,
            createdByName,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Cost calculation failed'
          throw new ValidationError(message)
        }

        if (costLedgerEntries.length > 0) {
          await tx.costLedger.createMany({ data: costLedgerEntries })
        }
      }

      return transactions
    })

    // Record storage cost entries for each transaction
    await Promise.all(
      result.map(t =>
        recordStorageCostEntry({
          warehouseCode: t.warehouseCode,
          warehouseName: t.warehouseName,
          skuCode: t.skuCode,
          skuDescription: t.skuDescription,
          batchLot: t.batchLot,
          transactionDate: t.transactionDate,
        }).catch(storageError => {
          // Don't fail transaction processing if storage cost recording fails
          const message = storageError instanceof Error ? storageError.message : 'Unknown error'
          console.error(
            `Storage cost recording failed for ${t.warehouseCode}/${t.skuCode}/${t.batchLot}:`,
            message
          )
        })
      )
    )

    const duration = Date.now() - startTime

    // Log successful transaction completion
    businessLogger.info('Inventory transaction completed successfully', {
      transactionType: txType,
      referenceNumber: refNumber,
      warehouseId,
      transactionCount: result.length,
      transactionIds: result.map(t => t.id),
      totalCartons: validatedItems.reduce((sum, item) => sum + item.cartons, 0),
      duration,
      userId: session.user.id,
    })

    // Log performance metrics
    perfLogger.log('Transaction processing completed', {
      transactionType: txType,
      itemCount: validatedItems.length,
      duration,
      avgDurationPerItem: duration / Math.max(validatedItems.length, 1),
    })

    // Cost calculation is now handled automatically by Prisma middleware
    // The middleware will detect transactions with costs and process them
    // No manual trigger needed!

    return NextResponse.json({
      success: true,
      message: `${result.length} transactions created`,
      transactionIds: result.map(t => t.id), // Return UUIDs for navigation
    })
  } catch (error: unknown) {
    // console.error('Transaction error:', error);
    // console.error('Error stack:', error.stack);

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('Insufficient inventory')) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      if (
        error.message.includes('could not serialize') ||
        error.message.includes('deadlock') ||
        error.message.includes('concurrent update')
      ) {
        return NextResponse.json(
          {
            error: 'Transaction conflict detected. Please try again.',
            details:
              'Another transaction is modifying the same inventory. Please retry your request.',
          },
          { status: 409 }
        )
      }
    }

    const detailMessage = error instanceof Error ? error.message : 'Unknown error'
    businessLogger.error('Inventory transaction failed', {
      ...errorContext,
      detail: detailMessage,
    })
    return NextResponse.json(
      {
        error: detailMessage,
        details: detailMessage,
      },
      { status: 500 }
    )
  }
})

// Prevent updates to maintain immutability
export const PUT = withAuth(async () => {
  return NextResponse.json(
    {
      error: 'Inventory transactions are immutable and cannot be modified',
      message:
        'To correct errors, please create an adjustment transaction (ADJUST_IN or ADJUST_OUT)',
    },
    { status: 405 }
  )
})

// Prevent deletes to maintain immutability
export const DELETE = withAuth(async () => {
  return NextResponse.json(
    {
      error: 'Inventory transactions are immutable and cannot be deleted',
      message:
        'The inventory ledger maintains a permanent audit trail. To correct errors, please create an adjustment transaction',
    },
    { status: 405 }
  )
})
