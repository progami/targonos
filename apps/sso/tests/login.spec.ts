import { test, expect } from '@playwright/test'
import { encode } from 'next-auth/jwt'

import { buildExpiredAuthCookieHeaders } from '../lib/auth-cookie-clear'
import { portalBaseUrl, sessionCookieName } from './fixtures/dev-login'

const staleSessionSecret = 'playwright-stale-session-secret-111111111111'

test('portal login only offers Google sign-in', async ({ page }) => {
  await page.goto(`${portalBaseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('input[name="emailOrUsername"]')).toHaveCount(0)
  await expect(page.locator('input[name="password"]')).toHaveCount(0)
})

test('portal login preserves the requested callback target for Google sign-in', async ({ page }) => {
  const callbackUrl = '/argus/wpr'

  await page.goto(
    `${portalBaseUrl}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    { waitUntil: 'domcontentloaded' },
  )

  await expect(page.locator('input[name="callbackUrl"]')).toHaveValue(callbackUrl)
})

test('portal recovers from a stale encrypted session cookie and still redirects to Google auth', async ({ page }) => {
  const staleToken = await encode({
    token: {
      sub: 'stale-e2e-user',
      email: 'stale-e2e@targonglobal.com',
      name: 'Stale E2E User',
    },
    secret: staleSessionSecret,
    salt: sessionCookieName,
  })

  await page.context().clearCookies()
  await page.context().addCookies([
    {
      name: sessionCookieName,
      value: staleToken,
      url: portalBaseUrl,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])

  const response = await page.request.get(
    `${portalBaseUrl}/login/google?callbackUrl=${encodeURIComponent('/talos/operations/purchase-orders')}`,
    {
      maxRedirects: 0,
    },
  )

  expect(response.status()).toBe(307)
  expect(response.headers().location).toContain('https://accounts.google.com/o/oauth2/v2/auth')

  const setCookieHeader = response.headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value)
    .join('\n')

  expect(setCookieHeader).toContain('authjs.pkce.code_verifier=')

  const sessionResponse = await page.request.get(`${portalBaseUrl}/api/auth/session`)

  expect(sessionResponse.status()).toBe(200)
  expect(await sessionResponse.json()).toBe(null)

  const sessionSetCookieHeader = sessionResponse.headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value)
    .join('\n')

  expect(sessionSetCookieHeader).toContain(`${sessionCookieName}=;`)
})

test('auth cleanup clears legacy parent-domain session cookies', () => {
  const headers = buildExpiredAuthCookieHeaders({
    cookieDomain: '.os.targonglobal.com',
    requestCookieNames: ['__Secure-next-auth.session-token'],
  })

  const matchingHeaders = headers.filter((header) => header.startsWith('__Secure-next-auth.session-token=;'))

  expect(matchingHeaders).toContain(
    '__Secure-next-auth.session-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  )
  expect(matchingHeaders).toContain(
    '__Secure-next-auth.session-token=; Domain=.os.targonglobal.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  )
  expect(matchingHeaders).toContain(
    '__Secure-next-auth.session-token=; Domain=.targonglobal.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
  )
})
