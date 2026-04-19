import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const talosRoot = path.resolve(__dirname, '..', '..')

test('Talos does not persist Amazon FBA fee snapshots on SKUs', () => {
  const sourceFiles = [
    'src/app/api/skus/route.ts',
    'src/app/api/amazon/import-skus/route.ts',
    'src/app/config/products/skus-panel.tsx',
  ]

  for (const relativePath of sourceFiles) {
    const source = readFileSync(path.join(talosRoot, relativePath), 'utf8')
    assert.equal(
      source.includes('amazonFbaFulfillmentFee'),
      false,
      `${relativePath} still persists or exposes amazonFbaFulfillmentFee`
    )
  }

  const schema = readFileSync(path.join(talosRoot, 'prisma/schema.prisma'), 'utf8')
  const skuBlock = schema.match(/model Sku \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.equal(
    skuBlock.includes('amazonFbaFulfillmentFee'),
    false,
    'Sku model still stores amazonFbaFulfillmentFee'
  )
})
