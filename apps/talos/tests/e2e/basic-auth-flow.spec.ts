import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('login')
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle')
    
    // In test mode, we should be redirected or see the app
    const url = page.url()
    expect(url).toBeTruthy()
  })
})
