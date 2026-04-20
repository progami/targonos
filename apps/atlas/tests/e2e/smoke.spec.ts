import { test, expect } from '@playwright/test'
import { atlasBaseUrl, loginToAtlas } from '../fixtures/auth'

test('Atlas redirects to portal sign-in when signed out', async ({ page }) => {
  await page.goto(`${atlasBaseUrl}/tasks`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('TargonOS Portal')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
})

test('create and delete a task', async ({ page }) => {
  const loggedIn = await loginToAtlas(page)
  test.skip(!loggedIn, 'Portal uses Google SSO; password login not available for automation.')

  await page.goto(`${atlasBaseUrl}/tasks/add`, { waitUntil: 'domcontentloaded' })

  const title = `E2E Task ${Date.now()}`
  await page.fill('input[name="title"]', title)
  await page.click('button:has-text("Create Task")')

  await expect(page.getByText(title)).toBeVisible()

  await page.click('button:has-text("Delete")')
  await page.waitForURL(new RegExp(`${atlasBaseUrl.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}/tasks$`), { timeout: 15_000 })
})

test('tasks page loads (authenticated)', async ({ page }) => {
  const loggedIn = await loginToAtlas(page)
  test.skip(!loggedIn, 'Portal uses Google SSO; password login not available for automation.')

  await page.goto(`${atlasBaseUrl}/tasks`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Tasks', { exact: true })).toBeVisible()
})
