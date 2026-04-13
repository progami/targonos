const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const scriptPath = path.join(__dirname, 'detect-cd-affected-apps.js')

function runDetector(changedFiles) {
  const stdout = execFileSync('node', [scriptPath], {
    input: changedFiles.join('\n'),
    encoding: 'utf8',
  })

  return stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
}

test('deploy infrastructure changes redeploy every hosted app', () => {
  const lines = runDetector(['scripts/deploy-app.sh'])

  assert.deepEqual(lines, [
    'argus=true',
    'atlas=true',
    'hermes=true',
    'kairos=true',
    'plutus=true',
    'sso=true',
    'talos=true',
    'website=true',
    'xplan=true',
    'any_app=true',
  ])
})

test('workspace package changes keep package flag and dependent app selection', () => {
  const lines = runDetector(['packages/auth/src/index.ts'])

  assert.ok(lines.includes('packages=true'))
  assert.ok(lines.includes('sso=true'))
  assert.ok(lines.includes('talos=true'))
  assert.ok(lines.includes('xplan=true'))
  assert.ok(lines.includes('kairos=true'))
  assert.ok(lines.includes('atlas=true'))
  assert.ok(lines.includes('plutus=true'))
  assert.ok(lines.includes('argus=true'))
  assert.ok(lines.includes('any_app=true'))
})
