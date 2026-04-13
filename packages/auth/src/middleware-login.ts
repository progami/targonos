import { normalizeBasePath } from './topology.js'

export function buildAppLoginRedirect(input: {
  portalOrigin: string
  appOrigin: string
  appBasePath: string
  pathname: string
  search: string
  hash?: string
}): URL {
  const login = new URL('/login', input.portalOrigin)
  const appBasePath = normalizeBasePath(input.appBasePath)
  const callbackPathname =
    appBasePath === '' || input.pathname.startsWith(appBasePath)
      ? input.pathname
      : `${appBasePath}${input.pathname}`

  const callbackUrl = new URL(
    `${callbackPathname}${input.search}${input.hash ?? ''}`,
    input.appOrigin,
  )

  login.searchParams.set('callbackUrl', callbackUrl.toString())
  return login
}
