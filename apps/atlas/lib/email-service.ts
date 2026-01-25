import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'Atlas <noreply@targonglobal.com>'
const ATLAS_URL =
  process.env.NEXT_PUBLIC_ATLAS_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://os.targonglobal.com/atlas'

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY)
}

export function getAtlasUrl(): string {
  return ATLAS_URL
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export type AtlasNotificationEmailPayload = {
  to: string
  firstName: string
  category: string
  title: string
  actionUrl: string
  actionRequired?: boolean
  subject?: string
}

/**
 * Send email notification to user
 * Email contains the notification category + title only (no deep details) for privacy/security.
 */
export async function sendAtlasNotificationEmail(
  payload: AtlasNotificationEmailPayload
): Promise<{ success: boolean; error?: string }> {
  const to = payload.to.trim()
  const firstName = payload.firstName.trim() || 'there'
  const category = payload.category.trim() || 'Notification'
  const title = payload.title.trim() || 'Update'
  const actionUrl = payload.actionUrl.trim() || ATLAS_URL
  const actionRequired = payload.actionRequired ?? false

  if (!resend) {
    const message = 'Email not configured'
    if (process.env.NODE_ENV === 'production') {
      return { success: false, error: message }
    }

    console.log(`[Email] ${message}. Would send to ${to}: ${category} — ${title}`)
    return { success: true }
  }

  const safeCategory = escapeHtml(category)
  const safeTitle = escapeHtml(title)
  const safeFirstName = escapeHtml(firstName)
  const safeActionUrl = escapeHtml(actionUrl)

  const subject = payload.subject?.trim()
    ? payload.subject.trim()
    : actionRequired
      ? `Action required: ${category} — ${title}`
      : `Atlas: ${category} — ${title}`

  const preheader = actionRequired
    ? `Action required: ${category}`
    : `${category} update`

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      text: [
        `Hi ${firstName},`,
        '',
        `You have a new ${category} notification in Atlas.`,
        `Title: ${title}`,
        '',
        'For security reasons, details are not included in this email.',
        `Open Atlas to view and respond: ${actionUrl}`,
      ].join('\n'),
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="x-apple-disable-message-reformatting">
        </head>
        <body style="margin:0; padding:0; background:#f1f5f9;">
          <span style="display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">
            ${escapeHtml(preheader)}
          </span>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td align="center" style="padding: 28px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width: 100%; max-width: 600px;">
                  <tr>
                    <td style="padding: 0 8px 14px 8px;">
                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; font-size: 14px;">
                        <span style="display:inline-block; padding:6px 10px; border-radius: 999px; background: ${actionRequired ? '#fff7ed' : '#eef2ff'}; color:${actionRequired ? '#9a3412' : '#3730a3'}; border: 1px solid ${actionRequired ? '#fed7aa' : '#c7d2fe'}; font-weight:600;">
                          ${actionRequired ? 'Action required' : 'New notification'}
                        </span>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="background: linear-gradient(135deg, #0ea5e9 0%, #0f766e 100%); border-radius: 16px 16px 0 0; padding: 22px 24px;">
	                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #ffffff;">
	                        <div style="font-size: 12px; opacity: 0.9; letter-spacing: 0.08em; text-transform: uppercase;">Atlas</div>
	                        <div style="font-size: 22px; font-weight: 700; margin-top: 6px; line-height: 1.2;">${safeCategory}</div>
	                        <div style="font-size: 14px; margin-top: 8px; opacity: 0.95; line-height: 1.35;">${safeTitle}</div>
	                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px; padding: 24px;">
                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height: 1.6;">
                        <p style="margin: 0 0 14px 0; font-size: 14px; color:#334155;">Hi ${safeFirstName},</p>

                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 16px; margin: 0 0 18px 0;">
                          <div style="font-size: 12px; color:#64748b; margin: 0 0 6px 0;">Category</div>
                          <div style="font-size: 16px; font-weight: 700; color:#0f172a; margin: 0;">${safeCategory}</div>
                          <div style="margin: 10px 0 0 0; font-size: 12px; color:#64748b;">Title</div>
                          <div style="font-size: 14px; font-weight: 700; color:#0f172a; margin: 0;">${safeTitle}</div>
	                          <div style="margin: 10px 0 0 0; font-size: 13px; color:#475569;">
	                            ${actionRequired ? 'Action required — please open Atlas to review.' : 'Open Atlas to view the update.'}
	                          </div>
	                        </div>
	
	                        <p style="margin: 0 0 18px 0; font-size: 13px; color:#475569;">
	                          For security reasons, detailed information is not included in this email.
	                          Please open Atlas to view and respond.
	                        </p>

                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 18px 0;">
                          <tr>
                            <td align="center" bgcolor="#0ea5e9" style="border-radius: 12px;">
	                              <a href="${safeActionUrl}" style="display:inline-block; padding: 12px 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 700; color:#ffffff; text-decoration:none; border-radius: 12px;">
	                                View & respond in Atlas
	                              </a>
	                            </td>
	                          </tr>
	                        </table>

                        <div style="font-size: 12px; color:#64748b;">
                          If the button doesn't work, open: <a href="${safeActionUrl}" style="color:#0ea5e9; text-decoration:none;">${safeActionUrl}</a>
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="padding: 14px 10px 0 10px;">
	                      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#94a3b8; font-size: 12px; line-height: 1.6; text-align: center;">
	                        This is an automated message from Atlas. Please do not reply to this email.
	                      </div>
	                    </td>
	                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    })

    console.log(`[Email] Sent to ${to}: ${category} — ${title}`)
    return { success: true }
  } catch (error: any) {
    console.error(`[Email] Failed to send to ${to}:`, error)
    return { success: false, error: error.message }
  }
}
