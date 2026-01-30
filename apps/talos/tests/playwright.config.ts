import { defineConfig, devices } from '@playwright/test';

const defaultPort = Number(process.env.PORT ?? '3001');
const basePath = process.env.BASE_PATH ?? '';
const defaultHost = process.env.HOST || 'localhost';
const defaultProtocol = process.env.PROTOCOL || 'http';
const fallbackBaseUrl = `${defaultProtocol}://${defaultHost}:${defaultPort}${basePath}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 5,
  reporter: [
    ['html', { outputFolder: './playwright-report' }],
    ['junit', { outputFile: './playwright-results.xml' }],
    ['list']
  ],
  use: {
    baseURL: process.env.BASE_URL || fallbackBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    port: defaultPort,
    timeout: 120 * 1000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      USE_TEST_AUTH: process.env.USE_TEST_AUTH || 'true',
      NODE_ENV: process.env.NODE_ENV || 'test',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || fallbackBaseUrl,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'test-secret-for-e2e-tests',
      DATABASE_URL: process.env.DATABASE_URL,
      PORT: String(defaultPort),
    },
  },
});
