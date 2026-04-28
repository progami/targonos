import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const talosRoot = path.resolve(__dirname, '..', '..')

function readTalosFile(relativePath: string): string {
  return readFileSync(path.join(talosRoot, relativePath), 'utf8')
}

test('operations routes use inbound and outbound domain names', () => {
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/inbound/page.tsx')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/inbound/new/page.tsx')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/inbound/[id]/page.tsx')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/outbound/page.tsx')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/outbound/outbound-panel.tsx')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/purchase-orders/page.tsx')), false)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/operations/fulfillment-orders/page.tsx')), false)
})

test('active Talos navigation no longer exposes purchase order or Amazon shipment labels', () => {
  const navigation = readTalosFile('src/lib/navigation/main-nav.ts')
  const breadcrumb = readTalosFile('src/components/ui/breadcrumb.tsx')
  const legacyPurchaseLabel = ['Purchase', 'Orders'].join(' ')
  const legacyAmazonLabel = ['Amazon', 'Shipments'].join(' ')

  assert.equal(navigation.includes("createItem('Inbound', '/operations/inbound'"), true)
  assert.equal(navigation.includes("createItem('Outbound', '/operations/outbound'"), true)
  assert.equal(navigation.includes(legacyPurchaseLabel), false)
  assert.equal(navigation.includes(legacyAmazonLabel), false)
  assert.equal(breadcrumb.includes("['/operations/inbound', 'Inbound']"), true)
  assert.equal(breadcrumb.includes("['/operations/outbound', 'Outbound']"), true)
  assert.equal(breadcrumb.includes(legacyAmazonLabel), false)
})

test('active APIs use inbound and outbound paths', () => {
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/inbound/route.ts')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/amazon/outbound-shipments/route.ts')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/amazon/outbound-shipments/[shipmentId]/route.ts')), true)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/purchase-orders/route.ts')), false)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/amazon/inbound-shipments/route.ts')), false)
  assert.equal(existsSync(path.join(talosRoot, 'src/app/api/fulfillment-orders/route.ts')), false)
})

test('Prisma schema maps the renamed inbound and outbound database tables and columns', () => {
  const schema = readTalosFile('prisma/schema.prisma')
  const legacyModelName = ['model', ['Purchase', 'Order'].join('')].join(' ') + ' '
  const legacyOutboundModelName = ['model', ['Fulfillment', 'Order'].join('')].join(' ') + ' '
  const legacyTableMap = ['purchase', 'orders'].join('_')
  const legacyOutboundTableMap = ['fulfillment', 'orders'].join('_')
  const legacyColumnMap = ['purchase', 'order', 'id'].join('_')
  const legacyOutboundColumnMap = ['fulfillment', 'order', 'id'].join('_')

  assert.equal(schema.includes('model InboundOrder '), true)
  assert.equal(schema.includes('model OutboundOrder '), true)
  assert.equal(schema.includes('@@map("inbound_orders")'), true)
  assert.equal(schema.includes('@@map("outbound_orders")'), true)
  assert.equal(schema.includes('@map("inbound_order_id")'), true)
  assert.equal(schema.includes('@map("outbound_order_id")'), true)
  assert.equal(schema.includes(legacyModelName), false)
  assert.equal(schema.includes(legacyOutboundModelName), false)
  assert.equal(schema.includes(`@@map("${legacyTableMap}")`), false)
  assert.equal(schema.includes(`@@map("${legacyOutboundTableMap}")`), false)
  assert.equal(schema.includes(`@map("${legacyColumnMap}")`), false)
  assert.equal(schema.includes(`@map("${legacyOutboundColumnMap}")`), false)
})
