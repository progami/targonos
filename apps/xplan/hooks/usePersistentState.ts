"use client"

import { useEffect, useRef, useState } from 'react'

function resolveInitialValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value
}

export function usePersistentState<T>(key: string, initialValue: T | (() => T)) {
  const hasHydratedRef = useRef(false)
  const [state, setState] = useState<T>(() => resolveInitialValue(initialValue))
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHydrated(true)
      return
    }
    if (hasHydratedRef.current) {
      setHydrated(true)
      return
    }
    hasHydratedRef.current = true
    try {
      const fromStorage = window.sessionStorage.getItem(key)
      if (fromStorage != null) {
        setState(JSON.parse(fromStorage) as T)
      }
    } catch (error) {
      console.warn('[xplan] failed to hydrate sessionStorage key', key, error)
    } finally {
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.warn('[xplan] failed to persist sessionStorage key', key, error)
    }
  }, [hydrated, key, state])

  return [state, setState, hydrated] as const
}
