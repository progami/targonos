'use client'

import { useCallback, useLayoutEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { create } from 'zustand'

type NavigationHistoryContextType = {
  goBack: () => void
  canGoBack: boolean
  previousPath: string | null
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
  if (path === '/' || path === '' || path === '/work' || path === '/hub') {
    return null
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

  // Generic fallback: go to parent path or dashboard
  const segments = path.split('/').filter(Boolean)
  if (segments.length > 1) {
    // Go to parent
    segments.pop()
    return '/' + segments.join('/')
  }

  // Top-level pages go to work queue
  return '/work'
}

type NavigationHistoryStore = {
  pathname: string
  previousPath: string | null
  canGoBack: boolean
  setPathname: (pathname: string) => void
}

const useNavigationHistoryStore = create<NavigationHistoryStore>((set) => ({
  pathname: '',
  previousPath: null,
  canGoBack: false,
  setPathname: (pathname) => {
    const previousPath = getDefaultBackPath(pathname)
    set({ pathname, previousPath, canGoBack: previousPath !== null })
  },
}))

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  const setPathname = useNavigationHistoryStore((s) => s.setPathname)
  useLayoutEffect(() => {
    setPathname(pathname)
  }, [pathname, setPathname])

  return children
}

export function useNavigationHistory() {
  const router = useRouter()

  const previousPath = useNavigationHistoryStore((s) => s.previousPath)
  const canGoBack = useNavigationHistoryStore((s) => s.canGoBack)

  const goBack = useCallback(() => {
    if (previousPath) {
      router.push(previousPath)
      return
    }
    window.history.back()
  }, [previousPath, router])

  return { goBack, canGoBack, previousPath } satisfies NavigationHistoryContextType
}
