import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

import { getPortalAuthPrisma } from './db'
import { getUserAuthz, upsertManualUserAppGrant } from './user-service'

test('manual app grants round-trip tenant memberships and preserve omission on update', async () => {
  if (!process.env.PORTAL_DB_URL) {
    throw new Error('PORTAL_DB_URL must be defined for auth integration tests.')
  }

  const prisma = getPortalAuthPrisma()
  const token = crypto.randomUUID()
  const email = `auth-integration-${token}@targonglobal.com`
  const appSlug = `auth-integration-${token}`

  const user = await prisma.user.create({
    data: {
      email,
      username: null,
      passwordHash: 'integration-test-password-hash',
      firstName: 'Auth',
      lastName: 'Integration',
      isActive: true,
      isDemo: false,
    },
    select: { id: true },
  })

  try {
    await upsertManualUserAppGrant({
      userId: user.id,
      appSlug,
      appName: 'Auth Integration',
      departments: ['Ops'],
      tenantMemberships: ['UK', 'US'],
      locked: true,
    })

    let authz = await getUserAuthz(user.id)
    assert.deepEqual(authz.apps[appSlug], {
      departments: ['Ops'],
      tenantMemberships: ['UK', 'US'],
    })

    await upsertManualUserAppGrant({
      userId: user.id,
      appSlug,
      departments: ['Ops'],
      locked: true,
    })

    authz = await getUserAuthz(user.id)
    assert.deepEqual(authz.apps[appSlug], {
      departments: ['Ops'],
      tenantMemberships: ['UK', 'US'],
    })

    await upsertManualUserAppGrant({
      userId: user.id,
      appSlug,
      departments: ['Ops'],
      tenantMemberships: [],
      locked: true,
    })

    authz = await getUserAuthz(user.id)
    assert.deepEqual(authz.apps[appSlug], {
      departments: ['Ops'],
      tenantMemberships: [],
    })
  } finally {
    await prisma.userApp.deleteMany({
      where: { userId: user.id },
    })
    await prisma.app.deleteMany({
      where: { slug: appSlug },
    })
    await prisma.user.delete({
      where: { id: user.id },
    })
  }
})
