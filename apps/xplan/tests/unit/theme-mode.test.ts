import { describe, expect, it } from 'vitest'
import { resolveMuiThemeMode } from '@/lib/theme-mode'

describe('resolveMuiThemeMode', () => {
  it('keeps the light theme until the client mounts', () => {
    expect(resolveMuiThemeMode(false, 'dark')).toBe('light')
  })

  it('switches to dark mode after mount when next-themes resolves dark', () => {
    expect(resolveMuiThemeMode(true, 'dark')).toBe('dark')
  })

  it('falls back to light mode for non-dark resolved themes', () => {
    expect(resolveMuiThemeMode(true, 'light')).toBe('light')
    expect(resolveMuiThemeMode(true, undefined)).toBe('light')
  })
})
