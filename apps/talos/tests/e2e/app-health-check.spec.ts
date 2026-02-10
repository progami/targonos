import { test, expect } from '@playwright/test'

test.describe('Health Check', () => {
  test('API health endpoint responds', async ({ request }) => {
    const baseUrl = process.env.BASE_URL
    const basePath = baseUrl ? new URL(baseUrl).pathname.replace(/\/$/, '') : ''
    const response = await request.get(`${basePath}/api/health`)
    expect(response.ok()).toBeTruthy()
  })
})
