import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { buildPortalUrl, resolvePortalAuthOrigin } from '@targon/auth'

export default async function XplanRedirect() {
  const headerList = await headers()
  const forwardedProto = headerList.get('x-forwarded-proto')
  const forwardedHost = headerList.get('x-forwarded-host')
  const host = forwardedHost?.split(',')[0]?.trim() || headerList.get('host')
  const protocol = forwardedProto?.split(',')[0]?.trim() || (host ? 'https' : undefined)

  if (host && protocol) {
    try {
      const origin = `${protocol}://${host}`
      console.log('[xplan redirect] using headers()', { forwardedProto, forwardedHost, host, protocol, origin })
      const target = new URL('/xplan', origin)
      redirect(target.toString())
      return
    } catch {
      // fall back to shared helpers
    }
  }

  try {
    const target = buildPortalUrl('/xplan')
    console.log('[xplan redirect] using buildPortalUrl fallback')
    redirect(target.toString())
    return
  } catch {
    // fall through to fallback below
  }

  let fallback: string | null = null

  try {
    const origin = resolvePortalAuthOrigin()
    fallback = new URL('/xplan', origin).toString()
  } catch {
    const envBase = process.env.NEXTAUTH_URL || process.env.PORTAL_AUTH_URL || process.env.NEXT_PUBLIC_PORTAL_AUTH_URL
    if (envBase) {
      try {
        fallback = new URL('/xplan', envBase).toString()
      } catch {
        // retain previous fallback
      }
    }
  }

  if (!fallback) {
    throw new Error('Unable to resolve xplan redirect URL. Set NEXTAUTH_URL, PORTAL_AUTH_URL, or NEXT_PUBLIC_PORTAL_AUTH_URL.')
  }

  redirect(fallback)
}
