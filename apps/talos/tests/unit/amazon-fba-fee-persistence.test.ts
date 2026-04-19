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
  const scriptChecks = [
    {
      relativePath: 'scripts/migrations/ensure-talos-tenant-schema.ts',
      bannedPatterns: [
        /buildRequiredColumnsCheck\('skus amazon fee columns', 'skus', \[\s*'amazon_category',\s*'amazon_size_tier',\s*'amazon_referral_fee_percent',\s*'amazon_fba_fulfillment_fee',\s*\]\)/m,
        /ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "amazon_fba_fulfillment_fee"/,
      ],
    },
    {
      relativePath: 'scripts/migrations/add-sku-batch-amazon-default-columns.ts',
      bannedPatterns: [
        /amazon_fba_fulfillment_fee/,
      ],
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
  }

  const schema = readFileSync(path.join(talosRoot, 'prisma/schema.prisma'), 'utf8')
  const skuBlock = schema.match(/model Sku \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.equal(
    skuBlock.includes('amazonFbaFulfillmentFee'),
    false,
    'Sku model still stores amazonFbaFulfillmentFee'
  )
})
