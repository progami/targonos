import { getTenantPrisma } from '@/lib/tenant/server'
import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { ValidationError, NotFoundError, ConflictError } from '@/lib/api'
import {
  FulfillmentDestinationType,
  FulfillmentOrderLineStatus,
  FulfillmentOrderStatus,
  Prisma,
  TransactionType,
} from '@targon/prisma-talos'
import { calculatePalletValues } from '@/lib/utils/pallet-calculations'

export interface FulfillmentUserContext {
  id: string
  name: string
}

export type CreateFulfillmentOrderLineInput = {
  skuCode: string
  skuDescription?: string
  batchLot: string
  quantity: number
  notes?: string
}

export type CreateFulfillmentOrderInput = {
  warehouseCode: string
  warehouseName?: string
  destinationType?: FulfillmentDestinationType
  destinationName?: string
  destinationAddress?: string
  destinationCountry?: string
  shippingCarrier?: string
  shippingMethod?: string
  trackingNumber?: string
  externalReference?: string
  amazonShipmentId?: string
  amazonShipmentName?: string
  amazonShipmentStatus?: string
  amazonDestinationFulfillmentCenterId?: string
  amazonLabelPrepType?: string
  amazonBoxContentsSource?: string
  amazonShipFromAddress?: Record<string, unknown> | null
  amazonReferenceId?: string
  amazonShipmentReference?: string
  amazonShipperId?: string
  amazonPickupNumber?: string
  amazonPickupAppointmentId?: string
  amazonDeliveryAppointmentId?: string
  amazonLoadId?: string
  amazonFreightBillNumber?: string
  amazonBillOfLadingNumber?: string
  amazonPickupWindowStart?: Date | string | null
  amazonPickupWindowEnd?: Date | string | null
  amazonDeliveryWindowStart?: Date | string | null
  amazonDeliveryWindowEnd?: Date | string | null
  amazonPickupAddress?: string
  amazonPickupContactName?: string
  amazonPickupContactPhone?: string
  amazonDeliveryAddress?: string
  amazonShipmentMode?: string
  amazonBoxCount?: number | string | null
  amazonPalletCount?: number | string | null
  amazonCommodityDescription?: string
  amazonDistanceMiles?: number | string | null
  amazonBasePrice?: number | string | null
  amazonFuelSurcharge?: number | string | null
  amazonTotalPrice?: number | string | null
  amazonCurrency?: string
  notes?: string
  lines: CreateFulfillmentOrderLineInput[]
}

