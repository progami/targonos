import { getTenantPrisma } from '@/lib/tenant/server'
import {
  Prisma,
  CostCategory,
  FinancialLedgerCategory,
  FinancialLedgerSourceType,
  PurchaseOrderType,
  GrnStatus,
  PurchaseOrderLineStatus,
  PurchaseOrderStatus,
  TransactionType,
} from '@targon/prisma-talos'
import { ValidationError, ConflictError, NotFoundError } from '@/lib/api'
import {
  SYSTEM_FALLBACK_ID,
  SYSTEM_FALLBACK_NAME,
  toPublicOrderNumber,
} from '@/lib/services/purchase-order-utils'
import {
  buildGoodsReceiptReference,
  getNextGoodsReceiptSequence,
  resolveOrderReferenceSeed,
} from '@/lib/services/supply-chain-reference-service'
import { buildTacticalCostLedgerEntries } from '@/lib/costing/tactical-costing'
import { recordStorageCostEntry } from '@/services/storageCost.service'

function toFinancialCategory(costCategory: CostCategory) {
  if (costCategory === CostCategory.Inbound) return FinancialLedgerCategory.Inbound
  if (costCategory === CostCategory.Storage) return FinancialLedgerCategory.Storage
  if (costCategory === CostCategory.Outbound) return FinancialLedgerCategory.Outbound
  if (costCategory === CostCategory.Forwarding) return FinancialLedgerCategory.Forwarding
  return FinancialLedgerCategory.Other
}

export interface UserContext {
  id?: string | null
  name?: string | null
}

export interface GrnLineInput {
  purchaseOrderLineId: string
  quantity: number
  lotRef?: string | null
  storageCartonsPerPallet?: number | null
  shippingCartonsPerPallet?: number | null
  attachments?: Record<string, unknown> | null
}

export interface CreateGrnInput {
  purchaseOrderId: string
  referenceNumber?: string | null
  receivedAt?: Date | null
  notes?: string | null
  lines: GrnLineInput[]
}

export async function listGrns(filter?: { purchaseOrderId?: string | null }) {
  const prisma = await getTenantPrisma()
  const notes = await prisma.grn.findMany({
    where: filter?.purchaseOrderId ? { purchaseOrderId: filter.purchaseOrderId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
      purchaseOrder: {
        select: {
          id: true,
          orderNumber: true,
          type: true,
          status: true,
          warehouseCode: true,
          warehouseName: true,
        },
      },
    },
  })

  return notes.map(note => formatGrnOrderNumber(note))
}

export async function getGrnById(id: string) {
  const prisma = await getTenantPrisma()
  const note = await prisma.grn.findUnique({
    where: { id },
    include: {
      lines: true,
      purchaseOrder: {
        select: {
          id: true,
          orderNumber: true,
          type: true,
          status: true,
          warehouseCode: true,
          warehouseName: true,
        },
      },
    },
  })

  if (!note) {
    throw new NotFoundError('GRN not found')
  }

  return formatGrnOrderNumber(note)
}

export async function createGrn(input: CreateGrnInput, user: UserContext) {
  if (input.lines.length === 0) {
    throw new ValidationError('At least one line is required')
  }

  const prisma = await getTenantPrisma()
  return prisma.$transaction(async tx => {
    const purchaseOrder = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
    })

    if (!purchaseOrder) {
      throw new NotFoundError('Purchase order not found')
    }

    if (
      purchaseOrder.status === PurchaseOrderStatus.CANCELLED ||
      purchaseOrder.status === PurchaseOrderStatus.CLOSED
    ) {
      throw new ConflictError('Cannot record a note against a closed or cancelled purchase order')
    }

    if (!purchaseOrder.warehouseCode || !purchaseOrder.warehouseName) {
      throw new ValidationError(
        'Select a warehouse on the purchase order before creating a GRN'
      )
    }

    const receivedAt = input.receivedAt ?? new Date()
    const orderReferenceSeed = resolveOrderReferenceSeed({
      orderNumber: purchaseOrder.orderNumber,
      poNumber: purchaseOrder.poNumber,
      skuGroup: purchaseOrder.skuGroup,
    })
    const nextGrnSequence = await getNextGoodsReceiptSequence(tx, orderReferenceSeed.skuGroup)
    const generatedGrnReference = buildGoodsReceiptReference(
      nextGrnSequence,
      orderReferenceSeed.skuGroup
    )

    const note = await tx.grn.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        status: GrnStatus.DRAFT,
        referenceNumber: generatedGrnReference,
        receivedAt,
        receivedById: user.id ?? null,
        receivedByName: user.name ?? null,
        warehouseCode: purchaseOrder.warehouseCode,
        warehouseName: purchaseOrder.warehouseName,
        notes: input.notes ?? null,
        lines: {
          create: await Promise.all(
            input.lines.map(async line => {
              const poLine = await tx.purchaseOrderLine.findUnique({
                where: { id: line.purchaseOrderLineId },
              })

              if (!poLine || poLine.purchaseOrderId !== input.purchaseOrderId) {
                throw new ValidationError('Line does not belong to the purchase order')
              }

              const expectedLotRef = poLine.lotRef
              if (!expectedLotRef) {
                throw new ValidationError(`Lot reference missing for SKU ${poLine.skuCode}`)
              }

              if (line.lotRef && line.lotRef !== expectedLotRef) {
                throw new ValidationError(
                  `Lot ref mismatch for SKU ${poLine.skuCode}. Expected ${expectedLotRef}.`
                )
              }

              return {
                purchaseOrderLineId: line.purchaseOrderLineId,
                skuCode: poLine.skuCode,
                skuDescription: poLine.skuDescription,
                lotRef: expectedLotRef,
                quantity: line.quantity,
                storageCartonsPerPallet: line.storageCartonsPerPallet ?? null,
                shippingCartonsPerPallet: line.shippingCartonsPerPallet ?? null,
                attachments: line.attachments ? (line.attachments as Prisma.JsonObject) : null,
              }
            })
          ),
        },
      },
      include: {
        lines: true,
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            type: true,
            status: true,
            warehouseCode: true,
            warehouseName: true,
          },
        },
      },
    })

    return formatGrnOrderNumber(note)
  })
}

