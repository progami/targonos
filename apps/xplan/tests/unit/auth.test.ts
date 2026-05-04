import { afterEach, describe, expect, it, vi } from 'vitest'

const getWorktreeDevSessionMock = vi.fn()
const withSharedAuthMock = vi.fn()
const nextAuthMock = vi.fn()
const nextAuthAuthMock = vi.fn()

vi.mock('@targon/auth', () => ({
  getWorktreeDevSession: getWorktreeDevSessionMock,
  withSharedAuth: withSharedAuthMock,
}))

vi.mock('next-auth', () => ({
  default: nextAuthMock,
}))

describe('xplan auth', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    getWorktreeDevSessionMock.mockReset()
    withSharedAuthMock.mockReset()
    nextAuthMock.mockReset()
    nextAuthAuthMock.mockReset()
  })

  it('returns the worktree dev session before initializing next-auth', async () => {
    const worktreeSession = {
      expires: '2026-04-22T00:00:00.000Z',
      user: {
        id: 'xplan-user-1',
        email: 'planner@targonglobal.com',
        name: 'Planner User',
      },
    }

    getWorktreeDevSessionMock.mockResolvedValue(worktreeSession)

    const { auth } = await import('@/lib/auth')
    const session = await auth()

    expect(session).toEqual(worktreeSession)
    expect(getWorktreeDevSessionMock).toHaveBeenCalledWith('xplan')
    expect(nextAuthMock).not.toHaveBeenCalled()
  })

  it('falls back to next-auth when no worktree dev session exists', async () => {
    vi.stubEnv('COOKIE_DOMAIN', '.targonglobal.com')
    vi.stubEnv('NEXTAUTH_URL', 'https://os.targonglobal.com/xplan')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://os.targonglobal.com/xplan')
    vi.stubEnv('PORTAL_AUTH_URL', 'https://os.targonglobal.com')
    vi.stubEnv('NEXT_PUBLIC_PORTAL_AUTH_URL', 'https://os.targonglobal.com')
    vi.stubEnv('PORTAL_AUTH_SECRET', 'test-portal-auth-secret-000000000000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-portal-auth-secret-000000000000')

    const nextAuthSession = {
      expires: '2026-04-22T00:00:00.000Z',
      user: {
        id: 'xplan-user-2',
        email: 'ops@targonglobal.com',
        name: 'Ops User',
      },
      authz: {
        version: 1,
        globalRoles: ['platform_admin'],
      },
      activeTenant: null,
    }

    getWorktreeDevSessionMock.mockResolvedValue(null)
    withSharedAuthMock.mockImplementation((baseConfig) => baseConfig)
    nextAuthAuthMock.mockResolvedValue(nextAuthSession)
    nextAuthMock.mockReturnValue({
      auth: nextAuthAuthMock,
      handlers: {
        GET: vi.fn(),
        POST: vi.fn(),
      },
    })

    const { auth } = await import('@/lib/auth')
    const session = await auth()

    expect(session).toEqual(nextAuthSession)
    expect(getWorktreeDevSessionMock).toHaveBeenCalledWith('xplan')
    expect(withSharedAuthMock).toHaveBeenCalledTimes(1)
    expect(withSharedAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trustHost: true,
        providers: [],
        secret: 'test-portal-auth-secret-000000000000',
      }),
      {
        cookieDomain: '.targonglobal.com',
        appId: 'targon',
      },
    )
    expect(nextAuthMock).toHaveBeenCalledTimes(1)
    expect(nextAuthAuthMock).toHaveBeenCalledTimes(1)
  })

  it('maps authz apps into session roles when the token omits roles', async () => {
    vi.stubEnv('COOKIE_DOMAIN', '.targonglobal.com')
    vi.stubEnv('NEXTAUTH_URL', 'https://os.targonglobal.com/xplan')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://os.targonglobal.com/xplan')
    vi.stubEnv('PORTAL_AUTH_URL', 'https://os.targonglobal.com')
    vi.stubEnv('NEXT_PUBLIC_PORTAL_AUTH_URL', 'https://os.targonglobal.com')
    vi.stubEnv('PORTAL_AUTH_SECRET', 'test-portal-auth-secret-000000000000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-portal-auth-secret-000000000000')

    const tokenAuthz = {
      apps: {
        xplan: {
          departments: ['Admin'],
          tenantMemberships: [],
        },
      },
      globalRoles: ['platform_admin'],
      version: 7,
    }

    getWorktreeDevSessionMock.mockResolvedValue(null)
    withSharedAuthMock.mockImplementation((baseConfig) => baseConfig)
    nextAuthAuthMock.mockResolvedValue(null)
    nextAuthMock.mockReturnValue({
      auth: nextAuthAuthMock,
      handlers: {
        GET: vi.fn(),
        POST: vi.fn(),
      },
    })

    const { auth } = await import('@/lib/auth')
    await auth()

    const baseConfig = withSharedAuthMock.mock.calls[0]?.[0]
    expect(baseConfig).toBeDefined()

    const sessionCallback = baseConfig.callbacks?.session
    expect(sessionCallback).toBeTypeOf('function')

    const session = await sessionCallback({
      session: {
        expires: '2026-04-22T00:00:00.000Z',
        user: {
          id: '',
          email: 'planner@targonglobal.com',
          name: 'Planner User',
        },
      },
      token: {
        sub: 'xplan-user-1',
        authz: tokenAuthz,
      },
    })

    expect(session.user.id).toBe('xplan-user-1')
    expect((session as { authz?: unknown }).authz).toEqual(tokenAuthz)
    expect((session as { roles?: unknown }).roles).toEqual(tokenAuthz.apps)
    expect((session as { globalRoles?: unknown }).globalRoles).toEqual(tokenAuthz.globalRoles)
    expect((session as { authzVersion?: unknown }).authzVersion).toBe(tokenAuthz.version)
  })
})
