import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SheetTabs } from '@/components/sheet-tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SHEETS } from '@/lib/sheets'

vi.mock('next/navigation', () => ({
  usePathname: () => '/1-setup',
}))

describe('SheetTabs', () => {
  it('marks the active sheet and renders default hrefs', () => {
    render(<TooltipProvider><SheetTabs sheets={SHEETS} activeSlug="1-setup" /></TooltipProvider>)
    const tabs = screen.getAllByRole('tab')
    const activeTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(activeTab).toBeDefined()
    expect(activeTab).toHaveAttribute('href', '/1-setup')
  })

  it('respects precomputed href overrides', () => {
    const customSheets = SHEETS.map((sheet) => ({ ...sheet, href: `/custom/${sheet.slug}` }))
    render(<TooltipProvider><SheetTabs sheets={customSheets} activeSlug="1-setup" /></TooltipProvider>)
    const tabs = screen.getAllByRole('tab')
    const opsTab = tabs.find((tab) => tab.getAttribute('href') === '/custom/3-ops-planning')
    expect(opsTab).toBeDefined()
  })

})
