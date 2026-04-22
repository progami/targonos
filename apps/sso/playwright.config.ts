import { defineConfig } from '@playwright/test'

const localPortalBaseUrl = 'http://127.0.0.1:3320'
const localPortalAuthSecret = 'playwright-portal-auth-secret-000000000000'
const runHostedSmokeOnly = process.env.PLAYWRIGHT_HOSTED_ONLY === '1'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: runHostedSmokeOnly
    ? undefined
    : [
      {
        command: 'pnpm exec next dev -p 3320 --hostname 127.0.0.1',
        cwd: __dirname,
        url: `${localPortalBaseUrl}/login`,
        reuseExistingServer: false,
        env: {
          ...process.env,
          NEXTAUTH_URL: localPortalBaseUrl,
          PORTAL_AUTH_URL: localPortalBaseUrl,
          NEXT_PUBLIC_PORTAL_AUTH_URL: localPortalBaseUrl,
          NEXT_PUBLIC_APP_URL: localPortalBaseUrl,
          COOKIE_DOMAIN: '127.0.0.1',
          NEXTAUTH_SECRET: localPortalAuthSecret,
          PORTAL_AUTH_SECRET: localPortalAuthSecret,
          TARGON_WORKTREE_DEV_AUTH: '',
          TARGON_WORKTREE_DEV_USER_ID: '',
          TARGON_WORKTREE_DEV_USER_EMAIL: '',
          TARGON_WORKTREE_DEV_USER_NAME: '',
          TARGON_WORKTREE_DEV_AUTHZ_JSON: '',
          PORTAL_DB_URL: '',
          GOOGLE_CLIENT_ID: 'playwright-google-client-id',
          GOOGLE_CLIENT_SECRET: 'playwright-google-client-secret',
        },
      },
      {
        command: 'node tests/fixtures/callback-target-server.mjs',
        cwd: __dirname,
        url: 'http://127.0.0.1:3321/operations/purchase-orders',
        reuseExistingServer: false,
      },
    ],
})
