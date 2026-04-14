import { test, expect } from '@playwright/test'

import { portalBaseUrl } from './fixtures/dev-login'

test('portal login only offers Google sign-in', async ({ page }) => {
  await page.goto(`${portalBaseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('input[name="emailOrUsername"]')).toHaveCount(0)
  await expect(page.locator('input[name="password"]')).toHaveCount(0)
})

test('portal login preserves the requested callback target for Google sign-in', async ({ page }) => {
  const callbackUrl = '/argus/wpr'

  await page.goto(
    `${portalBaseUrl}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    { waitUntil: 'domcontentloaded' },
  )

  await expect(page.locator('input[name="callbackUrl"]')).toHaveValue(callbackUrl)
})
