import { test, expect } from '@playwright/test'

test.describe('Basic Application Tests', () => {
  test('application loads successfully', async ({ page }) => {
    await page.goto('./')
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
    
    // Check that the page has loaded
    const title = await page.title()
    expect(title).toBeTruthy()
  })
})