export async function cancelGrn(id: string) {
  const prisma = await getTenantPrisma()
  return prisma.$transaction(async tx => {
    const note = await tx.grn.findUnique({
      where: { id },
    })

    if (!note) {
      throw new NotFoundError('GRN not found')
    }

    if (note.status !== GrnStatus.DRAFT) {
      throw new ConflictError('Only draft notes can be cancelled')
    }

    await tx.grn.update({
      where: { id },
      data: {
        status: GrnStatus.CANCELLED,
      },
    })
  })
}

function formatGrnOrderNumber<T extends { purchaseOrder: { orderNumber: string } | null }>(
  note: T
): T {
  const purchaseOrder = note.purchaseOrder
  if (!purchaseOrder) return note
  return {
    ...note,
    purchaseOrder: {
      ...purchaseOrder,
      orderNumber: toPublicOrderNumber(purchaseOrder.orderNumber),
    },
  } as T
}

export async function postGrn(id: string, _user: UserContext) {
  const prisma = await getTenantPrisma()
  let createdTransactions: Array<{
    warehouseCode: string
    warehouseName: string
    skuCode: string
    skuDescription: string
    lotRef: string
    transactionDate: Date
  }> = []

  const postedNote = await prisma.$transaction(async tx => {
    const existingNote = await tx.grn.findUnique({
      where: { id },
      include: {
        lines: true,
        purchaseOrder: {
          include: { lines: true },
        },
      },
    })

    if (!existingNote) {
      throw new NotFoundError('GRN not found')
    }

    if (existingNote.status !== GrnStatus.DRAFT) {
      throw new ConflictError('Only draft notes can be posted')
    }

    const po = existingNote.purchaseOrder
    if (!po) {
      throw new NotFoundError('Purchase order missing for GRN')
    }
    if (po.status === PurchaseOrderStatus.CANCELLED || po.status === PurchaseOrderStatus.CLOSED) {
      throw new ConflictError('Cannot post a note for a closed or cancelled purchase order')
    }

    const warehouse = await tx.warehouse.findFirst({
      where: { code: po.warehouseCode },
      select: { id: true, code: true, name: true },
    })

    if (!warehouse) {
      throw new NotFoundError('Warehouse not found for GRN purchase order')
    }

    const transactionType = (() => {
      switch (po.type) {
        case PurchaseOrderType.PURCHASE:
          return TransactionType.RECEIVE
        case PurchaseOrderType.FULFILLMENT:
          return TransactionType.SHIP
        default:
          return TransactionType.ADJUST_IN
      }
    })()

    const isInbound =
      transactionType === TransactionType.RECEIVE || transactionType === TransactionType.ADJUST_IN
    const transactionDate = existingNote.receivedAt ?? new Date()

    for (const line of existingNote.lines) {
      if (!line.purchaseOrderLineId) {
        throw new ValidationError('GRN line missing purchase order line reference')
      }

      const poLine = po.lines.find(l => l.id === line.purchaseOrderLineId)
      if (!poLine) {
        throw new NotFoundError('Purchase order line not found')
      }

      if (poLine.status === PurchaseOrderLineStatus.CANCELLED) {
        throw new ConflictError('Cannot post against a cancelled line')
      }

      const newPostedQuantity = poLine.postedQuantity + line.quantity
      const lineStatus =
        newPostedQuantity >= poLine.quantity
          ? PurchaseOrderLineStatus.POSTED
          : PurchaseOrderLineStatus.PENDING

      await tx.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: {
          postedQuantity: newPostedQuantity,
          quantityReceived: newPostedQuantity,
          status: lineStatus,
        },
      })

      await tx.grnLine.update({
        where: { id: line.id },
        data: {
          varianceQuantity: newPostedQuantity - poLine.quantity,
        },
      })
    }

    const allLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: po.id },
    })

    const allPosted = allLines.every(line => line.status === PurchaseOrderLineStatus.POSTED)

    await tx.grn.update({
      where: { id },
      data: {
        status: GrnStatus.POSTED,
        updatedAt: new Date(),
      },
    })

    if (allPosted && !po.postedAt) {
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          postedAt: new Date(),
        },
      })
    }

    const created: Array<{
      id: string
      purchaseOrderId: string
      purchaseOrderLineId: string
      warehouseCode: string
      warehouseName: string
      skuCode: string
      skuDescription: string
      lotRef: string
      cartonsIn: number
      cartonsOut: number
      storagePalletsIn: number
      shippingPalletsOut: number
      cartonDimensionsCm: string | null
      transactionDate: Date
    }> = []

    for (const line of existingNote.lines) {
      if (!line.purchaseOrderLineId) {
        throw new ValidationError('GRN line missing purchase order line reference')
      }

      const poLine = po.lines.find(l => l.id === line.purchaseOrderLineId)
      if (!poLine) {
        throw new NotFoundError('Purchase order line not found')
      }

      const sku = await tx.sku.findFirst({ where: { skuCode: poLine.skuCode } })
      if (!sku) {
        throw new ValidationError(`SKU not found: ${poLine.skuCode}`)
      }

      const lotRef = poLine.lotRef
      if (!lotRef) {
        throw new ValidationError(`Lot reference missing for SKU ${poLine.skuCode}`)
      }

      if (line.lotRef && line.lotRef !== lotRef) {
        throw new ValidationError(`Lot ref mismatch for SKU ${poLine.skuCode}. Expected ${lotRef}.`)
      }

      const config = await tx.warehouseSkuStorageConfig.findFirst({
        where: { warehouseId: warehouse.id, skuId: sku.id },
        select: {
          storageCartonsPerPallet: true,
          shippingCartonsPerPallet: true,
        },
      })

      const unitsPerCarton = poLine.unitsPerCarton

      const storageCartonsPerPallet =
        line.storageCartonsPerPallet ??
        poLine.storageCartonsPerPallet ??
        config?.storageCartonsPerPallet ??
        null
      const shippingCartonsPerPallet =
        line.shippingCartonsPerPallet ??
        poLine.shippingCartonsPerPallet ??
        config?.shippingCartonsPerPallet ??
        null

      if (isInbound && (!storageCartonsPerPallet || storageCartonsPerPallet <= 0)) {
        throw new ValidationError(
          `Storage cartons per pallet is required for SKU ${poLine.skuCode}. Configure it in Config → Warehouses.`
        )
      }

      if (isInbound && (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0)) {
        throw new ValidationError(
          `Shipping cartons per pallet is required for SKU ${poLine.skuCode}. Configure it in Config → Warehouses.`
        )
      }

      if (!isInbound && (!shippingCartonsPerPallet || shippingCartonsPerPallet <= 0)) {
        throw new ValidationError(
          `Shipping cartons per pallet is required for SKU ${poLine.skuCode}. Configure it in Config → Warehouses.`
        )
      }

      const createdTx = await tx.inventoryTransaction.create({
        data: {
          warehouseCode: po.warehouseCode,
          warehouseName: po.warehouseName,
          warehouseAddress: null,
          skuCode: poLine.skuCode,
          skuDescription: poLine.skuDescription ?? sku.description,
          unitDimensionsCm: sku?.unitDimensionsCm ?? null,
          unitWeightKg: sku?.unitWeightKg ?? null,
          cartonDimensionsCm: poLine.cartonDimensionsCm ?? sku.cartonDimensionsCm,
          cartonWeightKg: poLine.cartonWeightKg ?? sku.cartonWeightKg,
          packagingType: poLine.packagingType ?? sku.packagingType,
          unitsPerCarton,
          lotRef,
          transactionType,
          referenceId: existingNote.referenceNumber ?? toPublicOrderNumber(po.orderNumber),
          cartonsIn: isInbound ? line.quantity : 0,
          cartonsOut: isInbound ? 0 : line.quantity,
          storagePalletsIn: isInbound
            ? Math.ceil(line.quantity / Math.max(1, storageCartonsPerPallet ?? unitsPerCarton))
            : 0,
          shippingPalletsOut: !isInbound
            ? Math.ceil(line.quantity / Math.max(1, shippingCartonsPerPallet ?? unitsPerCarton))
            : 0,
          storageCartonsPerPallet: isInbound ? (storageCartonsPerPallet ?? null) : null,
          shippingCartonsPerPallet: shippingCartonsPerPallet ?? null,
          transactionDate,
          pickupDate: transactionDate,
          shipName: !isInbound
            ? (existingNote.referenceNumber ?? po.counterpartyName ?? null)
            : null,
          trackingNumber: null,
          supplier: isInbound ? (po.counterpartyName ?? null) : null,
          attachments: (line.attachments as Prisma.JsonValue) ?? null,
          purchaseOrderId: po.id,
          purchaseOrderLineId: poLine.id,
          createdById: SYSTEM_FALLBACK_ID,
          createdByName: SYSTEM_FALLBACK_NAME,
          isReconciled: false,
          isDemo: false,
        },
        select: {
          id: true,
          purchaseOrderId: true,
          purchaseOrderLineId: true,
          warehouseCode: true,
          warehouseName: true,
          skuCode: true,
          skuDescription: true,
          lotRef: true,
          cartonsIn: true,
          cartonsOut: true,
          storagePalletsIn: true,
          shippingPalletsOut: true,
          cartonDimensionsCm: true,
          transactionDate: true,
        },
      })

      created.push({
        ...createdTx,
        cartonsIn: Number(createdTx.cartonsIn || 0),
        cartonsOut: Number(createdTx.cartonsOut || 0),
        storagePalletsIn: Number(createdTx.storagePalletsIn || 0),
        shippingPalletsOut: Number(createdTx.shippingPalletsOut || 0),
      })
    }

    createdTransactions = created.map(t => ({
      warehouseCode: t.warehouseCode,
      warehouseName: t.warehouseName,
      skuCode: t.skuCode,
      skuDescription: t.skuDescription,
      lotRef: t.lotRef,
      transactionDate: t.transactionDate,
    }))

    if (transactionType === TransactionType.RECEIVE || transactionType === TransactionType.SHIP) {
      const effectiveAt = transactionDate
      const rates = await tx.costRate.findMany({
        where: {
          warehouseId: warehouse.id,
          isActive: true,
          effectiveDate: { lte: effectiveAt },
          OR: [{ endDate: null }, { endDate: { gte: effectiveAt } }],
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

      let ledgerEntries: Prisma.CostLedgerCreateManyInput[] = []
      try {
        ledgerEntries = buildTacticalCostLedgerEntries({
          transactionType,
          receiveType: transactionType === TransactionType.RECEIVE ? po.receiveType : null,
          shipMode: transactionType === TransactionType.SHIP ? po.shipMode : null,
          ratesByCostName,
          lines: created.map(t => ({
            transactionId: t.id,
            skuCode: t.skuCode,
            cartons: transactionType === TransactionType.RECEIVE ? t.cartonsIn : t.cartonsOut,
            pallets:
              transactionType === TransactionType.SHIP ? t.shippingPalletsOut : t.storagePalletsIn,
            cartonDimensionsCm: t.cartonDimensionsCm,
          })),
          warehouseCode: warehouse.code,
          warehouseName: warehouse.name,
          createdAt: effectiveAt,
          createdByName: SYSTEM_FALLBACK_NAME,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Cost calculation failed'
        throw new ValidationError(message)
      }

      if (ledgerEntries.length > 0) {
        await tx.costLedger.createMany({ data: ledgerEntries })

        const transactionIds = created.map(row => row.id)
        const inserted = await tx.costLedger.findMany({
          where: { transactionId: { in: transactionIds } },
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

        const txById = new Map(created.map(row => [row.id, row]))
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
    }

    const updated = await tx.grn.findUnique({
      where: { id },
      include: {
        lines: true,
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            type: true,
            status: true,
            warehouseCode: true,
            warehouseName: true,
          },
        },
      },
    })
    if (!updated) {
      throw new NotFoundError('GRN not found after posting')
    }

    return formatGrnOrderNumber(updated)
  })

  await Promise.all(
    createdTransactions.map(t =>
      recordStorageCostEntry({
        warehouseCode: t.warehouseCode,
        warehouseName: t.warehouseName,
        skuCode: t.skuCode,
        skuDescription: t.skuDescription,
        lotRef: t.lotRef,
        transactionDate: t.transactionDate,
      }).catch(storageError => {
        const message = storageError instanceof Error ? storageError.message : 'Unknown error'
        console.error(
          `Storage cost recording failed for ${t.warehouseCode}/${t.skuCode}/${t.lotRef}:`,
          message
        )
      })
    )
  )

  return postedNote
}
