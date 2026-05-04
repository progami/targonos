import { redirect } from 'next/navigation'
import {
  buildAppLoginRedirect,
  normalizeBasePath,
  resolveAppAuthOrigin,
  resolvePortalAuthOrigin,
} from '@targon/auth'
import { auth } from '@/lib/auth'
import { withoutBasePath } from '@/lib/utils/base-path'

type SearchParamsInput = Promise<{ callbackUrl?: string } | undefined>

export default async function LoginPage({ searchParams }: { searchParams: SearchParamsInput }) {
  const resolved = await Promise.resolve(searchParams)
  const desiredDefault = '/dashboard'
  const desiredRawInput = typeof resolved?.callbackUrl === 'string' ? resolved.callbackUrl.trim() : ''
  const desiredRaw = desiredRawInput.length > 0 ? desiredRawInput : desiredDefault
  const appOrigin = resolveAppAuthOrigin()

  let desired = desiredDefault

  if (desiredRaw.startsWith('http://') || desiredRaw.startsWith('https://')) {
    try {
      const parsed = new URL(desiredRaw)
      if (parsed.origin === appOrigin) {
        desired = withoutBasePath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
      }
    } catch {
      desired = desiredDefault
    }
  } else {
    const desiredRelative = desiredRaw.startsWith('/') ? desiredRaw : `/${desiredRaw}`
    desired = withoutBasePath(desiredRelative)
  }

  desired = desired.replace(/^\/+/g, '/')
  if (!desired.trim()) {
    desired = desiredDefault
  }

  const session = await auth()
  if (session) {
    redirect(desired)
  }

  const desiredUrl = new URL(desired, appOrigin)
  const login = buildAppLoginRedirect({
    portalOrigin: resolvePortalAuthOrigin(),
    appOrigin,
    appBasePath: normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? process.env.BASE_PATH),
    pathname: desiredUrl.pathname,
    search: desiredUrl.search,
    hash: desiredUrl.hash,
  })

  redirect(login.toString())
}