export async function generateFoNumber(): Promise<string> {
  const prisma = await getTenantPrisma()

  const lastFo = await prisma.fulfillmentOrder.findFirst({
    where: { foNumber: { startsWith: 'FO-' } },
    orderBy: { foNumber: 'desc' },
    select: { foNumber: true },
  })

  let nextNumber = 1
  if (lastFo?.foNumber) {
    const match = lastFo.foNumber.match(/FO-(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  return `FO-${nextNumber.toString().padStart(4, '0')}`
}

function normalizeSkuCode(value: string) {
  return sanitizeForDisplay(value.trim())
}

function normalizeBatchLot(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return sanitizeForDisplay(trimmed.toUpperCase())
}

export async function listFulfillmentOrders() {
  const prisma = await getTenantPrisma()
  return prisma.fulfillmentOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: { lines: true },
  })
}

export async function getFulfillmentOrderById(id: string) {
  const prisma = await getTenantPrisma()
  const order = await prisma.fulfillmentOrder.findUnique({
    where: { id },
    include: { lines: true, documents: true },
  })

  if (!order) {
    throw new NotFoundError('Fulfillment order not found')
  }

  return order
}

export async function createFulfillmentOrder(
  input: CreateFulfillmentOrderInput,
  user: FulfillmentUserContext
) {
  if (!input.warehouseCode?.trim()) {
    throw new ValidationError('Warehouse code is required')
  }

  if (!input.lines || input.lines.length === 0) {
    throw new ValidationError('At least one line item is required')
  }

  const normalizedLines = input.lines.map(line => ({
    skuCode: normalizeSkuCode(line.skuCode),
    skuDescription: line.skuDescription?.trim()
      ? sanitizeForDisplay(line.skuDescription.trim())
      : undefined,
    batchLot: normalizeBatchLot(line.batchLot),
    quantity: line.quantity,
    notes: line.notes?.trim() ? sanitizeForDisplay(line.notes.trim()) : undefined,
  }))

  const keySet = new Set<string>()
  for (const line of normalizedLines) {
    if (!line.skuCode) {
      throw new ValidationError('SKU code is required for all line items')
    }
    if (!line.batchLot) {
      throw new ValidationError(`Batch is required for SKU ${line.skuCode}`)
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ValidationError(`Quantity must be a positive integer for SKU ${line.skuCode}`)
    }
    const key = `${line.skuCode.toLowerCase()}::${line.batchLot.toLowerCase()}`
    if (keySet.has(key)) {
      throw new ValidationError(
        `Duplicate line detected for SKU ${line.skuCode} batch ${line.batchLot}. Combine quantities into a single line.`
      )
    }
    keySet.add(key)
  }

  const prisma = await getTenantPrisma()

  const warehouse = await prisma.warehouse.findFirst({
    where: { code: sanitizeForDisplay(input.warehouseCode.trim()) },
    select: { code: true, name: true, address: true },
  })

  if (!warehouse) {
    throw new ValidationError(`Warehouse not found: ${input.warehouseCode}`)
  }

  const skuCodes = Array.from(new Set(normalizedLines.map(line => line.skuCode)))
  const skus = await prisma.sku.findMany({
    where: { skuCode: { in: skuCodes } },
    select: { id: true, skuCode: true, description: true },
  })
  const skuByCode = new Map(skus.map(sku => [sku.skuCode, sku]))

  for (const line of normalizedLines) {
    if (!skuByCode.has(line.skuCode)) {
      throw new ValidationError(`SKU ${line.skuCode} not found. Create the SKU first.`)
    }
  }

  const batchCodes = Array.from(new Set(normalizedLines.map(line => line.batchLot)))
  const batchRecords = await prisma.skuBatch.findMany({
    where: {
      skuId: { in: skus.map(sku => sku.id) },
      batchCode: { in: batchCodes },
    },
    select: { skuId: true, batchCode: true },
  })
  const batchKeySet = new Set(batchRecords.map(batch => `${batch.skuId}::${batch.batchCode}`))

  for (const line of normalizedLines) {
    const sku = skuByCode.get(line.skuCode)
    if (!sku) continue
    const key = `${sku.id}::${line.batchLot}`
    if (!batchKeySet.has(key)) {
      throw new ValidationError(
        `Batch ${line.batchLot} is not configured for SKU ${line.skuCode}. Create it in Config → Products → Batches.`
      )
    }
  }

  const MAX_FO_NUMBER_ATTEMPTS = 5

  for (let attempt = 0; attempt < MAX_FO_NUMBER_ATTEMPTS; attempt += 1) {
    const foNumber = await generateFoNumber()

    const normalizeOptionalString = (value?: string | null) =>
      value?.trim() ? sanitizeForDisplay(value.trim()) : null

    const parseOptionalDate = (value?: Date | string | null, label?: string) => {
      if (!value) return null
      const parsed = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError(`${label ?? 'Date'} is invalid`)
      }
      return parsed
    }

    const parseOptionalNumber = (value: number | string | null | undefined, label: string) => {
      if (value === null || value === undefined || value === '') return null
      const parsed = typeof value === 'string' ? Number(value) : value
      if (!Number.isFinite(parsed)) {
        throw new ValidationError(`${label} must be a valid number`)
      }
      return parsed
    }

    const parseOptionalInt = (value: number | string | null | undefined, label: string) => {
      if (value === null || value === undefined || value === '') return null
      const parsed = typeof value === 'string' ? Number(value) : value
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ValidationError(`${label} must be a non-negative integer`)
      }
      return parsed
    }

    const amazonShipFromAddress = input.amazonShipFromAddress
      ? (JSON.parse(JSON.stringify(input.amazonShipFromAddress)) as Prisma.InputJsonValue)
      : null

    const amazonPickupWindowStart = parseOptionalDate(
      input.amazonPickupWindowStart,
      'Pickup window start'
    )
    const amazonPickupWindowEnd = parseOptionalDate(
      input.amazonPickupWindowEnd,
      'Pickup window end'
    )
    const amazonDeliveryWindowStart = parseOptionalDate(
      input.amazonDeliveryWindowStart,
      'Delivery window start'
    )
    const amazonDeliveryWindowEnd = parseOptionalDate(
      input.amazonDeliveryWindowEnd,
      'Delivery window end'
    )

    try {
      return await prisma.fulfillmentOrder.create({
        data: {
          foNumber,
          status: FulfillmentOrderStatus.DRAFT,
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          destinationType: input.destinationType ?? FulfillmentDestinationType.CUSTOMER,
          destinationName: normalizeOptionalString(input.destinationName),
          destinationAddress: normalizeOptionalString(input.destinationAddress),
          destinationCountry: normalizeOptionalString(input.destinationCountry),
          shippingCarrier: normalizeOptionalString(input.shippingCarrier),
          shippingMethod: normalizeOptionalString(input.shippingMethod),
          trackingNumber: normalizeOptionalString(input.trackingNumber),
          externalReference: normalizeOptionalString(input.externalReference),
          amazonShipmentId: normalizeOptionalString(input.amazonShipmentId),
          amazonShipmentName: normalizeOptionalString(input.amazonShipmentName),
          amazonShipmentStatus: normalizeOptionalString(input.amazonShipmentStatus),
          amazonDestinationFulfillmentCenterId: normalizeOptionalString(
            input.amazonDestinationFulfillmentCenterId
          ),
          amazonLabelPrepType: normalizeOptionalString(input.amazonLabelPrepType),
          amazonBoxContentsSource: normalizeOptionalString(input.amazonBoxContentsSource),
          amazonShipFromAddress,
          amazonReferenceId: normalizeOptionalString(input.amazonReferenceId),
          amazonShipmentReference: normalizeOptionalString(input.amazonShipmentReference),
          amazonShipperId: normalizeOptionalString(input.amazonShipperId),
          amazonPickupNumber: normalizeOptionalString(input.amazonPickupNumber),
          amazonPickupAppointmentId: normalizeOptionalString(input.amazonPickupAppointmentId),
          amazonDeliveryAppointmentId: normalizeOptionalString(input.amazonDeliveryAppointmentId),
          amazonLoadId: normalizeOptionalString(input.amazonLoadId),
          amazonFreightBillNumber: normalizeOptionalString(input.amazonFreightBillNumber),
          amazonBillOfLadingNumber: normalizeOptionalString(input.amazonBillOfLadingNumber),
          amazonPickupWindowStart,
          amazonPickupWindowEnd,
          amazonDeliveryWindowStart,
          amazonDeliveryWindowEnd,
          amazonPickupAddress: normalizeOptionalString(input.amazonPickupAddress),
          amazonPickupContactName: normalizeOptionalString(input.amazonPickupContactName),
          amazonPickupContactPhone: normalizeOptionalString(input.amazonPickupContactPhone),
          amazonDeliveryAddress: normalizeOptionalString(input.amazonDeliveryAddress),
          amazonShipmentMode: normalizeOptionalString(input.amazonShipmentMode),
          amazonBoxCount: parseOptionalInt(input.amazonBoxCount, 'Box count'),
          amazonPalletCount: parseOptionalInt(input.amazonPalletCount, 'Pallet count'),
          amazonCommodityDescription: normalizeOptionalString(input.amazonCommodityDescription),
          amazonDistanceMiles: parseOptionalNumber(input.amazonDistanceMiles, 'Distance (miles)'),
          amazonBasePrice: parseOptionalNumber(input.amazonBasePrice, 'Base price'),
          amazonFuelSurcharge: parseOptionalNumber(input.amazonFuelSurcharge, 'Fuel surcharge'),
          amazonTotalPrice: parseOptionalNumber(input.amazonTotalPrice, 'Total price'),
          amazonCurrency: normalizeOptionalString(input.amazonCurrency),
          notes: normalizeOptionalString(input.notes),
          createdById: user.id,
          createdByName: user.name,
          lines: {
            create: normalizedLines.map(line => ({
              skuCode: line.skuCode,
              skuDescription:
                line.skuDescription ?? skuByCode.get(line.skuCode)?.description ?? null,
              batchLot: line.batchLot,
              quantity: line.quantity,
              status: FulfillmentOrderLineStatus.PENDING,
              shippedQuantity: 0,
              lineNotes: line.notes ?? null,
            })),
          },
        },
        include: { lines: true, documents: true },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta?.target.includes('fo_number')
      ) {
        continue
      }
      throw error
    }
  }

  throw new ConflictError('Could not generate a unique fulfillment order number. Please try again.')
}

