import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../..')

export function defaultChromeBrowserUrl(env = process.env) {
  const explicit = env.ARGUS_CHROME_BROWSER_URL
  if (explicit && explicit.trim()) {
    return explicit.trim()
  }
  return 'http://127.0.0.1:9223'
}

export function defaultChromeStartScriptPath(env = process.env) {
  const explicit = env.ARGUS_CHROME_START_SCRIPT
  if (explicit && explicit.trim()) {
    return explicit.trim()
  }
  return path.join(REPO_ROOT, 'apps/argus/scripts/browser/start-devtools-chrome.sh')
}

export function bitwardenSecretDir(env = process.env) {
  const explicit = env.ARGUS_BITWARDEN_SECRET_DIR
  if (explicit && explicit.trim()) {
    return explicit.trim()
  }

  const homeDir = env.HOME
  if (!homeDir || !homeDir.trim()) {
    throw new Error('HOME is required to resolve the Argus Bitwarden secret directory.')
  }
  return path.join(homeDir, '.config/codex/secrets')
}

export function bitwardenSecretPath(secretName, env = process.env) {
  return path.join(bitwardenSecretDir(env), secretName)
}
