import type { Page } from '@playwright/test'

export const portalBaseUrl = 'http://127.0.0.1:3200'
export const talosBaseUrl = 'http://127.0.0.1:3201/operations/purchase-orders'
export const demoUsername = 'e2e-user'
export const demoPassword = 'e2e-pass'
export const demoEmail = 'e2e@targonglobal.com'

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function submitLogin(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="emailOrUsername"]', demoUsername)
  await page.fill('input[name="password"]', demoPassword)
  await page.waitForSelector('button.submit-button:not([disabled])', { timeout: 15_000 })
  await page.click('button.submit-button')
}