export function getValidNextFulfillmentStages(
  currentStatus: FulfillmentOrderStatus
): FulfillmentOrderStatus[] {
  switch (currentStatus) {
    case FulfillmentOrderStatus.DRAFT:
      return [FulfillmentOrderStatus.SHIPPED, FulfillmentOrderStatus.CANCELLED]
    case FulfillmentOrderStatus.SHIPPED:
      return []
    case FulfillmentOrderStatus.CANCELLED:
      return []
    default:
      return []
  }
}

export async function transitionFulfillmentOrderStage(
  id: string,
  targetStatus: FulfillmentOrderStatus,
  stageData: {
    shippedDate?: string | Date | null
    deliveredDate?: string | Date | null
    shippingCarrier?: string | null
    shippingMethod?: string | null
    trackingNumber?: string | null
  },
  user: FulfillmentUserContext
) {
  const prisma = await getTenantPrisma()

  const order = await prisma.fulfillmentOrder.findUnique({
    where: { id },
    include: { lines: true },
  })

  if (!order) {
    throw new NotFoundError('Fulfillment order not found')
  }

  const validNextStages = getValidNextFulfillmentStages(order.status)
  if (!validNextStages.includes(targetStatus)) {
    throw new ValidationError(`Invalid stage transition from ${order.status} to ${targetStatus}`)
  }

  if (targetStatus === FulfillmentOrderStatus.CANCELLED) {
    return prisma.fulfillmentOrder.update({
      where: { id },
      data: { status: FulfillmentOrderStatus.CANCELLED },
      include: { lines: true, documents: true },
    })
  }

  if (targetStatus !== FulfillmentOrderStatus.SHIPPED) {
    throw new ValidationError('Unsupported fulfillment stage transition')
  }

  const shippedAtRaw = stageData.shippedDate ?? order.shippedDate ?? new Date()
  const shippedAt = shippedAtRaw instanceof Date ? shippedAtRaw : new Date(shippedAtRaw)
  if (Number.isNaN(shippedAt.getTime())) {
    throw new ValidationError('Invalid shipped date')
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { code: order.warehouseCode },
    select: { id: true, code: true, name: true, address: true },
  })

  if (!warehouse) {
    throw new NotFoundError('Warehouse not found for fulfillment order')
  }

  if (!order.lines || order.lines.length === 0) {
    throw new ValidationError('Cannot ship a fulfillment order with no lines')
  }

  const skuCodes = Array.from(new Set(order.lines.map(line => line.skuCode)))
  const skus = await prisma.sku.findMany({
    where: { skuCode: { in: skuCodes } },
    select: {
      id: true,
      skuCode: true,
      description: true,
      unitsPerCarton: true,
      unitDimensionsCm: true,
      unitWeightKg: true,
      cartonDimensionsCm: true,
      cartonWeightKg: true,
      packagingType: true,
    },
  })
  const skuMap = new Map(skus.map(sku => [sku.skuCode, sku]))

  const batchCodes = Array.from(new Set(order.lines.map(line => line.batchLot)))
  const batchRecords = await prisma.skuBatch.findMany({
    where: {
      skuId: { in: skus.map(sku => sku.id) },
      batchCode: { in: batchCodes },
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
      shippingCartonsPerPallet: true,
    },
  })
  const batchMap = new Map(batchRecords.map(batch => [`${batch.skuId}::${batch.batchCode}`, batch]))

  const referenceId = stageData.trackingNumber?.trim()
    ? sanitizeForDisplay(stageData.trackingNumber.trim())
    : (order.trackingNumber ?? order.foNumber)

  return prisma.$transaction(async tx => {
    for (const line of order.lines) {
      if (line.status === FulfillmentOrderLineStatus.CANCELLED) {
        continue
      }

      const sku = skuMap.get(line.skuCode)
      if (!sku) {
        throw new ValidationError(`SKU not found: ${line.skuCode}`)
      }

      const batch = batchMap.get(`${sku.id}::${line.batchLot}`)
      if (!batch) {
        throw new ValidationError(
          `Batch ${line.batchLot} is not configured for SKU ${line.skuCode}. Create it in Config → Products → Batches.`
        )
      }

      const cartons = line.quantity
      if (!Number.isInteger(cartons) || cartons <= 0) {
        throw new ValidationError(`Invalid cartons quantity for SKU ${line.skuCode}`)
      }

      const unitsPerCarton = batch.unitsPerCarton ?? sku.unitsPerCarton ?? 1
      const shippingCartonsPerPallet = batch.shippingCartonsPerPallet ?? null

      if (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0) {
        throw new ValidationError(
          `Shipping cartons per pallet is required for SKU ${line.skuCode} batch ${line.batchLot}. Configure it on the batch in Config → Products → Batches.`
        )
      }

      const transactions = await tx.inventoryTransaction.findMany({
        where: {
          warehouseCode: warehouse.code,
          skuCode: sku.skuCode,
          batchLot: line.batchLot,
          transactionDate: { lte: shippedAt },
        },
        select: { cartonsIn: true, cartonsOut: true },
      })

      const currentCartons = transactions.reduce(
        (sum, txn) => sum + Number(txn.cartonsIn || 0) - Number(txn.cartonsOut || 0),
        0
      )

      if (currentCartons < cartons) {
        throw new ValidationError(
          `Insufficient inventory for SKU ${sku.skuCode} batch ${line.batchLot}. Available: ${currentCartons}, Requested: ${cartons}`
        )
      }

      const { shippingPalletsOut } = calculatePalletValues({
        transactionType: 'SHIP',
        cartons,
        shippingCartonsPerPallet,
      })

      if (shippingPalletsOut <= 0) {
        throw new ValidationError('Total pallets is required for outbound shipments')
      }

      await tx.inventoryTransaction.create({
        data: {
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          warehouseAddress: warehouse.address,
          skuCode: sku.skuCode,
          skuDescription: line.skuDescription ?? sku.description,
          unitDimensionsCm: batch.unitDimensionsCm ?? sku.unitDimensionsCm,
          unitWeightKg: batch.unitWeightKg ?? sku.unitWeightKg,
          cartonDimensionsCm: batch.cartonDimensionsCm ?? sku.cartonDimensionsCm,
          cartonWeightKg: batch.cartonWeightKg ?? sku.cartonWeightKg,
          packagingType: batch.packagingType ?? sku.packagingType,
          unitsPerCarton,
          batchLot: line.batchLot,
          transactionType: TransactionType.SHIP,
          referenceId,
          cartonsIn: 0,
          cartonsOut: cartons,
          storagePalletsIn: 0,
          shippingPalletsOut,
          storageCartonsPerPallet: null,
          shippingCartonsPerPallet,
          shipName: order.destinationName ?? stageData.shippingCarrier ?? null,
          trackingNumber: stageData.trackingNumber?.trim()
            ? sanitizeForDisplay(stageData.trackingNumber.trim())
            : (order.trackingNumber ?? null),
          supplier: null,
          attachments: null,
          transactionDate: shippedAt,
          pickupDate: shippedAt,
          createdById: user.id,
          createdByName: user.name,
          fulfillmentOrderId: order.id,
          fulfillmentOrderLineId: line.id,
          isReconciled: false,
          isDemo: false,
        },
      })

      await tx.fulfillmentOrderLine.update({
        where: { id: line.id },
        data: {
          shippedQuantity: cartons,
          status: FulfillmentOrderLineStatus.SHIPPED,
        },
      })
    }

    const deliveredAtRaw = stageData.deliveredDate ?? order.deliveredDate ?? null
    const deliveredDate = deliveredAtRaw
      ? deliveredAtRaw instanceof Date
        ? deliveredAtRaw
        : new Date(deliveredAtRaw)
      : null

    if (deliveredDate && Number.isNaN(deliveredDate.getTime())) {
      throw new ValidationError('Invalid delivered date')
    }
    if (deliveredDate && deliveredDate < shippedAt) {
      throw new ValidationError('Delivered date cannot be earlier than shipped date')
    }

    const updatedOrder = await tx.fulfillmentOrder.update({
      where: { id: order.id },
      data: {
        status: FulfillmentOrderStatus.SHIPPED,
        shippedDate: shippedAt,
        deliveredDate,
        shippingCarrier: stageData.shippingCarrier?.trim()
          ? sanitizeForDisplay(stageData.shippingCarrier.trim())
          : order.shippingCarrier,
        shippingMethod: stageData.shippingMethod?.trim()
          ? sanitizeForDisplay(stageData.shippingMethod.trim())
          : order.shippingMethod,
        trackingNumber: stageData.trackingNumber?.trim()
          ? sanitizeForDisplay(stageData.trackingNumber.trim())
          : order.trackingNumber,
      },
      include: { lines: true, documents: true },
    })

    return updatedOrder
  })
}
