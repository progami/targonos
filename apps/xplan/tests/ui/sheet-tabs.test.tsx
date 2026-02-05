import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SheetTabs } from '@/components/sheet-tabs'
import { SHEETS } from '@/lib/sheets'

vi.mock('next/navigation', () => ({
  usePathname: () => '/1-setup',
}))

describe('SheetTabs', () => {
  it('marks the active sheet and renders default hrefs', () => {
    render(<SheetTabs sheets={SHEETS} activeSlug="1-setup" />)
    const activeIndex = SHEETS.findIndex((sheet) => sheet.slug === '1-setup')
    const activeLabel = `${activeIndex + 1} ${SHEETS[activeIndex]!.shortLabel}`
    const active = screen.getByRole('link', { name: activeLabel })
    expect(active).toHaveAttribute('href', '/1-setup')
    expect(active.className).toContain('bg-cyan-600')

    const inactiveIndex = SHEETS.findIndex((sheet) => sheet.slug === '3-ops-planning')
    const inactiveLabel = `${inactiveIndex + 1} ${SHEETS[inactiveIndex]!.shortLabel}`
    const inactive = screen.getByRole('link', { name: inactiveLabel })
    expect(inactive).toHaveAttribute('href', '/3-ops-planning')
  })

  it('respects precomputed href overrides', () => {
    const customSheets = SHEETS.map((sheet) => ({ ...sheet, href: `/custom/${sheet.slug}` }))
    render(<SheetTabs sheets={customSheets} activeSlug="1-setup" />)
    const inactiveIndex = SHEETS.findIndex((sheet) => sheet.slug === '3-ops-planning')
    const inactiveLabel = `${inactiveIndex + 1} ${SHEETS[inactiveIndex]!.shortLabel}`
    const inactive = screen.getByRole('link', { name: inactiveLabel })
    expect(inactive).toHaveAttribute('href', '/custom/3-ops-planning')
  })

})
