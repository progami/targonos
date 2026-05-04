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

describe('kairos auth', () => {
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
        sub: 'kairos-user-1',
        email: 'signals@targonglobal.com',
        name: 'Signals User',
      },
      authz: {
        version: 1,
        globalRoles: [],
        apps: {
          kairos: {
            departments: ['Product'],
            tenantMemberships: [],
          },
        },
      },
      activeTenant: null,
    })

    const { auth } = await import('@/lib/auth')
    const session = await auth()

    expect(session?.user?.id).toBe('kairos-user-1')
    expect(session?.user?.email).toBe('signals@targonglobal.com')
    expect((session as { authz?: unknown } | null)?.authz).toEqual({
      version: 1,
      globalRoles: [],
      apps: {
        kairos: {
          departments: ['Product'],
          tenantMemberships: [],
        },
      },
    })
    expect((session as { activeTenant?: unknown } | null)?.activeTenant).toBeNull()
    expect(readPortalConsumerSessionMock).toHaveBeenCalledTimes(1)
  })
})
