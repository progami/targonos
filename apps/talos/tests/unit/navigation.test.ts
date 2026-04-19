import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { AMAZON_WORKSPACE_TOOLS } from '../../src/lib/amazon/workspace'
import { buildMainNavigation, isNavigationItemActive } from '../../src/lib/navigation/main-nav'

test('amazon workspace exposes the live tool surfaces in Talos', () => {
  assert.deepEqual(
    AMAZON_WORKSPACE_TOOLS.map((tool) => tool.href),
    ['/amazon/fba-fee-discrepancies']
  )

  assert.equal(AMAZON_WORKSPACE_TOOLS.some((tool) => tool.href === '/amazon'), false)
  assert.equal(AMAZON_WORKSPACE_TOOLS.some((tool) => tool.href === '/market/shipment-planning'), false)
})

test('main navigation surfaces live Talos pages and keeps super-admin routes gated', () => {
  const staffNavigation = buildMainNavigation({
    isPlatformAdmin: false,
  })

  const amazonSection = staffNavigation.find((section) => section.title === 'Amazon')
  assert.ok(amazonSection)
  assert.deepEqual(
    amazonSection.items.map((item) => item.href),
    ['/amazon/fba-fee-discrepancies']
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

test('navigation matching keeps the live Amazon tool highlighted', () => {
  assert.equal(
    isNavigationItemActive('/amazon/fba-fee-discrepancies', {
      href: '/amazon/fba-fee-discrepancies',
      matchMode: 'prefix',
    }),
    true
  )

  assert.equal(
    isNavigationItemActive('/amazon/fba-fee-tables', {
      href: '/amazon/fba-fee-discrepancies',
      matchMode: 'prefix',
    }),
    false
  )
})

test('talos no longer ships the FBA fee tables page or SKU link', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const pagePath = path.join(talosRoot, 'src/app/amazon/fba-fee-tables/page.tsx')
  const skusPanelSource = readFileSync(
    path.join(talosRoot, 'src/app/config/products/skus-panel.tsx'),
    'utf8'
  )

  assert.equal(
    existsSync(pagePath),
    false,
    'FBA fee tables page should be removed from Talos'
  )
  assert.equal(
    skusPanelSource.includes('/amazon/fba-fee-tables'),
    false,
    'SKU panel should not link to the removed FBA fee tables page'
  )
})
