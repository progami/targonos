import { test, expect } from '@playwright/test'

const portalBaseUrl = 'http://127.0.0.1:3200'

test('TargonOS home renders and shows portal title', async ({ page }) => {
  await page.goto(portalBaseUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('TargonOS Portal')).toBeVisible()
  await expect(page).not.toHaveURL(/dev-os\.targonglobal\.com\/login/)
  await expect(page).not.toHaveURL(/os\.targonglobal\.com\/login/)
})
