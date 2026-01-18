'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from '@/lib/lucide-icons'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  className?: string
  collapsed?: boolean
}

export function ThemeToggle({ className, collapsed }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <button
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          className
        )}
        disabled
      >
        <div className="h-5 w-5" />
        {!collapsed && <span className="text-sm">Theme</span>}
      </button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
        'text-slate-700 dark:text-slate-300',
        'hover:bg-slate-100 dark:hover:bg-slate-800',
        className
      )}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-amber-500" />
      ) : (
        <Moon className="h-5 w-5 text-slate-500" />
      )}
      {!collapsed && (
        <span className="text-sm">{isDark ? 'Light mode' : 'Dark mode'}</span>
      )}
    </button>
  )
}
