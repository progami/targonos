import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('scaffold-market-workspace dry-run reports the UK Monitoring and WPR structure', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'argus-uk-workspace-'))
  const monitoringRoot = path.join(root, 'monitoring')
  const wprDataDir = path.join(root, 'wpr', 'WPR', 'wpr-workspace', 'output')
  const result = spawnSync(
    'bash',
    [
      'apps/argus/scripts/lib/scaffold-market-workspace.sh',
      '--market',
      'uk',
      '--monitoring-root',
      monitoringRoot,
      '--wpr-data-dir',
      wprDataDir,
      '--dry-run',
    ],
    {
      cwd: path.resolve(new URL('../../../..', import.meta.url).pathname),
      encoding: 'utf8',
    },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /market=uk/)
  assert.match(result.stdout, /monitoring_root=/)
  assert.match(result.stdout, /wpr_data_dir=/)
  assert.match(result.stdout, /Hourly\/Listing Attributes \(API\)/)
  assert.match(result.stdout, /Weekly\/Brand Analytics \(API\)/)
  assert.match(result.stdout, /Logs\/weekly-api-sources/)
  assert.match(result.stdout, /wpr\/WPR\/wpr-workspace\/output/)
})
