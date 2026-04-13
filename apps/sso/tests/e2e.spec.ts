import { test, expect } from '@playwright/test'

import {
  demoEmail,
  escapeForRegExp,
  portalBaseUrl,
  submitLogin,
} from './fixtures/dev-login'

test('TargonOS home renders the authenticated launcher', async ({ page }) => {
  await submitLogin(page, `${portalBaseUrl}/login`)
  await page.waitForURL(new RegExp(`^${escapeForRegExp(portalBaseUrl)}/?$`), {
    timeout: 15_000,
  })
  await expect(page.getByText('TargonOS Portal')).toBeVisible()
  await expect(page.getByText('Control Center')).toBeVisible()
  await expect(page.getByText(demoEmail)).toBeVisible()
  await expect(page).not.toHaveURL(/\/login$/)
})
