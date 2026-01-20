import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkbookLayout } from '@/components/workbook-layout'
import type { YearSegment } from '@/lib/calculations/calendar'
import { SHEETS } from '@/lib/sheets'
import type { WorkbookSheetStatus } from '@/lib/workbook'

const pushMock = vi.fn()
let searchParamsInstance: URLSearchParams
let mockedPathname = '/2-product-setup'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => mockedPathname,
  useSearchParams: () => searchParamsInstance,
}))

const planningYears: YearSegment[] = [
  { year: 2025, startWeekNumber: 1, endWeekNumber: 52, weekCount: 52 },
  { year: 2026, startWeekNumber: 53, endWeekNumber: 104, weekCount: 52 },
  { year: 2027, startWeekNumber: 105, endWeekNumber: 156, weekCount: 52 },
]

const sheetStatus: WorkbookSheetStatus[] = SHEETS.map((sheet, index) => ({
  slug: sheet.slug,
  label: sheet.label,
  description: sheet.description,
  recordCount: 0,
  status: index === 0 ? 'complete' : 'todo',
}))

function renderLayout(activeYear: number | null, activeSlug: WorkbookSheetStatus['slug'] = '4-sales-planning') {
  searchParamsInstance = activeYear != null ? new URLSearchParams({ year: String(activeYear) }) : new URLSearchParams()
  pushMock.mockReset()
  mockedPathname = `/${activeSlug}`

  render(
    <WorkbookLayout
      sheets={sheetStatus}
      activeSlug={activeSlug}
      planningYears={planningYears}
      activeYear={activeYear}
    >
      <div>content</div>
    </WorkbookLayout>,
  )
}

describe('WorkbookLayout year navigation', () => {
  beforeEach(() => {
    searchParamsInstance = new URLSearchParams({ year: '2025' })
    pushMock.mockReset()
  })

  afterEach(() => {
    pushMock.mockReset()
  })

  it('renders year controls on year-aware sheets and allows switching via select', () => {
    renderLayout(2025)

    const yearSelects = screen.getAllByRole('combobox', { name: 'Select year' })
    fireEvent.change(yearSelects[0]!, { target: { value: '2026' } })
    expect(pushMock).toHaveBeenCalledWith('/4-sales-planning?year=2026')
  })

  it('renders year controls on ops planning', () => {
    renderLayout(2025, '3-ops-planning')

    const yearSelects = screen.getAllByRole('combobox', { name: 'Select year' })
    fireEvent.change(yearSelects[0]!, { target: { value: '2026' } })
    expect(pushMock).toHaveBeenCalledWith('/3-ops-planning?year=2026')
  })

  it('hides year controls on time-agnostic sheets', () => {
    renderLayout(2026, '2-product-setup')

    expect(screen.queryByRole('combobox', { name: 'Select year' })).not.toBeInTheDocument()
  })
})
