import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODULE_URL = pathToFileURL(path.resolve(process.cwd(), 'apps/talos/src/lib/auth/super-admin.ts')).href

test.afterEach(() => {
  delete process.env.TALOS_SUPER_ADMIN_EMAILS
})

test('isSuperAdmin includes emails configured through TALOS_SUPER_ADMIN_EMAILS', async () => {
  process.env.TALOS_SUPER_ADMIN_EMAILS = 'worktree.dev@targonglobal.com'

  const mod = await import(`${MODULE_URL}?case=${Date.now()}-${Math.random()}`)

  assert.equal(mod.isSuperAdmin('worktree.dev@targonglobal.com'), true)
  assert.equal(mod.isSuperAdmin('jarrar@targonglobal.com'), true)
  assert.equal(mod.isSuperAdmin('ops@targonglobal.com'), false)
})
