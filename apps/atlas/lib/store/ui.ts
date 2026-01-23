'use client'

import { create } from 'zustand'

type UIStore = {
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  openMobileMenu: () => void
  closeMobileMenu: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  mobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
  openMobileMenu: () => set({ mobileMenuOpen: true }),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
}))
