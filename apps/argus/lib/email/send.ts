import 'server-only'

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const SENDER_EMAIL = process.env.ALERT_SENDER_EMAIL || 'jarrar@targonglobal.com'

export interface SendEmailResult {
  success: boolean
  error?: string
}

/**
 * Send an HTML email via the Gmail API using gworkspace-api DWD.
 */
export async function sendAlertEmail(
  to: string[],
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const rfc2822 = buildRfc2822(to, subject, html)
  const raw = Buffer.from(rfc2822).toString('base64url')

  const { stderr } = await execFileAsync('gworkspace-api', [
    'request',
    'POST',
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    '--subject',
    SENDER_EMAIL,
    '--scope',
    'https://www.googleapis.com/auth/gmail.send',
    '--json',
    JSON.stringify({ raw }),
  ])

  if (stderr && stderr.trim().length > 0) {
    console.error('[alert-email] gworkspace-api stderr:', stderr)
  }

  return { success: true }
}

function buildRfc2822(to: string[], subject: string, html: string): string {
  return [
    `From: Argus Alerts <${SENDER_EMAIL}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n')
}
