import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('scaffold-market-workspace dry-run reports the UK Monitoring and WPR structure', () => {
  const salesRoot = path.join(mkdtempSync(path.join(tmpdir(), 'argus-uk-sales-')), 'Sales')
  const result = spawnSync(
    'bash',
    ['apps/argus/scripts/lib/scaffold-market-workspace.sh', '--market', 'uk', '--sales-root', salesRoot, '--dry-run'],
    {
      cwd: path.resolve(new URL('../../../..', import.meta.url).pathname),
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /market=uk/)
  assert.match(result.stdout, /Monitoring\/Hourly\/Listing Attributes \(API\)/)
  assert.match(result.stdout, /Monitoring\/Weekly\/Brand Analytics \(API\)/)
  assert.match(result.stdout, /Monitoring\/Logs\/weekly-api-sources/)
  assert.match(result.stdout, /WPR\/wpr-workspace\/output/)
})
