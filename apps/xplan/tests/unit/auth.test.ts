import { afterEach, describe, expect, it, vi } from 'vitest'

const headersMock = vi.fn()
const readPortalConsumerSessionMock = vi.fn()

vi.mock('next/headers', () => ({
  headers: headersMock,
}))

vi.mock('@targon/auth', () => ({
  getWorktreeDevSession: vi.fn(),
  readPortalConsumerSession: readPortalConsumerSessionMock,
  withSharedAuth: vi.fn(),
}))

describe('xplan auth', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    headersMock.mockReset()
    readPortalConsumerSessionMock.mockReset()
  })

  it('returns null when the portal cookie is missing', async () => {
    vi.stubEnv('PORTAL_AUTH_SECRET', 'test-portal-auth-secret-000000000000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-portal-auth-secret-000000000000')
    headersMock.mockResolvedValue(new Headers())
    readPortalConsumerSessionMock.mockResolvedValue(null)

    const { auth } = await import('@/lib/auth')

    await expect(auth()).resolves.toBeNull()
  })

  it('returns claims from the shared portal cookie', async () => {
    vi.stubEnv('PORTAL_AUTH_SECRET', 'test-portal-auth-secret-000000000000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-portal-auth-secret-000000000000')
    headersMock.mockResolvedValue(new Headers({
      cookie: '__Secure-next-auth.session-token=token-value',
    }))
    readPortalConsumerSessionMock.mockResolvedValue({
      payload: {
        sub: 'xplan-user-1',
        email: 'planner@targonglobal.com',
        name: 'Planner User',
      },
      authz: {
        version: 1,
        globalRoles: ['platform_admin'],
        apps: {
          xplan: {
            departments: ['Admin'],
            tenantMemberships: [],
          },
        },
      },
      activeTenant: null,
    })

    const { auth } = await import('@/lib/auth')
    const session = await auth()

    expect(session?.user?.id).toBe('xplan-user-1')
    expect(session?.user?.email).toBe('planner@targonglobal.com')
    expect((session as { authz?: unknown } | null)?.authz).toEqual({
      version: 1,
      globalRoles: ['platform_admin'],
      apps: {
        xplan: {
          departments: ['Admin'],
          tenantMemberships: [],
        },
      },
    })
    expect((session as { activeTenant?: unknown } | null)?.activeTenant).toBeNull()
    expect(readPortalConsumerSessionMock).toHaveBeenCalledTimes(1)
  })
})
