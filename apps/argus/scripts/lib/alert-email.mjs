import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.resolve(__dirname, '../../../../')

const GWORKSPACE_API_BIN = '/Users/jarraramjad/.local/bin/gworkspace-api'
const GWORKSPACE_CREDENTIALS = '/Users/jarraramjad/.config/google-workspace/workspace-dwd-admin.json'
const GMAIL_SCOPE = 'https://mail.google.com/'
const DEFAULT_IMPERSONATED_USER = 'jarrar@targonglobal.com'

const execFileAsync = promisify(execFile)

export function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\\\n|\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const cleaned = trimmed.replace(/^\d+→/, '')
      const separator = cleaned.indexOf('=')
      if (separator < 0) continue

      const key = cleaned.slice(0, separator).trim()
      let value = cleaned.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (value.endsWith('$')) value = value.slice(0, -1)

      if (!process.env[key]) process.env[key] = value
    }
  }
}

export function loadMonitoringEnv() {
  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/talos/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, 'apps/xplan/.env.local'))
  loadEnvFile(path.join(REPO_ROOT, '.env.local'))
}

export function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function parseEmailList(input) {
  const values = String(input ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (values.length === 0) {
    throw new Error('No recipient emails resolved for alert email.')
  }

  return values
}

function resolveRecipients() {
  return parseEmailList(requireEnv('ARGUS_ALERT_EMAIL_TO'))
}

function assertNoHeaderInjection(value, label) {
  const text = String(value ?? '')
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error(`Invalid ${label}: must not contain newlines.`)
  }
  return text
}

function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '')
}

function buildMultipartAlternative({ text, html }) {
  const boundary = `argus-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const lines = [
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ]

  return lines
}

export async function sendArgusAlertEmail(payload) {
  loadMonitoringEnv()

  const to = resolveRecipients()

  const subject = assertNoHeaderInjection(String(payload?.subject ?? '').trim(), 'subject').trim()
  if (!subject) {
    throw new Error('Alert email subject must be a non-empty string.')
  }

  const text = String(payload?.text ?? '').trim()
  if (!text) {
    throw new Error('Alert email text must be a non-empty string.')
  }

  const html = payload?.html ? String(payload.html).trim() : ''

  const toHeader = assertNoHeaderInjection(to.join(', '), 'to')
  const fromHeader = DEFAULT_IMPERSONATED_USER

  const headers = [
    `To: ${toHeader}`,
    `From: ${fromHeader}`,
    `Subject: ${subject}`,
  ]

  let bodyLines = []
  if (html) {
    bodyLines = buildMultipartAlternative({ text, html })
  } else {
    bodyLines = [
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      text,
      '',
    ]
  }

  const rawMessage = [...headers, ...bodyLines].join('\r\n')
  const raw = base64UrlEncode(Buffer.from(rawMessage, 'utf8'))

  try {
    const { stdout } = await execFileAsync(GWORKSPACE_API_BIN, [
      'request',
      'POST',
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      '--credentials',
      GWORKSPACE_CREDENTIALS,
      '--subject',
      DEFAULT_IMPERSONATED_USER,
      '--scope',
      GMAIL_SCOPE,
      '--json',
      JSON.stringify({ raw }),
    ])

    if (stdout && stdout.trim()) {
      try {
        const parsed = JSON.parse(stdout)
        const id = parsed?.id ? String(parsed.id) : null
        console.log(`[argus-email] sent id=${id ?? 'unknown'} to=${to.join(',')}`)
        return { id }
      } catch {
        console.log(`[argus-email] sent to=${to.join(',')}`)
        return { id: null }
      }
    }

    console.log(`[argus-email] sent to=${to.join(',')}`)
    return { id: null }
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? error.stderr : ''
    const stdout = error && typeof error === 'object' && 'stdout' in error ? error.stdout : ''
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Gmail send failed (${GMAIL_SCOPE}). ${message}${stdout ? `\nstdout:\n${stdout}` : ''}${stderr ? `\nstderr:\n${stderr}` : ''}`,
    )
  }
}
