import { getTenantPrisma } from '@/lib/tenant/server'
import {
 FinancialLedgerCategory,
 FinancialLedgerSourceType,
 Prisma,
 TransactionType,
} from '@targon/prisma-talos'
import { addMonths, eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns'
import { randomUUID } from 'crypto'
import {
 calculateStorageCost,
 getStorageRate,
 type StorageRateResult,
 type StorageTier,
} from './storageRate.service'

interface RecordStorageCostParams {
 warehouseCode: string
 warehouseName: string
 skuCode: string
 skuDescription: string
 lotRef: string
 transactionDate: Date
}

type WeeklyTransactionMovement = {
 transactionType: TransactionType
 cartonsIn: number
 cartonsOut: number
 transactionDate: Date
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
 typeof value === 'object' && value !== null && !Array.isArray(value)

const asNumber = (value: unknown): number | null => {
 if (typeof value === 'number' && Number.isFinite(value)) return value
 if (typeof value === 'string' && value.trim() !== '') {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
 }
 return null
}

const asIsoDateString = (value: unknown): string | null => {
 if (typeof value !== 'string') return null
 const trimmed = value.trim()
 if (!trimmed) return null
 const parsed = new Date(trimmed)
 return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Record a storage cost entry for a specific lot in a given week
 * This function is called on every inventory transaction to ensure
 * storage costs are captured when inventory first appears in a week
 */
export async function recordStorageCostEntry({
 warehouseCode,
 warehouseName,
 skuCode,
 skuDescription,
 lotRef,
 transactionDate,
}: RecordStorageCostParams) {
 const prisma = await getTenantPrisma()
 const weekEndingDate = endOfWeek(transactionDate, { weekStartsOn: 1 })
 const weekStartingDate = startOfWeek(transactionDate, { weekStartsOn: 1 })

 const firstReceive = await prisma.inventoryTransaction.findFirst({
 where: {
 warehouseCode,
 skuCode,
 lotRef,
 transactionType: TransactionType.RECEIVE,
 storageCartonsPerPallet: { not: null },
 },
 orderBy: { transactionDate: 'asc' },
 select: { transactionDate: true, storageCartonsPerPallet: true },
 })

 const cartonsPerPallet =
 firstReceive?.storageCartonsPerPallet != null ? Number(firstReceive.storageCartonsPerPallet) : null

 const sixPlusStartDate = firstReceive?.transactionDate
 ? addMonths(firstReceive.transactionDate, 6)
 : null
 const sixPlusStartKey = sixPlusStartDate ? format(sixPlusStartDate, 'yyyy-MM-dd') : null

 // Calculate opening carton balance (inventory prior to the start of the week)
 const openingAggregate = await prisma.inventoryTransaction.aggregate({
 _sum: {
 cartonsIn: true,
 cartonsOut: true,
 },
 where: {
 warehouseCode,
 skuCode,
 lotRef,
 transactionDate: { lt: weekStartingDate },
 },
 })

 const openingBalance =
 Number(openingAggregate._sum.cartonsIn || 0) - Number(openingAggregate._sum.cartonsOut || 0)

 // Gather all transactions for the week to understand weekly movement
 const weeklyTransactions: WeeklyTransactionMovement[] = await prisma.inventoryTransaction.findMany({
 where: {
 warehouseCode,
 skuCode,
 lotRef,
 transactionDate: {
 gte: weekStartingDate,
 lte: weekEndingDate,
 },
 },
 select: {
 transactionType: true,
 cartonsIn: true,
 cartonsOut: true,
 transactionDate: true,
 },
 orderBy: { transactionDate: 'asc' },
 })

 let weeklyReceive = 0
 let weeklyShip = 0
 let weeklyAdjust = 0

 for (const movement of weeklyTransactions) {
 const inValue = Number(movement.cartonsIn || 0)
 const outValue = Number(movement.cartonsOut || 0)

 switch (movement.transactionType) {
 case TransactionType.RECEIVE:
 weeklyReceive += inValue
 break
 case TransactionType.SHIP:
 weeklyShip += outValue
 break
 case TransactionType.ADJUST_IN:
 weeklyAdjust += inValue
 break
 case TransactionType.ADJUST_OUT:
 weeklyAdjust -= outValue
 break
 default:
 weeklyAdjust += inValue - outValue
 break
 }
 }

 const closingBalance = openingBalance + weeklyReceive - weeklyShip + weeklyAdjust
 const normalizedClosingBalance = Math.max(0, closingBalance)

 const dailyNetCartons = new Map<string, number>()
 for (const movement of weeklyTransactions) {
 const dayKey = format(new Date(movement.transactionDate), 'yyyy-MM-dd')
 const net = Number(movement.cartonsIn || 0) - Number(movement.cartonsOut || 0)
 dailyNetCartons.set(dayKey, (dailyNetCartons.get(dayKey) ?? 0) + net)
 }

 const daysInWeek = eachDayOfInterval({ start: weekStartingDate, end: weekEndingDate })
 const dailyRows: Array<{
 date: string
 tier: StorageTier
 netCartons: number
 closingCartons: number
 closingPallets: number | null
 }> = []

 let runningCartons = Math.max(0, openingBalance)
 let totalClosingCartons = 0
 let palletDays = 0
 let palletDaysStandard = 0
 let palletDaysSixPlus = 0
 let closingPallets = 0

 for (const day of daysInWeek) {
 const dayKey = format(day, 'yyyy-MM-dd')
 const dayTier: StorageTier =
 sixPlusStartKey && dayKey >= sixPlusStartKey ? 'SIX_PLUS' : 'STANDARD'
 const netCartons = dailyNetCartons.get(dayKey) ?? 0

 runningCartons = Math.max(0, runningCartons + netCartons)
 totalClosingCartons += runningCartons

 let dayClosingPallets: number | null = null
 if (cartonsPerPallet && cartonsPerPallet > 0) {
 dayClosingPallets = runningCartons === 0 ? 0 : Math.ceil(runningCartons / cartonsPerPallet)
 palletDays += dayClosingPallets
 if (dayTier === 'SIX_PLUS') {
 palletDaysSixPlus += dayClosingPallets
 } else {
 palletDaysStandard += dayClosingPallets
 }
 closingPallets = dayClosingPallets
 }

 dailyRows.push({
 date: dayKey,
 tier: dayTier,
 netCartons,
 closingCartons: runningCartons,
 closingPallets: dayClosingPallets,
 })
 }

 const averageBalance =
 daysInWeek.length > 0 ? Number((totalClosingCartons / daysInWeek.length).toFixed(2)) : 0

 const hasMovement =
 openingBalance !== 0 || weeklyReceive !== 0 || weeklyShip !== 0 || weeklyAdjust !== 0

 if (!hasMovement) {
 return null
 }

 const existing = await prisma.storageLedger.findUnique({
 where: {
 warehouseCode_skuCode_lotRef_weekEndingDate: {
 warehouseCode,
 skuCode,
 lotRef,
 weekEndingDate,
 },
 },
 })

 let storageRateStandard: StorageRateResult | null = null
 let storageRateSixPlus: StorageRateResult | null = null
 let ratePerPalletDay: number | null = null
 let rateEffectiveDate: Date | null = null
 let costRateId: string | null = null
 let isCostCalculated = false
 let totalCost: number | null = null
 let rateStandardPerPalletDay: number | null = null
 let rateSixPlusPerPalletDay: number | null = null
 let rateStandardEffectiveDate: string | null = null
 let rateSixPlusEffectiveDate: string | null = null

 if (cartonsPerPallet && cartonsPerPallet > 0) {
 try {
   if (existing?.isCostCalculated) {
    const existingRate = existing.storageRatePerPalletDay != null ? Number(existing.storageRatePerPalletDay) : null
    const existingTotal = existing.totalStorageCost != null ? Number(existing.totalStorageCost) : null
    const snapshot = isRecord(existing.dailyBalanceData) ? existing.dailyBalanceData : null
    const snapshotStandardRate = snapshot ? asNumber(snapshot['rateStandardPerPalletDay']) : null
    const snapshotSixPlusRate = snapshot ? asNumber(snapshot['rateSixPlusPerPalletDay']) : null
    const snapshotStandardEffective = snapshot ? asIsoDateString(snapshot['rateStandardEffectiveDate']) : null
    const snapshotSixPlusEffective = snapshot ? asIsoDateString(snapshot['rateSixPlusEffectiveDate']) : null

    rateStandardPerPalletDay = snapshotStandardRate ?? existingRate
    rateSixPlusPerPalletDay = snapshotSixPlusRate ?? rateStandardPerPalletDay
    rateStandardEffectiveDate =
     snapshotStandardEffective ?? (existing.rateEffectiveDate ? existing.rateEffectiveDate.toISOString() : null)
    rateSixPlusEffectiveDate = snapshotSixPlusEffective

    const canComputeStandard = palletDaysStandard === 0 || rateStandardPerPalletDay != null
    const canComputeSixPlus = palletDaysSixPlus === 0 || rateSixPlusPerPalletDay != null

    if (canComputeStandard && canComputeSixPlus && (palletDaysStandard + palletDaysSixPlus > 0)) {
     const standardCost = await calculateStorageCost(palletDaysStandard, rateStandardPerPalletDay ?? 0)
     const sixPlusCost = await calculateStorageCost(palletDaysSixPlus, rateSixPlusPerPalletDay ?? 0)
     totalCost = Number((standardCost + sixPlusCost).toFixed(2))
     isCostCalculated = true
    } else {
     totalCost = existingTotal
     isCostCalculated = true
    }

    costRateId = existing.costRateId ?? null
    rateEffectiveDate = existing.rateEffectiveDate ?? null

    if (palletDays > 0 && totalCost != null) {
     if (palletDaysSixPlus === 0 && rateStandardPerPalletDay != null) {
      ratePerPalletDay = rateStandardPerPalletDay
     } else if (palletDaysStandard === 0 && rateSixPlusPerPalletDay != null) {
      ratePerPalletDay = rateSixPlusPerPalletDay
     } else {
      ratePerPalletDay = Number((totalCost / palletDays).toFixed(4))
     }
    } else {
     ratePerPalletDay = existingRate
    }
   } else {
    storageRateStandard = await getStorageRate(warehouseCode, weekEndingDate, 'STANDARD')
    if (storageRateStandard) {
     const standardCost = await calculateStorageCost(palletDaysStandard, storageRateStandard.ratePerPalletDay)

     let sixPlusCost = 0
     if (palletDaysSixPlus > 0) {
      storageRateSixPlus = await getStorageRate(warehouseCode, weekEndingDate, 'SIX_PLUS')
      if (!storageRateSixPlus) {
       throw new Error('Missing storage rate for 6+ month tier')
      }
      sixPlusCost = await calculateStorageCost(palletDaysSixPlus, storageRateSixPlus.ratePerPalletDay)
     }

     totalCost = Number((standardCost + sixPlusCost).toFixed(2))
     isCostCalculated = true

     rateStandardPerPalletDay = storageRateStandard.ratePerPalletDay
     rateStandardEffectiveDate = storageRateStandard.effectiveDate.toISOString()

     if (storageRateSixPlus) {
      rateSixPlusPerPalletDay = storageRateSixPlus.ratePerPalletDay
      rateSixPlusEffectiveDate = storageRateSixPlus.effectiveDate.toISOString()
     }

     if (palletDaysSixPlus === 0) {
      ratePerPalletDay = storageRateStandard.ratePerPalletDay
      rateEffectiveDate = storageRateStandard.effectiveDate
      costRateId = storageRateStandard.costRateId ?? null
     } else if (palletDaysStandard === 0 && storageRateSixPlus) {
      ratePerPalletDay = storageRateSixPlus.ratePerPalletDay
      rateEffectiveDate = storageRateSixPlus.effectiveDate
      costRateId = storageRateSixPlus.costRateId ?? null
     } else if (palletDays > 0) {
      // Mixed-tier week: store a blended rate and keep the detailed split in dailyBalanceData.
      ratePerPalletDay = Number((totalCost / palletDays).toFixed(4))
      rateEffectiveDate = null
      costRateId = null
     } else {
      ratePerPalletDay = storageRateStandard.ratePerPalletDay
      rateEffectiveDate = storageRateStandard.effectiveDate
      costRateId = storageRateStandard.costRateId ?? null
     }
    }
   }
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error'
 console.warn(`Storage rate lookup failed for ${warehouseCode}:`, message)
 isCostCalculated = false
 }
 }

 const dailyBalanceData = {
  methodology: 'tactical_storage_pallet_day_v2',
  cartonsPerPallet,
  sixPlusStartDate: sixPlusStartDate ? sixPlusStartDate.toISOString() : null,
  palletDaysStandard,
  palletDaysSixPlus,
  rateStandardPerPalletDay: rateStandardPerPalletDay ?? null,
  rateSixPlusPerPalletDay: rateSixPlusPerPalletDay ?? null,
  rateStandardEffectiveDate: rateStandardEffectiveDate ?? null,
  rateSixPlusEffectiveDate: rateSixPlusEffectiveDate ?? null,
  days: dailyRows,
 }

 if (existing) {
 const updated = await prisma.storageLedger.update({
  where: { id: existing.id },
  data: {
   warehouseName,
   skuDescription,
   openingBalance,
   weeklyReceive,
   weeklyShip,
   weeklyAdjust,
   closingBalance: normalizedClosingBalance,
   averageBalance,
   dailyBalanceData,
   closingPallets,
   palletDays,
   storageRatePerPalletDay: ratePerPalletDay,
   totalStorageCost: totalCost,
   rateEffectiveDate,
   costRateId,
   isCostCalculated,
  },
 })

 await upsertFinancialLedgerEntryForStorage(prisma, updated)
 return updated
 }

 const created = await prisma.storageLedger.create({
  data: {
   storageLedgerId: randomUUID(),
   warehouseCode,
   warehouseName,
   skuCode,
   skuDescription,
   lotRef,
   weekEndingDate,
   openingBalance,
   weeklyReceive,
   weeklyShip,
   weeklyAdjust,
   closingBalance: normalizedClosingBalance,
   averageBalance,
   dailyBalanceData,
   closingPallets,
   palletDays,
   storageRatePerPalletDay: ratePerPalletDay,
   totalStorageCost: totalCost,
   rateEffectiveDate,
   costRateId,
   isCostCalculated,
   createdByName: 'System',
  },
 })

 await upsertFinancialLedgerEntryForStorage(prisma, created)
 return created
}

async function upsertFinancialLedgerEntryForStorage(
 prisma: Prisma.TransactionClient,
 entry: {
  id: string
  storageLedgerId: string
  warehouseCode: string
  warehouseName: string
  skuCode: string
  skuDescription: string
  lotRef: string
  weekEndingDate: Date
  palletDays: number
  storageRatePerPalletDay: unknown
  totalStorageCost: unknown
  isCostCalculated: boolean
  createdAt: Date
  createdByName: string
 }
) {
 const total = entry.totalStorageCost != null ? Number(entry.totalStorageCost) : null
 if (!entry.isCostCalculated || total === null || !Number.isFinite(total)) {
  await prisma.financialLedgerEntry.deleteMany({
   where: {
    sourceType: FinancialLedgerSourceType.STORAGE_LEDGER,
    sourceId: entry.storageLedgerId,
   },
  })
  return
 }

 const unitRateRaw = entry.storageRatePerPalletDay != null ? Number(entry.storageRatePerPalletDay) : null
 const unitRate = unitRateRaw !== null && Number.isFinite(unitRateRaw) ? unitRateRaw : null

 await prisma.financialLedgerEntry.upsert({
  where: {
   sourceType_sourceId: {
    sourceType: FinancialLedgerSourceType.STORAGE_LEDGER,
    sourceId: entry.storageLedgerId,
   },
  },
  create: {
   id: entry.id,
   sourceType: FinancialLedgerSourceType.STORAGE_LEDGER,
   sourceId: entry.storageLedgerId,
   category: FinancialLedgerCategory.Storage,
   costName: 'Storage',
   quantity: new Prisma.Decimal(entry.palletDays.toString()),
   unitRate: unitRate !== null ? new Prisma.Decimal(unitRate.toFixed(4)) : null,
   amount: new Prisma.Decimal(total.toFixed(2)),
   warehouseCode: entry.warehouseCode,
   warehouseName: entry.warehouseName,
   skuCode: entry.skuCode,
   skuDescription: entry.skuDescription,
   lotRef: entry.lotRef,
   storageLedgerId: entry.id,
   effectiveAt: entry.weekEndingDate,
   createdAt: entry.createdAt,
   createdByName: entry.createdByName,
  },
  update: {
   category: FinancialLedgerCategory.Storage,
   costName: 'Storage',
   quantity: new Prisma.Decimal(entry.palletDays.toString()),
   unitRate: unitRate !== null ? new Prisma.Decimal(unitRate.toFixed(4)) : null,
   amount: new Prisma.Decimal(total.toFixed(2)),
   warehouseCode: entry.warehouseCode,
   warehouseName: entry.warehouseName,
   skuCode: entry.skuCode,
   skuDescription: entry.skuDescription,
   lotRef: entry.lotRef,
   storageLedgerId: entry.id,
   effectiveAt: entry.weekEndingDate,
   createdByName: entry.createdByName,
  },
 })
}

/**
 * Ensure all lots with positive inventory have storage ledger entries for a given week
 * This is run as a weekly scheduled process to catch any missed entries
 */
export async function ensureWeeklyStorageEntries(date: Date = new Date()) {
 const prisma = await getTenantPrisma()
 const weekEndingDate = endOfWeek(date, { weekStartsOn: 1 })

 // Get all lots with positive inventory balances
 const aggregates = await prisma.inventoryTransaction.groupBy({
  by: ['warehouseCode', 'warehouseName', 'skuCode', 'skuDescription', 'lotRef'],
  _sum: { cartonsIn: true, cartonsOut: true },
  where: {
  transactionDate: { lte: date },
  },
  })

 let processed = 0
 let costCalculated = 0
 let skipped = 0
 const errors: string[] = []

 for (const agg of aggregates) {
 try {
 const netCartons = Number(agg._sum.cartonsIn ?? 0) - Number(agg._sum.cartonsOut ?? 0)
 if (netCartons <= 0) {
  skipped++
  continue
 }

 // Check if entry already exists
 const exists = await prisma.storageLedger.findUnique({
 where: {
 warehouseCode_skuCode_lotRef_weekEndingDate: {
 warehouseCode: agg.warehouseCode,
 skuCode: agg.skuCode,
 lotRef: agg.lotRef,
 weekEndingDate
 }
 }
 })

 if (!exists) {
 const result = await recordStorageCostEntry({
 warehouseCode: agg.warehouseCode,
 warehouseName: agg.warehouseName,
 skuCode: agg.skuCode,
 skuDescription: agg.skuDescription,
 lotRef: agg.lotRef,
 transactionDate: date,
 })

 if (result) {
 processed++
 if (result.isCostCalculated) {
 costCalculated++
 }
 } else {
 skipped++
 }
 }
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error'
 const errorMsg = `${agg.warehouseCode}/${agg.skuCode}/${agg.lotRef}: ${message}`
 errors.push(errorMsg)
 console.error('Storage entry creation failed:', errorMsg)
 }
 }

 return { 
 processed, 
 costCalculated, 
 skipped, 
 errors,
 weekEndingDate: weekEndingDate.toISOString()
 }
}

/**
 * Recalculate storage costs for existing entries that don't have costs
 * This can be run after storage rates are updated
 */
export async function recalculateStorageCosts(
 weekEndingDate?: Date,
 warehouseCode?: string
): Promise<{
 recalculated: number
 errors: string[]
}> {
 const prisma = await getTenantPrisma()
 const where: Prisma.StorageLedgerWhereInput = {
 isCostCalculated: false,
 }
 
 if (weekEndingDate) {
 where.weekEndingDate = weekEndingDate
 }
 
 if (warehouseCode) {
 where.warehouseCode = warehouseCode
 }

 // Get all entries without costs
 const entriesWithoutCosts = await prisma.storageLedger.findMany({
 where,
 select: {
 id: true,
 warehouseCode: true,
 warehouseName: true,
 skuCode: true,
 skuDescription: true,
 lotRef: true,
 weekEndingDate: true
 }
 })

 let recalculated = 0
 const errors: string[] = []

 for (const entry of entriesWithoutCosts) {
 try {
 const result = await recordStorageCostEntry({
 warehouseCode: entry.warehouseCode,
 warehouseName: entry.warehouseName,
 skuCode: entry.skuCode,
 skuDescription: entry.skuDescription,
 lotRef: entry.lotRef,
 transactionDate: entry.weekEndingDate,
 })

 if (result?.isCostCalculated) {
 recalculated++
 }
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error'
 errors.push(`Entry ${entry.id}: ${message}`)
 }
 }

 return { recalculated, errors }
}

/**
 * Get storage cost summary for a date range
 */
export async function getStorageCostSummary(
 startDate: Date,
 endDate: Date,
 warehouseCode?: string
) {
 const prisma = await getTenantPrisma()
 const where: Prisma.StorageLedgerWhereInput = {
 weekEndingDate: {
 gte: startDate,
 lte: endDate
 }
 }
 
 if (warehouseCode) {
 where.warehouseCode = warehouseCode
 }

 const summary = await prisma.storageLedger.aggregate({
 _count: {
 id: true,
 totalStorageCost: true
 },
 _sum: {
 palletDays: true,
 totalStorageCost: true
 },
 where
 })

 return {
 totalEntries: summary._count.id || 0,
 entriesWithCosts: summary._count.totalStorageCost || 0,
 totalPalletDays: Number(summary._sum.palletDays || 0),
 totalStorageCost: Number(summary._sum.totalStorageCost || 0),
 costCalculationRate: summary._count.id > 0 
 ? ((summary._count.totalStorageCost || 0) / summary._count.id * 100).toFixed(1)
 : '0'
 }
}
