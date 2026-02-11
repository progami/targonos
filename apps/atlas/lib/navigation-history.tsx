'use client'

import { useCallback, useLayoutEffect, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { create } from 'zustand'

type NavigationHistoryContextType = {
  goBack: () => void
  canGoBack: boolean
  previousPath: string | null // Fallback when there's no browser history
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

function stripBasePath(pathname: string) {
  if (basePath === '') return pathname
  if (basePath === '/') return pathname
  if (!pathname.startsWith(basePath)) return pathname
  const stripped = pathname.slice(basePath.length)
  return stripped === '' ? '/' : stripped
}

function buildLocation(pathname: string, search: string) {
  if (search === '') return pathname
  return `${pathname}?${search}`
}

/**
 * Contextual navigation defaults
 * Instead of recording the literal journey like browser history,
 * we use reasonable defaults for each page.
 *
 * Pattern matching priority (most specific first):
 * 1. Exact path matches
 * 2. Dynamic route patterns
 */
function getDefaultBackPath(pathname: string): string | null {
  // Remove trailing slash
  const path = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname

  // Home routes - no back
  if (path === '/' || path === '' || path === '/hub') {
    return null
  }

  // Leave routes
  if (/^\/leaves\/[^/]+$/.test(path)) {
    // /leaves/[id] -> /leave
    return '/leave'
  }

  // Employee routes
  if (/^\/employees\/[^/]+\/edit$/.test(path)) {
    // /employees/[id]/edit -> /employees/[id]
    return path.replace('/edit', '')
  }
  if (/^\/employees\/add$/.test(path)) {
    // /employees/add -> /employees
    return '/employees'
  }
  if (/^\/employees\/[^/]+$/.test(path)) {
    // /employees/[id] -> /employees
    return '/employees'
  }

  // Policy routes
  if (/^\/policies\/[^/]+\/edit$/.test(path)) {
    // /policies/[id]/edit -> /policies/[id]
    return path.replace('/edit', '')
  }
  if (/^\/policies\/add$/.test(path)) {
    // /policies/add -> /policies
    return '/policies'
  }
  if (/^\/policies\/[^/]+$/.test(path)) {
    // /policies/[id] -> /policies
    return '/policies'
  }

  // Performance review routes
  if (/^\/performance\/reviews\/add$/.test(path)) {
    // /performance/reviews/add -> /performance/reviews
    return '/performance/reviews'
  }
  if (/^\/performance\/reviews\/[^/]+$/.test(path)) {
    // /performance/reviews/[id] -> /performance/reviews
    return '/performance/reviews'
  }

  // Violations routes
  if (/^\/performance\/violations\/add$/.test(path)) {
    return '/performance/violations'
  }
  if (/^\/performance\/violations\/[^/]+\/edit$/.test(path)) {
    return path.replace('/edit', '')
  }
  if (/^\/performance\/violations\/[^/]+$/.test(path)) {
    return '/performance/violations'
  }

  // Legacy cases / violations routes (Cases UI was deprecated)
  if (/^\/cases\/violations\/add$/.test(path)) {
    return '/performance/violations'
  }
  if (/^\/cases\/violations\/[^/]+\/edit$/.test(path)) {
    return '/performance/violations'
  }

  // Legacy disciplinary routes (now redirected to Violations)
  if (/^\/performance\/disciplinary\/add$/.test(path)) {
    return '/performance/violations'
  }
  if (/^\/performance\/disciplinary\/[^/]+$/.test(path)) {
    return '/performance/violations'
  }
  if (/^\/performance\/disciplinary\/[^/]+\/edit$/.test(path)) {
    return '/performance/violations'
  }

  // Resources routes
  if (/^\/resources\/add$/.test(path)) {
    return '/resources'
  }
  if (/^\/resources\/[^/]+$/.test(path)) {
    return '/resources'
  }

  // Section roots without an index route
  if (/^\/performance\/[^/]+$/.test(path)) {
    return '/hub'
  }
  if (/^\/admin\/[^/]+$/.test(path)) {
    return '/hub'
  }

  // Generic fallback: go to parent path or dashboard
  const segments = path.split('/').filter(Boolean)
  if (segments.length > 1) {
    // Go to parent
    segments.pop()
    return '/' + segments.join('/')
  }

  // Top-level pages go to hub
  return '/hub'
}

type NavigationHistoryStore = {
  pathname: string
  search: string
  historyIndex: number
  previousPath: string | null
  previousLocation: string | null
  setLocation: (pathname: string, search: string, historyIndex: number) => void
}

const useNavigationHistoryStore = create<NavigationHistoryStore>((set) => ({
  pathname: '',
  search: '',
  historyIndex: 0,
  previousPath: null,
  previousLocation: null,
  setLocation: (pathname, search, historyIndex) => {
    set((prev) => {
      const previousPath = getDefaultBackPath(pathname)
      const previousLocation =
        prev.pathname !== '' && prev.pathname !== pathname
          ? buildLocation(prev.pathname, prev.search)
          : prev.previousLocation

      return { pathname, search, historyIndex, previousPath, previousLocation }
    })
  },
}))

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = stripBasePath(usePathname())
  const searchParams = useSearchParams()
  const search = searchParams.toString()

  const setLocation = useNavigationHistoryStore((s) => s.setLocation)
  useLayoutEffect(() => {
    const state = window.history.state as { idx?: unknown } | null
    const rawIdx = state ? state.idx : undefined
    const historyIndex = typeof rawIdx === 'number' ? rawIdx : 0
    setLocation(pathname, search, historyIndex)
  }, [pathname, search, setLocation])

  return children
}

export function useNavigationHistory() {
  const router = useRouter()

  const previousPath = useNavigationHistoryStore((s) => s.previousPath)
  const previousLocation = useNavigationHistoryStore((s) => s.previousLocation)
  const historyIndex = useNavigationHistoryStore((s) => s.historyIndex)
  const canGoBack = historyIndex > 0 ? true : previousLocation !== null ? true : previousPath !== null

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      router.back()
      return
    }

    if (previousLocation !== null) {
      router.push(previousLocation)
      return
    }

    if (previousPath !== null) {
      router.push(previousPath)
      return
    }

    router.back()
  }, [historyIndex, previousLocation, previousPath, router])

  return { goBack, canGoBack, previousPath } satisfies NavigationHistoryContextType
}
