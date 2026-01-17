import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ArrowLeft } from '@/lib/lucide-icons'
import { Button } from '@/components/ui/button'
import { HistoryBackButton } from '@/components/ui/history-back-button'

interface PageContainerProps {
 children: React.ReactNode
 className?: string
}

type PageHeaderBack =
 | {
    backHref: string
    backLabel: string
   }
 | {
    backHref?: undefined
    backLabel?: undefined
   }

type PageHeaderProps = {
 title: string
 description?: string
 icon?: LucideIcon
 actions?: React.ReactNode
 metadata?: React.ReactNode
} & PageHeaderBack

interface PageContentProps {
 children: React.ReactNode
 className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
 return (
 <div className={cn('flex flex-1 min-h-0 flex-col bg-slate-50 dark:bg-slate-950', className)}>
 {children}
 </div>
 )
}

export function PageHeaderSection({
 title,
 description,
 icon: Icon,
 backHref,
 backLabel,
 actions,
 metadata,
}: PageHeaderProps) {
 return (
 <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-4 py-4 shadow-soft backdrop-blur-xl sm:px-6 lg:px-8">
 <div className="flex flex-col gap-4">
 <div className="flex items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 {backHref ? (
 <Button asChild variant="outline" size="sm" className="gap-2">
 <Link href={backHref}>
 <ArrowLeft className="h-4 w-4" />
 {backLabel}
 </Link>
 </Button>
 ) : (
 <HistoryBackButton label="Back" />
 )}
 {Icon && (
 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600 shadow-md">
 <Icon className="h-5 w-5 text-white" />
 </div>
 )}
 <div className="flex flex-col gap-0.5">
 {description && (
 <span className="text-xs font-bold uppercase tracking-[0.1em] text-cyan-700/70 dark:text-cyan-400/70">
 {description}
 </span>
 )}
 <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
 </div>
 </div>
 {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
 </div>
 {metadata && <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{metadata}</div>}
 </div>
 </header>
 )
}

export function PageContent({ children, className }: PageContentProps) {
 return (
 <div className={cn('flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8', className)}>
 {children}
 </div>
 )
}
