import fs from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'

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

function requireSharedSecret(): string {
  const nextAuthSecret = process.env.NEXTAUTH_SECRET
  if (typeof nextAuthSecret === 'string' && nextAuthSecret.trim() !== '') {
    return nextAuthSecret.trim()
  }

  const portalAuthSecret = process.env.PORTAL_AUTH_SECRET
  if (typeof portalAuthSecret === 'string' && portalAuthSecret.trim() !== '') {
    return portalAuthSecret.trim()
  }

  throw new Error('NEXTAUTH_SECRET or PORTAL_AUTH_SECRET must be defined for hosted portal smoke tests.')
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
  const portalBaseUrl = requireEnv('PORTAL_BASE_URL')
  const portalHost = new URL(portalBaseUrl).hostname
  const outputDir = path.join(process.cwd(), '.codex-artifacts', 'hosted-smoke', portalHost)
  fs.mkdirSync(outputDir, { recursive: true })
  return outputDir
}

async function buildSessionCookie(portalBaseUrl: string) {
  const authz = buildPortalAuthz()
  const sessionCookieName = '__Secure-next-auth.session-token'
  const secret = requireSharedSecret()
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
  const secret = requireSharedSecret()
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
  const portalBaseUrl = requireEnv('PORTAL_BASE_URL')
  const context = page.context()
  await context.clearCookies()
  await context.addCookies([
    await buildSessionCookie(portalBaseUrl),
    await buildActiveTenantCookie(portalBaseUrl),
    buildTalosTenantCookie(portalBaseUrl),
  ])
  await page.goto(`${portalBaseUrl}/`, { waitUntil: 'domcontentloaded' })
}

export function hostedScreenshotPath(routeName: string): string {
  return path.join(buildScreenshotDirectory(), `${routeName}.png`)
}
