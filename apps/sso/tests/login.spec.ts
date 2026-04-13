import { test, expect, type Page } from '@playwright/test'

const portalBaseUrl = 'http://127.0.0.1:3200'
const talosBaseUrl = 'http://127.0.0.1:3201/operations/purchase-orders'
const demoUsername = 'e2e-user'
const demoPassword = 'e2e-pass'

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function submitLogin(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="emailOrUsername"]', demoUsername)
  await page.fill('input[name="password"]', demoPassword)
  await page.waitForSelector('button.submit-button:not([disabled])', { timeout: 15_000 })
  await page.click('button.submit-button')
}

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
