import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCostLedgerExportResponse } from './export'

test('cost-ledger export parses the presigned download response payload', async () => {
  const response = {
    ok: true,
    json: async () => ({
      downloadUrl: 'https://downloads.targonglobal.com/cost-ledger.xlsx',
      filename: 'cost-ledger-2026-04-16.xlsx',
    }),
  }

  const result = await parseCostLedgerExportResponse(response as never)

  assert.deepEqual(result, {
    downloadUrl: 'https://downloads.targonglobal.com/cost-ledger.xlsx',
    filename: 'cost-ledger-2026-04-16.xlsx',
  })
})

test('cost-ledger export rejects a payload without a download url', async () => {
  const response = {
    ok: true,
    json: async () => ({
      filename: 'cost-ledger-2026-04-16.xlsx',
    }),
  }

  await assert.rejects(() => parseCostLedgerExportResponse(response as never), /download url/i)
})
