import assert from 'node:assert/strict'
import test from 'node:test'

import { AMAZON_WORKSPACE_TOOLS } from '../../src/lib/amazon/workspace'
import { buildMainNavigation, isNavigationItemActive } from '../../src/lib/navigation/main-nav'

test('amazon workspace exposes the live tool surfaces in Talos', () => {
  assert.deepEqual(
    AMAZON_WORKSPACE_TOOLS.map((tool) => tool.href),
    [
      '/amazon/fba-fee-discrepancies',
      '/amazon/fba-fee-tables',
      '/market/shipment-planning',
    ]
  )

  assert.equal(AMAZON_WORKSPACE_TOOLS.some((tool) => tool.href === '/amazon'), false)
})

test('main navigation surfaces live Talos pages and keeps super-admin routes gated', () => {
  const staffNavigation = buildMainNavigation({
    isPlatformAdmin: false,
  })

  const amazonSection = staffNavigation.find((section) => section.title === 'Amazon')
  assert.ok(amazonSection)
  assert.deepEqual(
    amazonSection.items.map((item) => item.href),
    [
      '/amazon/fba-fee-discrepancies',
      '/amazon/fba-fee-tables',
      '/market/shipment-planning',
    ]
  )

  const operationsSection = staffNavigation.find((section) => section.title === 'Operations')
  assert.ok(operationsSection)
  assert.ok(
    operationsSection.items.some((item) => item.href === '/operations/storage-ledger')
  )

  const configurationSection = staffNavigation.find((section) => section.title === 'Configuration')
  assert.ok(configurationSection)
  assert.equal(
    configurationSection.items.some((item) => item.href === '/config/permissions'),
    false
  )

  const superAdminNavigation = buildMainNavigation({
    isPlatformAdmin: true,
  })
  const superAdminConfiguration = superAdminNavigation.find(
    (section) => section.title === 'Configuration'
  )
  assert.ok(superAdminConfiguration)
  assert.equal(
    superAdminConfiguration.items.some((item) => item.href === '/config/permissions'),
    true
  )
})

test('navigation matching keeps the live Amazon tools highlighted', () => {
  assert.equal(
    isNavigationItemActive('/amazon/fba-fee-tables', {
      href: '/amazon/fba-fee-tables',
      matchMode: 'prefix',
    }),
    true
  )

  assert.equal(
    isNavigationItemActive('/operations/purchase-orders/123', {
      href: '/operations/purchase-orders',
      matchMode: 'prefix',
    }),
    true
  )
})
