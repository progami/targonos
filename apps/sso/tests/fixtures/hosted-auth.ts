import fs from 'node:fs'
import path from 'node:path'

import { expect, type Page, type Response } from '@playwright/test'
import { encode } from 'next-auth/jwt'

type CriticalResponseRecord = {
  method: string
  resourceType: string
  status: number
  url: string
}

const criticalStatusCodes = new Set([401, 403, 500, 502])
const trackedResourceTypes = new Set(['document', 'fetch', 'xhr'])
const hostedErrorMarkers = [
  'Bad gateway',
  'Error code 502',
  "Unexpected token '<'",
] as const

function requireEnv(name: string): string {
  const value = process.env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined for hosted portal smoke tests.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined for hosted portal smoke tests.`)
  }

  return trimmed
}

function getHostedPortalBaseUrl() {
  return requireEnv('PORTAL_BASE_URL')
}

function getHostedPortalOrigin() {
  return new URL(getHostedPortalBaseUrl()).origin
}

function buildPortalAuthz() {
  return {
    version: 1,
    globalRoles: ['platform_admin'],
    apps: {
      talos: { departments: ['Ops'], tenantMemberships: ['US', 'UK'] },
      atlas: { departments: ['People Ops'], tenantMemberships: ['US', 'UK'] },
      website: { departments: [], tenantMemberships: [] },
      kairos: { departments: ['Product'], tenantMemberships: [] },
      xplan: { departments: ['Product'], tenantMemberships: [] },
      plutus: { departments: ['Finance'], tenantMemberships: [] },
      hermes: { departments: ['Account / Listing'], tenantMemberships: [] },
      argus: { departments: ['Account / Listing'], tenantMemberships: [] },
    },
  }
}

function buildScreenshotDirectory(): string {
  const portalHost = new URL(getHostedPortalBaseUrl()).hostname
  const outputDir = path.join(process.cwd(), '.codex-artifacts', 'hosted-smoke', portalHost)
  fs.mkdirSync(outputDir, { recursive: true })
  return outputDir
}

async function buildSessionCookie(portalBaseUrl: string) {
  const authz = buildPortalAuthz()
  const sessionCookieName = '__Secure-next-auth.session-token'
  const secret = requireEnv('NEXTAUTH_SECRET')
  const activeTenant = requireEnv('E2E_ACTIVE_TENANT')
  const domain = new URL(portalBaseUrl).hostname
  const token = await encode({
    token: {
      sub: requireEnv('E2E_PORTAL_USER_ID'),
      email: requireEnv('E2E_PORTAL_EMAIL'),
      name: requireEnv('E2E_PORTAL_NAME'),
      authz,
      roles: authz.apps,
      globalRoles: authz.globalRoles,
      authzVersion: authz.version,
      apps: Object.keys(authz.apps),
      activeTenant,
    },
    secret,
    salt: sessionCookieName,
  })

  return {
    name: sessionCookieName,
    value: token,
    domain,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  }
}

async function buildActiveTenantCookie(portalBaseUrl: string) {
  const appId = 'talos'
  const cookieName = `__Secure-targon.active-tenant.${appId}`
  const secret = requireEnv('NEXTAUTH_SECRET')
  const domain = new URL(portalBaseUrl).hostname
  const value = await encode({
    token: { activeTenant: requireEnv('E2E_ACTIVE_TENANT') },
    secret,
    salt: cookieName,
  })

  return {
    name: cookieName,
    value,
    domain,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  }
}

function buildTalosTenantCookie(portalBaseUrl: string) {
  return {
    name: 'talos-tenant',
    value: requireEnv('E2E_ACTIVE_TENANT'),
    domain: new URL(portalBaseUrl).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
  }
}

export async function loginToHostedPortal(page: Page) {
  const context = page.context()
  await context.clearCookies()
  await context.addCookies([
    await buildSessionCookie(getHostedPortalBaseUrl()),
    await buildActiveTenantCookie(getHostedPortalBaseUrl()),
    buildTalosTenantCookie(getHostedPortalBaseUrl()),
  ])
  await page.goto(`${getHostedPortalBaseUrl()}/`, { waitUntil: 'domcontentloaded' })
}

export function hostedScreenshotPath(routeName: string): string {
  return path.join(buildScreenshotDirectory(), `${routeName}.png`)
}

export function hostedRoute(pathname: string): string {
  return new URL(pathname, getHostedPortalBaseUrl()).toString()
}

export function hostedPortalBaseUrl() {
  return getHostedPortalBaseUrl()
}

export function hostedVersionBadge(page: Page) {
  return page.getByRole('link', { name: /v\d+\.\d+\.\d+/i }).first()
}

export async function assertHostedVersionBadge(page: Page) {
  await expect(hostedVersionBadge(page)).toBeVisible({ timeout: 20_000 })
}

export async function assertNoHostedErrorMarkers(page: Page) {
  const bodyText = await page.locator('body').innerText()
  for (const marker of hostedErrorMarkers) {
    expect(bodyText).not.toContain(marker)
  }
}

export async function assertNoHostedAuthRedirect(page: Page) {
  const currentUrl = page.url()
  expect(currentUrl).not.toContain('/login')
  expect(currentUrl).not.toContain('/no-access')
}

export function installHostedResponseTracker(page: Page) {
  const criticalResponses: CriticalResponseRecord[] = []

  const handleResponse = (response: Response) => {
    const request = response.request()
    const resourceType = request.resourceType()
    if (!trackedResourceTypes.has(resourceType)) {
      return
    }

    const responseUrl = new URL(response.url())
    if (responseUrl.origin !== getHostedPortalOrigin()) {
      return
    }

    const status = response.status()
    if (!criticalStatusCodes.has(status)) {
      return
    }

    criticalResponses.push({
      method: request.method(),
      resourceType,
      status,
      url: response.url(),
    })
  }

  page.on('response', handleResponse)

  return {
    assertNone() {
      expect(
        criticalResponses,
        `Hosted app returned critical responses: ${JSON.stringify(criticalResponses, null, 2)}`,
      ).toEqual([])
    },
    reset() {
      criticalResponses.length = 0
    },
    dispose() {
      page.off('response', handleResponse)
    },
  }
}
