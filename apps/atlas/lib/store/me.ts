'use client'

import { create } from 'zustand'
import { MeApi, type Me } from '@/lib/api-client'

type MeStatus = 'idle' | 'loading' | 'loaded' | 'error'

type MeStore = {
  me: Me | null
  status: MeStatus
  error: string | null
  refresh: () => Promise<Me>
}

let inFlight: Promise<Me> | null = null

export const useMeStore = create<MeStore>((set) => ({
  me: null,
  status: 'idle',
  error: null,
  refresh: async () => {
    if (inFlight) return inFlight

    set({ status: 'loading', error: null })
    inFlight = MeApi.get()

    try {
      const me = await inFlight
      set({ me, status: 'loaded', error: null })
      return me
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
      throw e
    } finally {
      inFlight = null
    }
  },
}))

export async function ensureMe() {
  const { me, refresh } = useMeStore.getState()
  if (me) return me
  return refresh()
}
