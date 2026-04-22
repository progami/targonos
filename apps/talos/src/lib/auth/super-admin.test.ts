import assert from 'node:assert/strict'
import test from 'node:test'

test.afterEach(() => {
  delete process.env.TALOS_SUPER_ADMIN_EMAILS
})

test('isSuperAdmin includes emails configured through TALOS_SUPER_ADMIN_EMAILS', async () => {
  process.env.TALOS_SUPER_ADMIN_EMAILS = 'worktree.dev@targonglobal.com'

  const mod = await import(`./super-admin?case=${Date.now()}`)

  assert.equal(mod.isSuperAdmin('worktree.dev@targonglobal.com'), true)
  assert.equal(mod.isSuperAdmin('jarrar@targonglobal.com'), true)
  assert.equal(mod.isSuperAdmin('ops@targonglobal.com'), false)
})
