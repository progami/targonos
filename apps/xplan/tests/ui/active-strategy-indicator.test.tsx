import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActiveStrategyIndicator } from '@/components/active-strategy-indicator'

describe('ActiveStrategyIndicator', () => {
  it('renders as compact header status text instead of a pill chip', () => {
    const { container } = render(<ActiveStrategyIndicator strategyName="PDS - Old Import (MAIN)" />)

    expect(screen.getByText('PDS - Old Import (MAIN)')).toBeVisible()
    expect(container.querySelector('.MuiChip-root')).not.toBeInTheDocument()
  })
})
