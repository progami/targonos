type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
}

type GoogleCalendarEvent = {
  id?: string
  htmlLink?: string
  hangoutLink?: string
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
}

type CalendarAttendee = {
  email: string
  displayName?: string
}

type CreateCalendarEventParams = {
  summary: string
  description?: string | null
  startAt: Date
  endAt: Date
  timeZone: string
  attendees: CalendarAttendee[]
  location?: string | null
}

type CreateCalendarEventResult = {
  googleEventId: string
  htmlLink: string | null
  meetingLink: string | null
}

type DeleteCalendarEventParams = {
  googleEventId: string
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    clientId: requiredEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requiredEnv('GOOGLE_CLIENT_SECRET'),
    refreshToken: requiredEnv('GOOGLE_REFRESH_TOKEN'),
    calendarId: requiredEnv('GOOGLE_CALENDAR_ID'),
  }
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null

async function getGoogleAccessToken(config: GoogleOAuthConfig): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAtMs) {
    return cachedAccessToken.token
  }

  const body = new URLSearchParams()
  body.set('client_id', config.clientId)
  body.set('client_secret', config.clientSecret)
  body.set('refresh_token', config.refreshToken)
  body.set('grant_type', 'refresh_token')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await res.json()) as GoogleTokenResponse
  if (!res.ok) {
    throw new Error(`Google OAuth token refresh failed (${res.status})`)
  }

  const accessToken = json.access_token
  if (!accessToken) throw new Error('Google OAuth token response missing access_token')

  const expiresIn = json.expires_in
  if (!expiresIn) throw new Error('Google OAuth token response missing expires_in')

  cachedAccessToken = {
    token: accessToken,
    expiresAtMs: Date.now() + Math.max(0, expiresIn - 30) * 1000,
  }

  return accessToken
}

function pickMeetingLink(event: GoogleCalendarEvent): string | null {
  if (event.hangoutLink) return event.hangoutLink

  const video = event.conferenceData?.entryPoints?.find(
    (p) => p.entryPointType === 'video' && typeof p.uri === 'string' && p.uri.length > 0
  )
  return video?.uri ?? null
}

export async function createGoogleCalendarEvent(params: CreateCalendarEventParams): Promise<CreateCalendarEventResult> {
  const config = getGoogleOAuthConfig()
  const accessToken = await getGoogleAccessToken(config)

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  )
  url.searchParams.set('conferenceDataVersion', '1')
  url.searchParams.set('sendUpdates', 'all')

  const requestId = globalThis.crypto.randomUUID()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: params.summary,
      description: params.description ?? undefined,
      location: params.location ?? undefined,
      start: { dateTime: params.startAt.toISOString(), timeZone: params.timeZone },
      end: { dateTime: params.endAt.toISOString(), timeZone: params.timeZone },
      attendees: params.attendees,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  })

  const event = (await res.json()) as GoogleCalendarEvent
  if (!res.ok) {
    throw new Error(`Google Calendar event creation failed (${res.status})`)
  }

  if (!event.id) throw new Error('Google Calendar event response missing id')

  return {
    googleEventId: event.id,
    htmlLink: event.htmlLink ?? null,
    meetingLink: pickMeetingLink(event),
  }
}

export async function deleteGoogleCalendarEvent(params: DeleteCalendarEventParams): Promise<void> {
  const config = getGoogleOAuthConfig()
  const accessToken = await getGoogleAccessToken(config)

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events/${encodeURIComponent(params.googleEventId)}`
  )
  url.searchParams.set('sendUpdates', 'all')

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Google Calendar event delete failed (${res.status})`)
  }
}

