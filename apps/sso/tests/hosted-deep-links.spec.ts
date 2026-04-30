import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

import {
  assertHostedVersionBadge,
  assertNoHostedAuthRedirect,
  assertNoHostedErrorMarkers,
  hostedPortalBaseUrl,
  hostedRoute,
  hostedScreenshotPath,
  installHostedResponseTracker,
  loginToHostedPortal,
} from './fixtures/hosted-auth'

type HostedRouteCheck = {
  name: string
  path: string
  visibleText: string
}

const hostedRouteChecks: HostedRouteCheck[] = [
  { name: 'portal', path: '/', visibleText: 'Portal launcher' },
  { name: 'atlas', path: '/atlas/employees', visibleText: 'Employees' },
  { name: 'kairos', path: '/kairos/forecasts', visibleText: 'Forecasts' },
  { name: 'xplan', path: '/xplan/1-setup', visibleText: 'Setup' },
  { name: 'plutus', path: '/plutus/settlements', visibleText: 'Settlements' },
  { name: 'hermes', path: '/hermes/insights', visibleText: 'Insights' },
  { name: 'argus', path: '/argus/wpr', visibleText: 'Weekly performance reporting' },
  { name: 'talos-dashboard', path: '/talos/dashboard', visibleText: 'Dashboard' },
  { name: 'talos-inventory', path: '/talos/operations/inventory', visibleText: 'Inventory' },
  { name: 'talos-inbound', path: '/talos/operations/inbound', visibleText: 'Inbound' },
  { name: 'talos-products', path: '/talos/config/products', visibleText: 'Products' },
]

test.describe('hosted cross-app auth smoke', () => {
  test.describe.configure({ mode: 'serial' })

  let context: BrowserContext
  let page: Page
  let responseTracker: ReturnType<typeof installHostedResponseTracker>

  async function captureFailure(routeName: string, testInfo: TestInfo, run: () => Promise<void>) {
    try {
      await run()
    } catch (error) {
      if (!page.isClosed()) {
        await page.screenshot({
          path: hostedScreenshotPath(`${routeName}-${testInfo.retry}`),
          fullPage: true,
        })
      }
      throw error
    }
  }

  async function assertHostedRoute(check: HostedRouteCheck) {
    const targetUrl = hostedRoute(check.path)
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

    const currentPath = new URL(page.url()).pathname
    if (check.path === '/') {
      expect(currentPath).toBe('/')
    } else {
      expect(
        currentPath === check.path || currentPath.startsWith(`${check.path}/`),
        `Expected hosted path ${check.path}, got ${currentPath}`,
      ).toBe(true)
    }

    await expect(page.getByText(check.visibleText, { exact: false }).first()).toBeVisible({ timeout: 20_000 })
    await assertNoHostedAuthRedirect(page)
    await assertNoHostedErrorMarkers(page)
    await assertHostedVersionBadge(page)
    responseTracker.assertNone()
  }

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext()
    page = await context.newPage()
    responseTracker = installHostedResponseTracker(page)
    await loginToHostedPortal(page)
  })

  test.beforeEach(async () => {
    responseTracker.reset()
  })

  test.afterAll(async () => {
    responseTracker.dispose()
    await context.close()
  })

  for (const check of hostedRouteChecks) {
    test(`${check.name} deep link renders a real screen`, async ({}, testInfo) => {
      await captureFailure(check.name, testInfo, async () => {
        await assertHostedRoute(check)
      })
    })
  }

  test('talos region selection reaches dashboard', async ({}, testInfo) => {
    await captureFailure('talos-region-selection', testInfo, async () => {
      const tenantCurrentResponsePromise = page.waitForResponse((response) => {
        if (response.request().method() !== 'GET') {
          return false
        }

        const responseUrl = new URL(response.url())
        return responseUrl.origin === new URL(hostedPortalBaseUrl()).origin &&
          responseUrl.pathname === '/talos/api/tenant/current'
      })

      await page.goto(hostedRoute('/talos'), { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'TALOS' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText('Select your region', { exact: false })).toBeVisible({
        timeout: 20_000,
      })

      const tenantCurrentResponse = await tenantCurrentResponsePromise
      expect(tenantCurrentResponse.ok()).toBe(true)

      const usRegionCard = page.getByRole('button', {
        name: /US.*United States.*America\s*\/\s*Los Angeles.*Enter region/i,
      })
      await expect(usRegionCard).toBeVisible({ timeout: 20_000 })
      await expect(usRegionCard).toBeEnabled()

      const tenantSelectResponsePromise = page.waitForResponse((response) => {
        if (response.request().method() !== 'POST') {
          return false
        }

        const responseUrl = new URL(response.url())
        return responseUrl.origin === new URL(hostedPortalBaseUrl()).origin &&
          responseUrl.pathname === '/talos/api/tenant/select'
      })

      await usRegionCard.click()

      const tenantSelectResponse = await tenantSelectResponsePromise
      expect(tenantSelectResponse.ok()).toBe(true)

      await page.waitForURL(new RegExp(`^${hostedRoute('/talos/dashboard').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), {
        timeout: 20_000,
      })
      await expect(page.getByText('Dashboard', { exact: false }).first()).toBeVisible({ timeout: 20_000 })
      await assertNoHostedAuthRedirect(page)
      await assertNoHostedErrorMarkers(page)
      await assertHostedVersionBadge(page)
      responseTracker.assertNone()
    })
  })
})
