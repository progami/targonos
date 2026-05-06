import type { Session } from 'next-auth'

export function hasSignedInUser(session: Session | null): session is Session {
  const email = session?.user?.email
  return typeof email === 'string' && email.trim() !== ''
}
