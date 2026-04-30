import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const talosRoot = path.resolve(__dirname, '..', '..')

test('Talos does not persist Amazon FBA fee snapshots on SKUs', () => {
  const sourceFiles = [
    'src/app/api/skus/route.ts',
    'src/app/api/skus/[id]/route.ts',
    'src/app/api/amazon/import-skus/route.ts',
  ]
  const scriptChecks = [
    {
      relativePath: 'scripts/migrations/ensure-talos-tenant-schema.ts',
      bannedPatterns: [
        /buildRequiredColumnsCheck\('skus amazon fee columns', 'skus', \[\s*'amazon_category',\s*'amazon_size_tier',\s*'amazon_referral_fee_percent',\s*'amazon_fba_fulfillment_fee',\s*\]\)/m,
        /ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_fba_fulfillment_fee"/,
      ],
      requiredPatterns: [
        /ALTER TABLE "skus" DROP COLUMN IF EXISTS "amazon_fba_fulfillment_fee"/,
        /ALTER TABLE IF EXISTS "sku_batches" DROP COLUMN IF EXISTS "amazon_fba_fulfillment_fee"/,
      ],
    },
    {
      relativePath: 'scripts/migrations/add-sku-batch-amazon-default-columns.ts',
      bannedPatterns: [/amazon_fba_fulfillment_fee/],
    },
    {
      relativePath: 'scripts/migrations/add-sku-amazon-reference-weight.ts',
      bannedPatterns: [
        /columnExists\(prisma, 'skus', 'amazon_fba_fulfillment_fee'\)/,
        /s\.amazon_fba_fulfillment_fee/,
      ],
    },
  ]

  for (const relativePath of sourceFiles) {
    const source = readFileSync(path.join(talosRoot, relativePath), 'utf8')
    assert.equal(
      source.includes('amazonFbaFulfillmentFee'),
      false,
      `${relativePath} still persists or exposes amazonFbaFulfillmentFee`
    )
  }

  for (const scriptCheck of scriptChecks) {
    const source = readFileSync(path.join(talosRoot, scriptCheck.relativePath), 'utf8')
    for (const bannedPattern of scriptCheck.bannedPatterns) {
      assert.equal(
        bannedPattern.test(source),
        false,
        `${scriptCheck.relativePath} still recreates or backfills skus.amazon_fba_fulfillment_fee`
      )
    }
    for (const requiredPattern of scriptCheck.requiredPatterns ?? []) {
      assert.equal(
        requiredPattern.test(source),
        true,
        `${scriptCheck.relativePath} no longer drops stale amazon_fba_fulfillment_fee columns during tenant-schema rollout`
      )
    }
  }

  const schema = readFileSync(path.join(talosRoot, 'prisma/schema.prisma'), 'utf8')
  const skuBlock = schema.match(/model Sku \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.equal(
    skuBlock.includes('amazonFbaFulfillmentFee'),
    false,
    'Sku model still stores amazonFbaFulfillmentFee'
  )
})

test('Talos no longer exposes local reference FBA fulfillment fee editing', () => {
  const skusRouteSource = readFileSync(path.join(talosRoot, 'src/app/api/skus/route.ts'), 'utf8')
  const skuDetailRouteSource = readFileSync(
    path.join(talosRoot, 'src/app/api/skus/[id]/route.ts'),
    'utf8'
  )
  const skuSelectSource = readFileSync(path.join(talosRoot, 'src/lib/skus/sku-select.ts'), 'utf8')

  assert.equal(
    existsSync(path.join(talosRoot, 'src/app/config/products/skus-panel.tsx')),
    false,
    'Products SKU panel should be removed so SKU Info is the only reference-editing surface'
  )
  assert.equal(
    skusRouteSource.includes('fbaFulfillmentFee'),
    false,
    '/api/skus should not accept or write local reference FBA fulfillment fees'
  )
  assert.equal(
    skuDetailRouteSource.includes('fbaFulfillmentFee'),
    false,
    '/api/skus/[id] should not expose local reference FBA fulfillment fees'
  )
  assert.equal(
    skuSelectSource.includes('fbaFulfillmentFee'),
    false,
    'SKU API response select should omit local reference FBA fulfillment fees'
  )
})
