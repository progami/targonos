'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TenantConfig, TenantCode, TENANTS } from '@/lib/tenant/constants'
import { Globe, MapPin, LogOut } from '@/lib/lucide-icons'
import { withBasePath } from '@/lib/utils/base-path'

interface TenantIndicatorProps {
  className?: string
  collapsed?: boolean
  showLogout?: boolean
}

// Format timezone to readable city name
function formatTimezone(timezone: string): string {
  // Extract city from timezone (e.g., "America/Los_Angeles" -> "Los Angeles")
  const parts = timezone.split('/')
  const city = parts[parts.length - 1].replace(/_/g, ' ')
  return city
}

export function FlatFlag({ code, size = 24 }: { code: TenantCode; size?: number }) {
  const h = Math.round(size * 2 / 3)
  if (code === 'US') {
    return (
      <svg width={size} height={h} viewBox="0 0 24 16" className="rounded-sm flex-shrink-0">
        <rect width="24" height="16" fill="#B22234" />
        <rect y="1.23" width="24" height="1.23" fill="#FFF" />
        <rect y="3.69" width="24" height="1.23" fill="#FFF" />
        <rect y="6.15" width="24" height="1.23" fill="#FFF" />
        <rect y="8.62" width="24" height="1.23" fill="#FFF" />
        <rect y="11.08" width="24" height="1.23" fill="#FFF" />
        <rect y="13.54" width="24" height="1.23" fill="#FFF" />
        <rect width="9.6" height="8.62" fill="#3C3B6E" />
      </svg>
    )
  }
  return (
    <svg width={size} height={h} viewBox="0 0 24 16" className="rounded-sm flex-shrink-0">
      <rect width="24" height="16" fill="#012169" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFF" strokeWidth="2.5" />
      <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" strokeWidth="1.5" />
      <path d="M12,0 V16 M0,8 H24" stroke="#FFF" strokeWidth="4" />
      <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" strokeWidth="2.5" />
    </svg>
  )
}

/**
 * Display-only indicator showing current region.
 * Region switching is only allowed from the WorldMap (landing page).
 */
export function TenantIndicator({ className, collapsed, showLogout = true }: TenantIndicatorProps) {
  const [current, setCurrent] = useState<TenantConfig | null>(null)
  const router = useRouter()

  const handleLogout = () => {
    router.push('/')
  }

  useEffect(() => {
    // Fetch current tenant on mount
    fetch(withBasePath('/api/tenant/current'), { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (data.current?.code) {
          setCurrent(TENANTS[data.current.code as TenantCode])
        }
      })
      .catch(console.error)
  }, [])

  if (!current) {
    return (
      <div className={cn('flex items-center gap-3 px-3 py-2.5 text-slate-400', className)}>
        <Globe className="h-5 w-5 animate-pulse" />
        {!collapsed && <span className="text-sm">Loading...</span>}
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2.5 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-700/50',
          !showLogout && 'flex-1'
        )}
      >
        <FlatFlag code={current.code} />
        {!collapsed && (
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{current.displayName}</span>
            <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{formatTimezone(current.timezone)}</span>
            </span>
          </div>
        )}
      </div>
      {showLogout && (
        <button
          onClick={handleLogout}
          className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-2.5 text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-700/50 hover:text-slate-700 dark:hover:text-slate-200"
          title="Switch Region"
        >
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
