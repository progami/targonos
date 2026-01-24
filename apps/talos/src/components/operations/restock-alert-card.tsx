import React from 'react'
import { 
 AlertCircle, Package, TrendingUp, Clock, 
 ArrowRight, Calculator
} from '@/lib/lucide-icons'
import { Tooltip } from '@/components/ui/tooltip'

interface RestockAlertCardProps {
 skuCode: string
 description: string
 currentStock: number
 dailySalesVelocity: number
 daysOfStock: number
 restockPoint: number
 suggestedQuantity: number
 suggestedCartons: number
 suggestedPallets: number
 urgencyLevel: 'critical' | 'high' | 'medium' | 'low'
 urgencyScore: number
 recommendation: string
 leadTimeDays: number
 safetyStockDays: number
 onSelect?: (selected: boolean) => void
 isSelected?: boolean
}

export function RestockAlertCard({
 skuCode,
 description,
 currentStock,
 dailySalesVelocity,
 daysOfStock,
 restockPoint,
 suggestedQuantity,
 suggestedCartons,
 suggestedPallets,
 urgencyLevel,
 urgencyScore,
 recommendation,
 leadTimeDays,
 safetyStockDays,
 onSelect,
 isSelected = false
}: RestockAlertCardProps) {
 const urgencyColors = {
 critical: {
 bg: 'bg-red-50 border-red-200',
 text: 'text-red-800',
 icon: 'text-red-600',
 badge: 'bg-red-100 text-red-800 border-red-200',
 progressBg: 'bg-red-200',
 progressFill: 'bg-red-600'
 },
 high: {
 bg: 'bg-orange-50 border-orange-200',
 text: 'text-orange-800',
 icon: 'text-orange-600',
 badge: 'bg-orange-100 text-orange-800 border-orange-200',
 progressBg: 'bg-orange-200',
 progressFill: 'bg-orange-600'
 },
 medium: {
 bg: 'bg-yellow-50 border-yellow-200',
 text: 'text-yellow-800',
 icon: 'text-yellow-600',
 badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
 progressBg: 'bg-yellow-200',
 progressFill: 'bg-yellow-600'
 },
 low: {
 bg: 'bg-green-50 border-green-200',
 text: 'text-green-800',
 icon: 'text-green-600',
 badge: 'bg-green-100 text-green-800 border-green-200',
 progressBg: 'bg-green-200',
 progressFill: 'bg-green-600'
 }
 }

 const colors = urgencyColors[urgencyLevel]

 return (
 <div className={`border rounded-lg p-4 ${colors.bg} ${isSelected ? 'ring-2 ring-primary' : ''}`}>
 <div className="flex items-start justify-between mb-3">
 <div className="flex items-start gap-3">
 <AlertCircle className={`h-5 w-5 mt-0.5 ${colors.icon}`} />
 <div>
 <div className="flex items-center gap-2">
 <h3 className="font-semibold text-foreground">{skuCode}</h3>
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors.badge}`}>
 {urgencyLevel.toUpperCase()}
 </span>
 </div>
 <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
 </div>
 </div>
 {onSelect && (
 <input
 type="checkbox"
 checked={isSelected}
 onChange={(e) => onSelect(e.target.checked)}
 aria-label={`Select ${skuCode} for batch operation`}
 className="rounded border-slate-300 text-primary focus:ring-primary"
 />
 )}
 </div>

 {/* Urgency Score Progress Bar */}
 <div className="mb-3">
 <div className="flex items-center justify-between text-xs mb-1">
 <span className="text-muted-foreground">Urgency Score</span>
 <span className={`font-medium ${colors.text}`}>{urgencyScore}/100</span>
 </div>
 <div className={`w-full h-2 rounded-full ${colors.progressBg}`}>
 <div 
 className={`h-full rounded-full transition-all ${colors.progressFill}`}
 style={{ width: `${urgencyScore}%` }}
 />
 </div>
 </div>

 {/* Stock Metrics */}
 <div className="grid grid-cols-2 gap-3 mb-3">
 <div className="bg-white dark:bg-slate-800 rounded p-2">
<div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
  <Package className="h-3 w-3" />
  <span>Current FBA Stock</span>
  </div>
  <p className="text-lg font-semibold text-foreground">{currentStock.toLocaleString()}</p>
 <p className={`text-xs ${colors.text}`}>{daysOfStock} days remaining</p>
 </div>
 
 <div className="bg-white dark:bg-slate-800 rounded p-2">
<div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
  <TrendingUp className="h-3 w-3" />
  <span>Daily Velocity</span>
  </div>
  <p className="text-lg font-semibold text-foreground">{dailySalesVelocity}</p>
  <p className="text-xs text-muted-foreground">units/day</p>
 </div>
 </div>

 {/* Restock Recommendation */}
 <div className={`rounded p-2 mb-3 ${colors.bg} border ${colors.badge.split(' ')[0]}`}>
 <p className={`text-sm ${colors.text}`}>{recommendation}</p>
 </div>

 {/* Suggested Shipment */}
 <div className="bg-white dark:bg-slate-800 rounded p-3 mb-3">
 <div className="flex items-center justify-between mb-2">
 <h4 className="text-sm font-medium text-foreground">Suggested Shipment</h4>
 <Tooltip 
 content={`Calculation: Restock Point = (Daily Velocity × Lead Time) + Safety Stock = (${dailySalesVelocity} × ${leadTimeDays}) + (${dailySalesVelocity} × ${safetyStockDays}) = ${restockPoint} units. Lead Time: ${leadTimeDays} days, Safety Stock: ${safetyStockDays} days`}
 position="left"
 icon="info"
 />
 </div>
 
 <div className="grid grid-cols-3 gap-2 text-center">
<div>
  <p className="text-2xl font-bold text-foreground">{suggestedQuantity}</p>
  <p className="text-xs text-muted-foreground">units</p>
  </div>
  <div>
  <p className="text-2xl font-bold text-foreground">{suggestedCartons}</p>
  <p className="text-xs text-muted-foreground">cartons</p>
  </div>
  <div>
  <p className="text-2xl font-bold text-foreground">{suggestedPallets}</p>
  <p className="text-xs text-muted-foreground">pallet{suggestedPallets !== 1 ? 's' : ''}</p>
  </div>
 </div>
 </div>

 {/* Action Buttons */}
 <div className="flex items-center justify-between">
<div className="flex items-center gap-2 text-xs text-muted-foreground">
  <Clock className="h-3 w-3" />
  <span>Lead time: {leadTimeDays} days</span>
  </div>
 
 <button className={`inline-flex items-center gap-1 text-sm font-medium ${colors.text} hover:underline`}>
 <Calculator className="h-4 w-4" />
 View Details
 <ArrowRight className="h-3 w-3" />
 </button>
 </div>
 </div>
 )
}

// Simplified version for list view
interface RestockAlertRowProps {
 skuCode: string
 description: string
 currentStock: number
 daysOfStock: number
 suggestedCartons: number
 urgencyLevel: 'critical' | 'high' | 'medium' | 'low'
 recommendation: string
 onSelect?: (selected: boolean) => void
 isSelected?: boolean
}

export function RestockAlertRow({
 skuCode,
 description,
 currentStock,
 daysOfStock,
 suggestedCartons,
 urgencyLevel,
 recommendation,
 onSelect,
 isSelected = false
}: RestockAlertRowProps) {
 const urgencyColors = {
 critical: 'bg-red-100 text-red-800 border-red-200',
 high: 'bg-orange-100 text-orange-800 border-orange-200',
 medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
 low: 'bg-green-100 text-green-800 border-green-200'
 }

 const stockColors = {
 critical: 'text-red-600',
 high: 'text-orange-600',
 medium: 'text-yellow-600',
 low: 'text-green-600'
 }

 return (
 <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800 ${isSelected ? 'bg-cyan-50 dark:bg-cyan-900/30' : ''}`}>
 {onSelect && (
 <td className="px-6 py-4 whitespace-nowrap">
 <input
 type="checkbox"
 checked={isSelected}
 onChange={(e) => onSelect(e.target.checked)}
 aria-label={`Select ${skuCode} row`}
 className="rounded border-slate-300 text-primary focus:ring-primary"
 />
 </td>
 )}
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="flex items-center gap-2">
 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${urgencyColors[urgencyLevel]}`}>
 {urgencyLevel.toUpperCase()}
 </span>
 </div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <div>
<div className="text-sm font-medium text-foreground">{skuCode}</div>
  <div className="text-sm text-muted-foreground">{description}</div>
 </div>
 </td>
<td className="px-6 py-4 whitespace-nowrap text-sm text-foreground text-right">
  {currentStock.toLocaleString()}
  </td>
 <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${stockColors[urgencyLevel]}`}>
 {daysOfStock} days
 </td>
<td className="px-6 py-4 whitespace-nowrap text-sm text-foreground text-right">
  {suggestedCartons} cartons
  </td>
  <td className="px-6 py-4 text-sm text-muted-foreground">
 {recommendation}
 </td>
 </tr>
 )
}