import { test, expect, type Page } from '@playwright/test'

import { hostedScreenshotPath, loginToHostedPortal } from './fixtures/hosted-auth'

const portalBaseUrl = process.env.PORTAL_BASE_URL
if (typeof portalBaseUrl !== 'string' || portalBaseUrl.trim() === '') {
  throw new Error('PORTAL_BASE_URL must be defined for hosted portal smoke tests.')
}

const routes = [
  { name: 'portal', url: `${portalBaseUrl}/`, visible: 'TargonOS Portal' },
  { name: 'talos', url: `${portalBaseUrl}/talos/operations/purchase-orders`, visible: 'Purchase Orders' },
  { name: 'atlas', url: `${portalBaseUrl}/atlas/employees`, visible: 'Employees' },
  { name: 'kairos', url: `${portalBaseUrl}/kairos/forecasts`, visible: 'Forecasts' },
  { name: 'xplan', url: `${portalBaseUrl}/xplan/1-setup`, visible: 'Setup' },
  { name: 'plutus', url: `${portalBaseUrl}/plutus/settlements`, visible: 'Settlements' },
  { name: 'hermes', url: `${portalBaseUrl}/hermes/insights`, visible: 'Insights' },
  { name: 'argus', url: `${portalBaseUrl}/argus/wpr`, visible: 'Weekly performance reporting' },
] as const

function versionBadge(page: Page) {
  return page.getByRole('link', { name: /v\d+\.\d+\.\d+/i }).first()
}

for (const route of routes) {
  test(`${route.name} deep link renders visible screen`, async ({ page }) => {
    await loginToHostedPortal(page)
    await page.goto(route.url, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(route.visible, { exact: false }).first()).toBeVisible({ timeout: 20_000 })
    await page.screenshot({ path: hostedScreenshotPath(route.name), fullPage: true })
    await expect(versionBadge(page)).toBeVisible({ timeout: 20_000 })
  })
}
