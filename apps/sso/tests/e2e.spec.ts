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
  await expect(page.getByText('Control plane')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible()
  await expect(page.getByText('Assigned workspaces')).toHaveCount(0)
  await expect(page.getByText('Operating lanes')).toHaveCount(0)
  await expect(page.getByText('Run the systems behind Targon.')).toHaveCount(0)
  await expect(page.getByText('Warehouse Management System & Inventory Ledger')).toBeVisible()
  await expect(page.getByText('AI Sales Forecasting')).toBeVisible()
  await expect(page.getByText('Cross planning between Sales, Ops and Finance')).toBeVisible()
  await expect(page.getByText('Home of Targon')).toBeVisible()
  await expect(page.getByText('E-commerce Catalogue Monitoring')).toBeVisible()
  await expect(page.getByText('Amazon Automated Buyer Seller Messaging')).toBeVisible()
  await expect(page.getByText('Human Resource Management System')).toBeVisible()
  await expect(page.getByText('Settlement Controller')).toBeVisible()
  await expect(page.getByText('Warehouse control for inbound flow')).toHaveCount(0)
  await expect(page.getByText('Receiving, outbound flow')).toHaveCount(0)
  await expect(page.getByText('Open public surface')).toHaveCount(0)
  await expect(page.getByText('Workspaces by function')).toHaveCount(0)
  await expect(page.getByText('Grouped by operating area.')).toHaveCount(0)
  await expect(page.getByText('Ops', { exact: true })).toBeVisible()
  await expect(page.getByText('Welcome back', { exact: false })).toHaveCount(0)
  await expect(page.getByText(demoEmail)).toBeVisible()
  await expect(page.getByText('worktree.dev@targonglobal.com')).toHaveCount(0)
  await expect(page).not.toHaveURL(/\/login$/)
})
