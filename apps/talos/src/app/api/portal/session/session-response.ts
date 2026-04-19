import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'

function isRecoverableAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message
  const name = error.name

  if (message.includes('decrypt')) {
    return true
  }

  if (message.includes('JWEDecryptionFailed')) {
    return true
  }

  if (message.includes('CSRF')) {
    return true
  }

  if (message.includes('JWT')) {
    return true
  }

  if (name.includes('JWTSessionError')) {
    return true
  }

  return name.includes('MissingCSRF')
}

export async function buildPortalSessionResponse(
  readSession: () => Promise<Session | null>,
): Promise<NextResponse> {
  try {
    const session = await readSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(session)
  } catch (error) {
    if (isRecoverableAuthError(error)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    throw error
  }
}
