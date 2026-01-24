import React from 'react'
import { LucideIcon } from '@/lib/lucide-icons'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
 icon: LucideIcon
 title: string
 description: string
 action?: {
 label: string
 onClick: () => void
 }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
 return (
 <div className="text-center py-12">
 <Icon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
 <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
 <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">{description}</p>
 {action && (
 <Button onClick={action.onClick} className="gap-2">
 {action.label}
 </Button>
 )}
 </div>
 )
}
