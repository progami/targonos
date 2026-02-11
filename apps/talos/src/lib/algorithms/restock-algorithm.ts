// Restock Algorithm for FBA Shipment Planning
// Calculates optimal restock points, quantities, and urgency levels

export interface RestockCalculationInput {
 currentStock: number
 dailySalesVelocity: number
 leadTimeDays: number
 safetyStockDays: number
 unitsPerCarton: number
 cartonsPerPallet?: number
 minimumOrderQuantity?: number
 maximumOrderQuantity?: number
 targetStockDays?: number
}

export interface RestockCalculationResult {
 restockPoint: number
 optimalOrderQuantity: number
 suggestedCartons: number
 suggestedPallets: number
 daysOfStockRemaining: number
 urgencyLevel: 'critical' | 'high' | 'medium' | 'low'
 urgencyScore: number // 0-100, higher is more urgent
 recommendation: string
}

export interface RestockThresholds {
 critical: number // Days of stock
 high: number
 medium: number
 leadTimeBuffer: number // Multiplier for lead time (e.g., 1.5x)
}

const DEFAULT_THRESHOLDS: RestockThresholds = {
 critical: 7,
 high: 14,
 medium: 21,
 leadTimeBuffer: 1.5
}

const DEFAULT_CARTONS_PER_PALLET = 48
const DEFAULT_TARGET_STOCK_DAYS = 30

/**
 * Calculates restock point based on sales velocity, lead time, and safety stock
 * Formula: Restock Point = (Daily Sales Velocity × Lead Time) + Safety Stock
 */
export function calculateRestockPoint(
 dailySalesVelocity: number,
 leadTimeDays: number,
 safetyStockDays: number
): number {
 const leadTimeConsumption = dailySalesVelocity * leadTimeDays
 const safetyStock = dailySalesVelocity * safetyStockDays
 return Math.ceil(leadTimeConsumption + safetyStock)
}

/**
 * Calculates optimal order quantity considering various constraints
 */
export function calculateOptimalOrderQuantity(
 input: RestockCalculationInput
): number {
 const {
 currentStock,
 dailySalesVelocity,
 targetStockDays = DEFAULT_TARGET_STOCK_DAYS,
 minimumOrderQuantity = 0,
 maximumOrderQuantity = Infinity
 } = input

 // Calculate target stock level
 const targetStock = dailySalesVelocity * targetStockDays
 
 // Calculate basic order quantity needed to reach target
 const basicOrderQuantity = Math.max(0, targetStock - currentStock)
 
 // Apply constraints
 let optimalQuantity = basicOrderQuantity
 
 // Apply minimum order quantity
 if (optimalQuantity > 0 && optimalQuantity < minimumOrderQuantity) {
 optimalQuantity = minimumOrderQuantity
 }
 
 // Apply maximum order quantity
 if (optimalQuantity > maximumOrderQuantity) {
 optimalQuantity = maximumOrderQuantity
 }
 
 return Math.ceil(optimalQuantity)
}

/**
 * Determines urgency level based on days of stock remaining and lead time
 */
export function calculateUrgencyLevel(
 daysOfStock: number,
 leadTimeDays: number,
 thresholds: RestockThresholds = DEFAULT_THRESHOLDS
): { level: 'critical' | 'high' | 'medium' | 'low', score: number } {
 // Calculate effective lead time with buffer
 const effectiveLeadTime = leadTimeDays * thresholds.leadTimeBuffer
 
 // Calculate urgency score (0-100)
 let score: number
 
 if (daysOfStock <= thresholds.critical) {
 // Critical: Stock will run out before replenishment arrives
 score = 100 - (daysOfStock / thresholds.critical) * 10
 return { level: 'critical', score: Math.max(90, Math.min(100, score)) }
 } else if (daysOfStock <= effectiveLeadTime) {
 // High: Stock might run out if there are delays
 score = 80 - ((daysOfStock - thresholds.critical) / (effectiveLeadTime - thresholds.critical)) * 20
 return { level: 'high', score: Math.max(60, Math.min(89, score)) }
 } else if (daysOfStock <= thresholds.high) {
 // High: Approaching restock point
 score = 60 - ((daysOfStock - effectiveLeadTime) / (thresholds.high - effectiveLeadTime)) * 10
 return { level: 'high', score: Math.max(50, Math.min(59, score)) }
 } else if (daysOfStock <= thresholds.medium) {
 // Medium: Time to plan shipment
 score = 40 - ((daysOfStock - thresholds.high) / (thresholds.medium - thresholds.high)) * 20
 return { level: 'medium', score: Math.max(20, Math.min(49, score)) }
 } else {
 // Low: Sufficient stock
 score = Math.max(0, 20 - (daysOfStock - thresholds.medium) / 2)
 return { level: 'low', score: Math.min(19, score) }
 }
}

/**
 * Generates a human-readable recommendation based on urgency
 */
