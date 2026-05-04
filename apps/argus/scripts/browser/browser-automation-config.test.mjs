import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  bitwardenSecretDir,
  bitwardenSecretPath,
  defaultChromeBrowserUrl,
  defaultChromeStartScriptPath,
} from './browser-automation-config.mjs'

test('defaultChromeBrowserUrl uses the dedicated local devtools endpoint', () => {
  assert.equal(defaultChromeBrowserUrl({}), 'http://127.0.0.1:9223')
})

test('defaultChromeBrowserUrl respects explicit env override', () => {
  assert.equal(defaultChromeBrowserUrl({ ARGUS_CHROME_BROWSER_URL: 'http://127.0.0.1:9333' }), 'http://127.0.0.1:9333')
})

test('defaultChromeStartScriptPath points to the repo-local launcher', () => {
  assert.equal(defaultChromeStartScriptPath({}), path.join(process.cwd(), 'apps/argus/scripts/browser/start-devtools-chrome.sh'))
})

test('bitwarden secret helpers use the codex secrets directory', () => {
  const env = { HOME: '/tmp/example-home' }
  assert.equal(bitwardenSecretDir(env), '/tmp/example-home/.config/codex/secrets')
  assert.equal(
    bitwardenSecretPath('bitwarden-master-password', env),
    '/tmp/example-home/.config/codex/secrets/bitwarden-master-password',
  )
})

test('bitwarden secret helpers respect explicit env override', () => {
  const env = { ARGUS_BITWARDEN_SECRET_DIR: '/tmp/argus-secrets', HOME: '/tmp/example-home' }
  assert.equal(bitwardenSecretDir(env), '/tmp/argus-secrets')
  assert.equal(bitwardenSecretPath('bitwarden-cli-session', env), '/tmp/argus-secrets/bitwarden-cli-session')
})
