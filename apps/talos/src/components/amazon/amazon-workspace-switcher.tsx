import Link from 'next/link'
import { AMAZON_WORKSPACE_TOOLS } from '@/lib/amazon/workspace'
import { isNavigationItemActive } from '@/lib/navigation/main-nav'
import { cn } from '@/lib/utils'

type AmazonWorkspaceSwitcherProps = {
  currentHref: string
  className?: string
}

export function AmazonWorkspaceSwitcher({
  currentHref,
  className,
}: AmazonWorkspaceSwitcherProps) {
  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 shadow-soft dark:border-slate-700/80 dark:bg-slate-900/85',
        className
      )}
    >
      {AMAZON_WORKSPACE_TOOLS.map((tool) => {
        const isActive = isNavigationItemActive(currentHref, tool)

        return (
          <Link
            key={tool.href}
            href={tool.href}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-cyan-600 text-white shadow-soft'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
            )}
          >
            {tool.name}
          </Link>
        )
      })}
    </div>
  )
}
