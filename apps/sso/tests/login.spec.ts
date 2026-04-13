import { test, expect } from '@playwright/test'

import { escapeForRegExp, portalBaseUrl, submitLogin, talosBaseUrl } from './fixtures/dev-login'

test('portal login redirects to portal home', async ({ page }) => {
  await submitLogin(page, `${portalBaseUrl}/login`)
  await page.waitForURL(new RegExp(`^${escapeForRegExp(portalBaseUrl)}/?$`), {
    timeout: 15_000,
  })
  await expect(page.getByText('TargonOS Portal')).toBeVisible({ timeout: 10000 })
})

test('portal login with callback lands on Talos instead of portal home', async ({ page }) => {
  await submitLogin(
    page,
    `${portalBaseUrl}/login?callbackUrl=${encodeURIComponent(talosBaseUrl)}`,
  )
  await page.waitForURL(new RegExp(`^${escapeForRegExp(talosBaseUrl)}$`), {
    timeout: 15_000,
  })
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible({ timeout: 10_000 })
})
