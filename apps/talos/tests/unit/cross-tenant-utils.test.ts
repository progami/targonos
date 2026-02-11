import assert from 'node:assert/strict'
import test from 'node:test'
import { isCrossTenantOverride } from '../../src/lib/tenant/cross-tenant-utils'

test('isCrossTenantOverride returns false when override header absent', () => {
  assert.equal(
    isCrossTenantOverride({
      tenantOverrideHeader: null,
      effectiveTenant: 'US',
      cookieTenant: 'UK',
    }),
    false
  )
})

test('isCrossTenantOverride returns false when override tenant matches cookie', () => {
  assert.equal(
    isCrossTenantOverride({
      tenantOverrideHeader: '1',
      effectiveTenant: 'UK',
      cookieTenant: 'UK',
    }),
    false
  )
})

test('isCrossTenantOverride returns true when override tenant differs from cookie', () => {
  assert.equal(
    isCrossTenantOverride({
      tenantOverrideHeader: '1',
      effectiveTenant: 'US',
      cookieTenant: 'UK',
    }),
    true
  )
})

test('isCrossTenantOverride returns true when cookie tenant is missing', () => {
  assert.equal(
    isCrossTenantOverride({
      tenantOverrideHeader: '1',
      effectiveTenant: 'US',
      cookieTenant: null,
    }),
    true
  )
})

test('isCrossTenantOverride returns true when effective tenant is missing', () => {
  assert.equal(
    isCrossTenantOverride({
      tenantOverrideHeader: '1',
      effectiveTenant: null,
      cookieTenant: 'UK',
    }),
    true
  )
})
