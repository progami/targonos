'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Package,
  FileText,
  Users,
  Building,
  Loader2,
  X,
} from '@/lib/lucide-icons'
import { cn } from '@/lib/utils'

type SearchResultType = 'SKU' | 'PURCHASE_ORDER' | 'SUPPLIER' | 'WAREHOUSE'

interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle?: string
  href: string
}

function typeIcon(type: SearchResultType) {
  switch (type) {
    case 'SKU':
      return Package
    case 'PURCHASE_ORDER':
      return FileText
    case 'SUPPLIER':
      return Users
    case 'WAREHOUSE':
      return Building
    default:
      return Package
  }
}

function typeLabel(type: SearchResultType): string {
  switch (type) {
    case 'SKU':
      return 'Products'
    case 'PURCHASE_ORDER':
      return 'Purchase Orders'
    case 'SUPPLIER':
      return 'Suppliers'
    case 'WAREHOUSE':
      return 'Warehouses'
    default:
      return type
  }
}

function typeBadge(type: SearchResultType): string {
  switch (type) {
    case 'SKU':
      return 'SKU'
    case 'PURCHASE_ORDER':
      return 'PO'
    case 'SUPPLIER':
      return 'SUP'
    case 'WAREHOUSE':
      return 'WH'
    default:
      return type
  }
}

export function CommandPalette() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cacheRef = useRef<Map<string, SearchResult[]>>(new Map())
  const listRef = useRef<HTMLDivElement | null>(null)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const groups = new Map<SearchResultType, SearchResult[]>()
    for (const r of results) {
      const list = groups.get(r.type) ?? []
      list.push(r)
      groups.set(r.type, list)
    }

    const order: SearchResultType[] = ['SKU', 'PURCHASE_ORDER', 'SUPPLIER', 'WAREHOUSE']
    return order
      .map((t) => ({ type: t, items: groups.get(t) ?? [] }))
      .filter((g) => g.items.length > 0)
  }, [results])

  const flatResults = useMemo(() => results, [results])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setSelectedIdx(0)
    setError(null)
  }, [])

  const openPalette = useCallback(() => {
    setOpen(true)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === 'k'
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault()
        if (open) {
          close()
        } else {
          openPalette()
        }
      }

      if (!open) return

      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((idx) => Math.min(flatResults.length - 1, idx + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((idx) => Math.max(0, idx - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const item = flatResults[selectedIdx]
        if (!item) return
        router.push(item.href)
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, flatResults, open, openPalette, router, selectedIdx])

  // Search effect with debounce
  useEffect(() => {
    if (!open) return

    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSelectedIdx(0)
      setLoading(false)
      setError(null)
      return
    }

    const cached = cacheRef.current.get(trimmed)
    if (cached) {
      setResults(cached)
      setSelectedIdx(0)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error('Search failed')
        }
        const data = await res.json()
        const searchResults: SearchResult[] = data.results ?? []
        cacheRef.current.set(trimmed, searchResults)
        setResults(searchResults)
        setSelectedIdx(0)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Search failed. Please try again.')
          setResults([])
        }
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [open, query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIdx])

  if (!open) return null

  let currentFlatIdx = -1

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-[15%] w-full max-w-xl -translate-x-1/2">
        <div className="mx-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
          {/* Search Input */}
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
            <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, orders, suppliers..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-900 dark:text-slate-100"
              autoComplete="off"
              autoFocus
            />
            {loading && (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            )}
            <button
              onClick={close}
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[60vh] overflow-y-auto p-2"
          >
            {error && (
              <div className="px-3 py-4 text-center text-sm text-red-500">
                {error}
              </div>
            )}

            {!error && query.length < 2 && (
              <div className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                <p>Type at least 2 characters to search</p>
                <p className="mt-2 text-xs">
                  Press <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">Esc</kbd> to close
                </p>
              </div>
            )}

            {!error && query.length >= 2 && !loading && results.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No results found for &quot;{query}&quot;
              </div>
            )}

            {grouped.map((group) => (
              <div key={group.type} className="mb-2">
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {typeLabel(group.type)}
                </div>
                {group.items.map((item) => {
                  currentFlatIdx++
                  const isSelected = currentFlatIdx === selectedIdx
                  const Icon = typeIcon(item.type)

                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      data-selected={isSelected}
                      onClick={() => {
                        router.push(item.href)
                        close()
                      }}
                      onMouseEnter={() => setSelectedIdx(currentFlatIdx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                        isSelected
                          ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-100'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          isSelected
                            ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
                          isSelected
                            ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        )}
                      >
                        {typeBadge(item.type)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">↑↓</kbd> to navigate
            </span>
            <span>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">Enter</kbd> to select
            </span>
            <span>
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs">Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
