import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { AMAZON_WORKSPACE_TOOLS } from '../../src/lib/amazon/workspace'
import { buildMainNavigation, isNavigationItemActive } from '../../src/lib/navigation/main-nav'

const legacyPurchaseLabel = ['Purchase', 'Orders'].join(' ')
const legacyAmazonLabel = ['Amazon', 'Shipments'].join(' ')
const legacyPanelName = ['Amazon', 'Shipments', 'Panel'].join('')

test('amazon workspace exposes the live tool surfaces in Talos', () => {
  assert.deepEqual(
    AMAZON_WORKSPACE_TOOLS.map((tool) => tool.href),
    ['/amazon/fba-fee-discrepancies']
  )
  assert.deepEqual(
    AMAZON_WORKSPACE_TOOLS.map((tool) => tool.name),
    ['SKU Info']
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
  assert.deepEqual(
    amazonSection.items.map((item) => item.name),
    ['SKU Info']
  )

  const operationsSection = staffNavigation.find((section) => section.title === 'Operations')
  assert.ok(operationsSection)

  assert.equal(
    operationsSection.items.find((item) => item.href === '/operations/inbound')?.name,
    'Inbound'
  )
  assert.equal(
    operationsSection.items.find((item) => item.href === '/operations/outbound')?.name,
    'Outbound'
  )
  assert.equal(
    operationsSection.items.some((item) => item.name === legacyPurchaseLabel),
    false
  )
  assert.equal(
    operationsSection.items.some((item) => item.name === legacyAmazonLabel),
    false
  )
  assert.equal(
    operationsSection.items.some((item) => item.name === 'Outbound Orders'),
    false
  )
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

test('amazon SKU info page uses the current product label', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const pageSource = readFileSync(
    path.join(talosRoot, 'src/app/amazon/fba-fee-discrepancies/page.tsx'),
    'utf8'
  )

  assert.equal(pageSource.includes('title="SKU Info"'), true)
  assert.equal(pageSource.includes('title="FBA Fee Discrepancies"'), false)
})

test('operations outbound page renders outbound shipments only', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const pageSource = readFileSync(
    path.join(talosRoot, 'src/app/operations/outbound/page.tsx'),
    'utf8'
  )
  const panelSource = readFileSync(
    path.join(talosRoot, 'src/app/operations/outbound/outbound-panel.tsx'),
    'utf8'
  )

  assert.equal(pageSource.includes('OutboundPanel'), true)
  assert.equal(pageSource.includes('title="Outbound"'), true)
  assert.equal(panelSource.includes('/api/amazon/outbound-shipments'), true)
  assert.equal(pageSource.includes(legacyPanelName), false)
  assert.equal(pageSource.includes(`title="${legacyAmazonLabel}"`), false)
  assert.equal(pageSource.includes('OutboundOrdersPanel'), false)
  assert.equal(pageSource.includes('/api/outbound-orders'), false)
  assert.equal(pageSource.includes('New Outbound Order'), false)
  assert.equal(pageSource.includes('PageTabs'), false)
  assert.equal(pageSource.includes('STATUS_CONFIGS'), false)
  assert.equal(pageSource.includes('activeTab'), false)
})