export function generateRecommendation(
 urgencyLevel: 'critical' | 'high' | 'medium' | 'low',
 daysOfStock: number,
 leadTimeDays: number
): string {
 switch (urgencyLevel) {
 case 'critical':
 if (daysOfStock < leadTimeDays) {
 return `URGENT: Stock will run out in ${daysOfStock} days, before replenishment arrives (${leadTimeDays} days lead time). Ship immediately!`
 }
 return `CRITICAL: Only ${daysOfStock} days of stock remaining. Immediate shipment required.`
 
 case 'high':
 return `HIGH PRIORITY: ${daysOfStock} days of stock remaining. Schedule shipment within 2-3 days.`
 
 case 'medium':
 return `Plan shipment soon. ${daysOfStock} days of stock remaining.`
 
 case 'low':
 return `Stock levels healthy with ${daysOfStock} days remaining.`
 }
}

/**
 * Main function to calculate all restock metrics
 */
export function calculateRestockMetrics(
 input: RestockCalculationInput,
 thresholds?: RestockThresholds
): RestockCalculationResult {
 const {
 currentStock,
 dailySalesVelocity,
 leadTimeDays,
 safetyStockDays,
 unitsPerCarton,
 cartonsPerPallet = DEFAULT_CARTONS_PER_PALLET
 } = input

 // Calculate days of stock remaining
 const daysOfStockRemaining = dailySalesVelocity > 0 
 ? Math.floor(currentStock / dailySalesVelocity)
 : Infinity

 // Calculate restock point
 const restockPoint = calculateRestockPoint(
 dailySalesVelocity,
 leadTimeDays,
 safetyStockDays
 )

 // Calculate optimal order quantity
 const optimalOrderQuantity = calculateOptimalOrderQuantity(input)

 // Calculate cartons and pallets
 const suggestedCartons = Math.ceil(optimalOrderQuantity / unitsPerCarton)
 const suggestedPallets = Math.ceil(suggestedCartons / cartonsPerPallet)

 // Calculate urgency
 const { level: urgencyLevel, score: urgencyScore } = calculateUrgencyLevel(
 daysOfStockRemaining,
 leadTimeDays,
 thresholds
 )

 // Generate recommendation
 const recommendation = generateRecommendation(
 urgencyLevel,
 daysOfStockRemaining,
 leadTimeDays
 )

 return {
 restockPoint,
 optimalOrderQuantity,
 suggestedCartons,
 suggestedPallets,
 daysOfStockRemaining,
 urgencyLevel,
 urgencyScore,
 recommendation
 }
}

/**
 * Calculates optimal shipment quantity to maximize shipping efficiency
 * Rounds up to full pallets when close to pallet quantities
 */
export function optimizeShipmentQuantity(
 suggestedCartons: number,
 cartonsPerPallet: number = DEFAULT_CARTONS_PER_PALLET,
 palletOptimizationThreshold: number = 0.7 // If >= 70% of a pallet, round up
): { optimizedCartons: number, pallets: number, efficiency: number } {
 const exactPallets = suggestedCartons / cartonsPerPallet
 const fullPallets = Math.floor(exactPallets)
 const partialPallet = exactPallets - fullPallets
 
 let optimizedPallets: number
 
 if (partialPallet >= palletOptimizationThreshold) {
 // Round up to next full pallet
 optimizedPallets = fullPallets + 1
 } else if (partialPallet > 0 && fullPallets === 0) {
 // Always ship at least 1 pallet if any quantity is needed
 optimizedPallets = 1
 } else {
 // Keep as is
 optimizedPallets = exactPallets
 }
 
 const optimizedCartons = Math.ceil(optimizedPallets * cartonsPerPallet)
 const efficiency = (suggestedCartons / optimizedCartons) * 100
 
 return {
 optimizedCartons,
 pallets: Math.ceil(optimizedPallets),
 efficiency
 }
}

/**
 * Bulk optimization for multiple SKUs shipping together
 */
export interface BulkOptimizationInput {
 skuCode: string
 suggestedCartons: number
 urgencyScore: number
 cartonsPerPallet?: number
}

export interface BulkOptimizationResult {
 totalPallets: number
 totalCartons: number
 skuAllocations: Array<{
 skuCode: string
 allocatedCartons: number
 allocatedPallets: number
 }>
 efficiency: number
}

export function optimizeBulkShipment(
 items: BulkOptimizationInput[],
 maxPallets?: number
): BulkOptimizationResult {
 // Sort by urgency score (highest first)
 const sortedItems = [...items].sort((a, b) => b.urgencyScore - a.urgencyScore)
 
 const allocations: BulkOptimizationResult['skuAllocations'] = []
 let totalCartons = 0
 let totalPallets = 0
 
 for (const item of sortedItems) {
 const cartonsPerPallet = item.cartonsPerPallet || DEFAULT_CARTONS_PER_PALLET
 const { optimizedCartons, pallets } = optimizeShipmentQuantity(
 item.suggestedCartons,
 cartonsPerPallet
 )
 
 // Check if adding this would exceed max pallets
 if (maxPallets && totalPallets + pallets > maxPallets) {
 // Skip this item or allocate partial
 continue
 }
 
 allocations.push({
 skuCode: item.skuCode,
 allocatedCartons: optimizedCartons,
 allocatedPallets: pallets
 })
 
 totalCartons += optimizedCartons
 totalPallets += pallets
 }
 
 // Calculate overall efficiency
 const requestedCartons = items.reduce((sum, item) => sum + item.suggestedCartons, 0)
 const efficiency = (requestedCartons / totalCartons) * 100
 
 return {
 totalPallets,
 totalCartons,
 skuAllocations: allocations,
 efficiency
 }
}
