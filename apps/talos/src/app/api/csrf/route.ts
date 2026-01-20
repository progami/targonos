import { NextResponse } from 'next/server'

const CSRF_COOKIE_NAME = 'csrf-token'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function GET() {
  const csrfToken = generateToken()

  const response = NextResponse.json(
    { csrfToken },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )

  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })

  return response
}
