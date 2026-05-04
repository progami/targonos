import assert from 'node:assert/strict'
import test from 'node:test'

import type { PortalConsumerSession } from '@targon/auth'
import { TenantCode, UserRole } from '@targon/prisma-talos'

import { buildTalosSessionFromConsumerSession } from './consumer-session'

function createConsumerSession(): PortalConsumerSession {
  return {
    payload: {
      sub: 'portal-user-1',
      email: 'ops@targonglobal.com',
      name: 'Ops User',
      authz: {
        version: 3,
        globalRoles: ['platform_admin'],
        apps: {
          talos: {
            departments: ['Ops'],
            tenantMemberships: ['US', 'UK'],
          },
        },
      },
      roles: {
        talos: {
          departments: ['Ops'],
          tenantMemberships: ['US', 'UK'],
        },
      },
      globalRoles: ['platform_admin'],
      authzVersion: 3,
    },
    authz: {
      version: 3,
      globalRoles: ['platform_admin'],
      apps: {
        talos: {
          departments: ['Ops'],
          tenantMemberships: ['US', 'UK'],
        },
      },
    },
    activeTenant: null,
  }
}

test('buildTalosSessionFromConsumerSession enriches portal claims with tenant user data', async () => {
  const session = await buildTalosSessionFromConsumerSession({
    consumerSession: createConsumerSession(),
    resolveCurrentTenant: async () => TenantCode.UK,
    loadUser: async () => ({
      id: 'talos-user-1',
      role: UserRole.admin,
      region: TenantCode.UK,
      warehouseId: 'wh_1',
    }),
  })

  assert.equal(session.user.id, 'talos-user-1')
  assert.equal(session.user.email, 'ops@targonglobal.com')
  assert.equal(session.user.name, 'Ops User')
  assert.equal(session.user.role, UserRole.admin)
  assert.equal(session.user.region, TenantCode.UK)
  assert.equal(session.user.warehouseId, 'wh_1')
  assert.equal((session as { activeTenant?: unknown }).activeTenant, TenantCode.UK)
  assert.deepEqual((session as { authz?: unknown }).authz, createConsumerSession().authz)
})
