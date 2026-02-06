import { auth } from '@/lib/auth'
import type { Session } from 'next-auth'

function isDecryptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message ?? ''
  const name = error.name ?? ''
  return (
    name === 'JWEDecryptionFailed' ||
    name === 'JWTSessionError' ||
    message.includes('JWEDecryptionFailed') ||
    message.includes('decryption operation failed') ||
    message.includes('no matching decryption secret')
  )
}

export async function getSafeServerSession(): Promise<Session | null> {
  try {
    return await auth()
  } catch (error) {
    if (isDecryptError(error)) {
      console.warn('[auth] Ignoring stale session cookie after decrypt failure')
      return null
    }
    throw error
  }
}
