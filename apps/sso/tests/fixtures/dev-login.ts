import type { Page } from '@playwright/test'
import { encode } from 'next-auth/jwt'

export const portalBaseUrl = 'http://127.0.0.1:3320'
export const talosBaseUrl = 'http://localhost:3321/operations/inbound'
export const demoEmail = 'e2e@targonglobal.com'
export const sessionCookieName = 'targon.next-auth.session-token'
const portalAuthSecret = 'playwright-portal-auth-secret-000000000000'

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

export function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function seedPortalSession(page: Page) {
  const authz = buildPortalAuthz()
  const token = await encode({
    token: {
      sub: 'e2e-portal-user',
      email: demoEmail,
      name: 'E2E Portal User',
      authz,
      roles: authz.apps,
      globalRoles: authz.globalRoles,
      authzVersion: authz.version,
      apps: Object.keys(authz.apps),
      activeTenant: 'US',
    },
    secret: portalAuthSecret,
    salt: sessionCookieName,
  })

  await page.context().clearCookies()
  await page.context().addCookies([
    {
      name: sessionCookieName,
      value: token,
      url: portalBaseUrl,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}
