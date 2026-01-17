import * as React from 'react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

export interface StatsCardProps {
 title: string
 value: string | number
 subtitle?: string
 icon?: LucideIcon
 variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
 size?: 'sm' | 'md' | 'lg'
 trend?: {
 value: number
 label?: string
 }
 className?: string
 onClick?: () => void
}

const variantStyles = {
 default: {
 container: 'bg-white dark:bg-slate-800',
 icon: 'text-slate-400 dark:text-slate-500',
 value: 'text-slate-900 dark:text-slate-100',
 border: 'border-slate-200 dark:border-slate-700'
 },
 success: {
 container: 'bg-white dark:bg-slate-800',
 icon: 'text-green-600 dark:text-green-400',
 value: 'text-green-600 dark:text-green-400',
 border: 'border-slate-200 dark:border-slate-700'
 },
 warning: {
 container: 'bg-white dark:bg-slate-800',
 icon: 'text-amber-600 dark:text-amber-400',
 value: 'text-amber-600 dark:text-amber-400',
 border: 'border-slate-200 dark:border-slate-700'
 },
 danger: {
 container: 'bg-white dark:bg-slate-800',
 icon: 'text-red-600 dark:text-red-400',
 value: 'text-red-600 dark:text-red-400',
 border: 'border-slate-200 dark:border-slate-700'
 },
 info: {
 container: 'bg-white dark:bg-slate-800',
 icon: 'text-cyan-600 dark:text-cyan-400',
 value: 'text-cyan-600 dark:text-cyan-400',
 border: 'border-slate-200 dark:border-slate-700'
 }
}

const sizeStyles = {
 sm: {
 padding: 'p-4',
 titleSize: 'text-xs',
 valueSize: 'text-2xl',
 subtitleSize: 'text-xs',
 iconSize: 'h-5 w-5'
 },
 md: {
 padding: 'p-6',
 titleSize: 'text-sm',
 valueSize: 'text-3xl',
 subtitleSize: 'text-xs',
 iconSize: 'h-6 w-6'
 },
 lg: {
 padding: 'p-8',
 titleSize: 'text-base',
 valueSize: 'text-4xl',
 subtitleSize: 'text-sm',
 iconSize: 'h-8 w-8'
 }
}

export function StatsCard({
 title,
 value,
 subtitle,
 icon: Icon,
 variant = 'default',
 size = 'md',
 trend,
 className,
 onClick
}: StatsCardProps) {
 const styles = variantStyles[variant]
 const sizes = sizeStyles[size]
 
 return (
 <div
 className={cn(
 'border rounded-xl shadow-soft transition-all',
 sizes.padding,
 styles.container,
 styles.border,
 onClick && 'cursor-pointer hover:shadow-md',
 className
 )}
 onClick={onClick}
 >
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <p className={cn('text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider', sizes.titleSize)}>{title}</p>
 <div className="flex items-baseline gap-2 mt-2">
 <p className={cn('font-bold', sizes.valueSize, styles.value)}>
 {typeof value === 'number' ? value.toLocaleString() : value}
 </p>
 {subtitle && (
 <p className={cn('text-slate-500 dark:text-slate-400', sizes.subtitleSize)}>{subtitle}</p>
 )}
 </div>
 {trend && (
 <div className="flex items-center gap-1 mt-2">
 <span className={cn(
 'text-xs font-medium',
 trend.value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
 )}>
 {trend.value >= 0 ? '+' : ''}{trend.value}%
 </span>
 {trend.label && (
 <span className="text-xs text-slate-500 dark:text-slate-400">{trend.label}</span>
 )}
 </div>
 )}
 </div>
 {Icon && (
 <Icon className={cn(sizes.iconSize, styles.icon)} />
 )}
 </div>
 </div>
 )
}

// Grid component for consistent card layouts
export function StatsCardGrid({
 children,
 cols = 4,
 gap = 'gap-4',
 className
}: {
 children: React.ReactNode
 cols?: 2 | 3 | 4 | 5 | 6
 gap?: 'gap-1' | 'gap-2' | 'gap-4'
 className?: string
}) {
 const colsClass = {
 2: 'grid-cols-2',
 3: 'grid-cols-3', 
 4: 'md:grid-cols-2 lg:grid-cols-4',
 5: 'grid-cols-5',
 6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
 }[cols]
 
 return (
 <div className={cn('grid', gap, colsClass, className)}>
 {children}
 </div>
 )
}