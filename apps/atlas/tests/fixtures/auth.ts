import type { Page } from '@playwright/test'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} must be defined for Atlas e2e tests.`)
  }
  return value
}

export const portalBaseUrl = requireEnv('NEXT_PUBLIC_PORTAL_AUTH_URL')
export const atlasBaseUrl = requireEnv('NEXT_PUBLIC_APP_URL')

export async function loginToAtlas(page: Page) {
  await page.goto(`${portalBaseUrl}/login?callbackUrl=${encodeURIComponent(atlasBaseUrl)}`, {
    waitUntil: 'domcontentloaded',
  })

  // Portal now defaults to Google SSO; password login is not always available.
  // If the password form is not present, return false and let tests decide whether to skip.
  try {
    await page.waitForSelector('input[name="emailOrUsername"]', { timeout: 2_000 })
  } catch {
    return false
  }

  const demoUsername = process.env.E2E_USERNAME
  const demoPass = process.env.E2E_PASSWORD
  if (!demoUsername || !demoPass) {
    return false
  }

  await page.fill('input[name="emailOrUsername"]', demoUsername)
  await page.fill('input[name="password"]', demoPass)
  await page.waitForSelector('button.submit-button:not([disabled])', { timeout: 15_000 })
  await page.click('button.submit-button')

  // Stabilize redirect/cookie propagation.
  await page.waitForTimeout(300)
  await page.goto(atlasBaseUrl, { waitUntil: 'domcontentloaded' })

  return true
}
