'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface PageState {
  activeTab?: string
  filters?: Record<string, string>
  custom?: Record<string, unknown>
}

type PageStateMap = Record<string, PageState | undefined>

type PageStateStore = {
  pages: PageStateMap
  getPageState: (pagePath: string) => PageState
  setPageState: (pagePath: string, state: PageState) => void
  updatePageState: (pagePath: string, state: Partial<PageState>) => void
  setActiveTab: (pagePath: string, tab: string) => void
  setFilters: (pagePath: string, filters: Record<string, string>) => void
  setCustom: (pagePath: string, key: string, value: unknown) => void
  clearPageState: (pagePath: string) => void
  clearAllState: () => void
}

export const usePageStateStore = create<PageStateStore>()(
  persist(
    (set, get) => ({
      pages: {},

      getPageState: (pagePath) => {
        const existing = get().pages[pagePath]
        if (existing) return existing
        return {}
      },

      setPageState: (pagePath, state) => {
        set((prev) => ({
          pages: {
            ...prev.pages,
            [pagePath]: state,
          },
        }))
      },

      updatePageState: (pagePath, state) => {
        set((prev) => {
          const existing = prev.pages[pagePath]
          return {
            pages: {
              ...prev.pages,
              [pagePath]: existing ? { ...existing, ...state } : { ...state },
            },
          }
        })
      },

      setActiveTab: (pagePath, tab) => {
        set((prev) => {
          const existing = prev.pages[pagePath]
          return {
            pages: {
              ...prev.pages,
              [pagePath]: existing ? { ...existing, activeTab: tab } : { activeTab: tab },
            },
          }
        })
      },

      setFilters: (pagePath, filters) => {
        set((prev) => {
          const existing = prev.pages[pagePath]
          return {
            pages: {
              ...prev.pages,
              [pagePath]: existing ? { ...existing, filters } : { filters },
            },
          }
        })
      },

      setCustom: (pagePath, key, value) => {
        set((prev) => {
          const existing = prev.pages[pagePath]
          const existingCustom = existing ? existing.custom : undefined
          const nextCustom = existingCustom ? { ...existingCustom, [key]: value } : { [key]: value }
          return {
            pages: {
              ...prev.pages,
              [pagePath]: existing ? { ...existing, custom: nextCustom } : { custom: nextCustom },
            },
          }
        })
      },

      clearPageState: (pagePath) => {
        set((prev) => {
          const next: PageStateMap = { ...prev.pages }
          delete next[pagePath]
          return { pages: next }
        })
      },

      clearAllState: () => {
        set({ pages: {} })
      },
    }),
    {
      name: 'atlas-page-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pages: Object.fromEntries(
          Object.entries(state.pages).map(([key, value]) => [
            key,
            {
              activeTab: value?.activeTab,
              filters: value?.filters,
              custom: value?.custom,
            },
          ])
        ),
      }),
    }
  )
)

export function usePageState(pagePath: string) {
  const store = usePageStateStore()
  const pageState = store.getPageState(pagePath)

  return {
    ...pageState,
    setActiveTab: (tab: string) => store.setActiveTab(pagePath, tab),
    setFilters: (filters: Record<string, string>) => store.setFilters(pagePath, filters),
    setCustom: (key: string, value: unknown) => store.setCustom(pagePath, key, value),
    updatePageState: (state: Partial<PageState>) => store.updatePageState(pagePath, state),
    clearPageState: () => store.clearPageState(pagePath),
  }
}
