import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createManifestState, persistManifestReportId } from './collect-spapi.mjs'

test('createManifestState starts with the weekly defaults', () => {
  const sourceConfig = {
    market: 'uk',
    marketplaceId: 'A1F83G8C2ARO7P',
    heroAsin: 'B09HXC3NL8',
    competitorAsin: 'B08QZHS7V6',
    competitorBrand: 'ARVO',
  }
  const manifestState = createManifestState(null, {
    weekCode: 'W14',
    weekStart: '2026-03-29',
    weekEnd: '2026-04-04',
  }, sourceConfig)

  assert.equal(manifestState.weekCode, 'W14')
  assert.equal(manifestState.weekStart, '2026-03-29')
  assert.equal(manifestState.weekEnd, '2026-04-04')
  assert.equal(manifestState.market, 'uk')
  assert.equal(manifestState.marketplaceId, 'A1F83G8C2ARO7P')
  assert.equal(manifestState.competitorBrand, 'ARVO')
  assert.deepEqual(manifestState.targetAsins, ['B09HXC3NL8', 'B08QZHS7V6'])
  assert.deepEqual(manifestState.reports, {})
})

test('persistManifestReportId merges report ids into the same manifest file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spapi-manifest-'))
  const manifestPath = path.join(tempDir, 'manifest.json')
  const manifestState = createManifestState(null, {
    weekCode: 'W14',
    weekStart: '2026-03-29',
    weekEnd: '2026-04-04',
  }, {
    market: 'us',
    marketplaceId: 'ATVPDKIKX0DER',
    heroAsin: 'B09HXC3NL8',
    competitorAsin: 'B0DQDWV1SV',
    competitorBrand: 'Axgatoxe',
  })

  persistManifestReportId(manifestPath, manifestState, 'scpReportId', 'scp-123')
  persistManifestReportId(manifestPath, manifestState, 'salesReportId', 'sales-456')

  const writtenManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.deepEqual(writtenManifest.reports, {
    scpReportId: 'scp-123',
    salesReportId: 'sales-456',
  })
  assert.equal(writtenManifest.weekCode, 'W14')
})
