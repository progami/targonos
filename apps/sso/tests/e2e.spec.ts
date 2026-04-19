import { test, expect } from '@playwright/test'

import {
  demoEmail,
  escapeForRegExp,
  portalBaseUrl,
  seedPortalSession,
} from './fixtures/dev-login'

test('TargonOS home renders the authenticated launcher', async ({ page }) => {
  await seedPortalSession(page)
  await page.goto(`${portalBaseUrl}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(new RegExp(`^${escapeForRegExp(portalBaseUrl)}/?$`), {
    timeout: 15_000,
  })
  await expect(page.getByText('Portal launcher')).toBeVisible()
  await expect(page.getByText('Assigned workspaces')).toBeVisible()
  await expect(page.getByText(demoEmail)).toBeVisible()
  await expect(page).not.toHaveURL(/\/login$/)
})
