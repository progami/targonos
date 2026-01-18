import React from 'react'
import { LucideIcon } from '@/lib/lucide-icons'

interface PageHeaderProps {
 title: string
 subtitle?: string
 description?: string
 icon?: LucideIcon
 iconColor?: string
 bgColor?: string
 borderColor?: string
 textColor?: string
 actions?: React.ReactNode
}

export function PageHeader({
 title,
 subtitle,
 description: _description,
 icon: _Icon,
 iconColor: _iconColor = 'text-cyan-600',
 bgColor: _bgColor = 'bg-cyan-50',
 borderColor: _borderColor = 'border-cyan-200',
 textColor: _textColor = 'text-cyan-800',
 actions
}: PageHeaderProps) {
 return (
 <div className="bg-white dark:bg-slate-800 border rounded-lg p-6">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h1 className="text-3xl font-bold mb-2">{title}</h1>
 {subtitle && (
 <p className="text-muted-foreground">{subtitle}</p>
 )}
 </div>
 {actions && (
 <div className="flex items-center gap-2">
 {actions}
 </div>
 )}
 </div>
 </div>
 )
}