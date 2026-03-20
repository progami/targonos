import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { MonitoringChangeEvent } from '@/lib/monitoring/types'
import { buildAlertEmailHtml, buildAlertSubject } from '@/lib/email/template'
import { sendAlertEmail } from '@/lib/email/send'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXTAUTH_URL ||
  'https://os.targonglobal.com/argus'

const SendAlertSchema = z.object({
  to: z.array(z.string().email()).min(1),
  event: z.object({
    id: z.string(),
    asin: z.string(),
    label: z.string().nullable(),
    owner: z.enum(['OURS', 'COMPETITOR', 'UNKNOWN']),
    timestamp: z.string(),
    baselineTimestamp: z.string().nullable(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    categories: z.array(z.string()),
    primaryCategory: z.string(),
    changedFieldCount: z.number(),
    changedFields: z.array(z.string()),
    headline: z.string(),
    summary: z.string(),
    currentSnapshot: z.any().nullable(),
    baselineSnapshot: z.any().nullable(),
  }),
})

/**
 * POST /api/alerts/send
 *
 * Body: { to: string[], event: MonitoringChangeEvent }
 *
 * Sends the alert email to the specified recipients.
 */
export async function POST(request: Request) {
  const body = await request.json()
  const parsed = SendAlertSchema.parse(body)

  const event = parsed.event as MonitoringChangeEvent
  const subject = buildAlertSubject(event)
  const html = buildAlertEmailHtml(event, APP_URL)

  const result = await sendAlertEmail(parsed.to, subject, html)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Failed to send email' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, subject })
}
