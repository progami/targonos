const AUTH_COOKIE_PATTERNS = ['authjs', 'next-auth', '__Secure-', '__Host-', 'csrf', 'pkce', 'callback', 'targon', 'session']

const KNOWN_AUTH_COOKIE_NAMES = [
  '__Secure-next-auth.session-token',
  '__Secure-next-auth.callback-url',
  '__Secure-next-auth.csrf-token',
  '__Host-next-auth.csrf-token',
  'next-auth.session-token',
  'next-auth.callback-url',
  'next-auth.csrf-token',
  'targon.next-auth.session-token',
  'targon.next-auth.callback-url',
  'targon.next-auth.csrf-token',
  '__Secure-authjs.session-token',
  '__Secure-authjs.callback-url',
  '__Secure-authjs.csrf-token',
  'authjs.session-token',
  'authjs.callback-url',
  'authjs.csrf-token',
]

type ExpiredAuthCookieOptions = {
  cookieDomain: string
  requestCookieNames?: Iterable<string>
}

type AuthCookieClearSpec = {
  name: string
  domain?: string
}

function isAuthCookieName(name: string): boolean {
  const normalizedName = name.toLowerCase()
  return AUTH_COOKIE_PATTERNS.some((pattern) => normalizedName.includes(pattern.toLowerCase()))
}

function normalizeCookieDomain(cookieDomain: string): string {
  const normalized = cookieDomain.trim().toLowerCase()
  if (normalized.startsWith('.')) {
    return normalized.slice(1)
  }
  return normalized
}

function getCookieDomainsForName(name: string, cookieDomain: string): Array<string | undefined> {
  const domains: Array<string | undefined> = [undefined]

  if (name.startsWith('__Host-')) {
    return domains
  }

  const normalizedDomain = normalizeCookieDomain(cookieDomain)
  if (normalizedDomain.length === 0) {
    return domains
  }

  domains.push(`.${normalizedDomain}`)

  if (normalizedDomain.endsWith('targonglobal.com') && normalizedDomain !== 'targonglobal.com') {
    domains.push('.targonglobal.com')
  }

  return Array.from(new Set(domains))
}

function collectAuthCookieNames(requestCookieNames: Iterable<string> = []): string[] {
  const names = new Set(KNOWN_AUTH_COOKIE_NAMES)

  for (const name of requestCookieNames) {
    if (isAuthCookieName(name)) {
      names.add(name)
    }
  }

  return Array.from(names)
}

export function buildExpiredAuthCookieSpecs(options: ExpiredAuthCookieOptions): AuthCookieClearSpec[] {
  const specs: AuthCookieClearSpec[] = []

  for (const name of collectAuthCookieNames(options.requestCookieNames)) {
    for (const domain of getCookieDomainsForName(name, options.cookieDomain)) {
      specs.push(domain === undefined ? { name } : { name, domain })
    }
  }

  return specs
}

export function serializeExpiredAuthCookie(spec: AuthCookieClearSpec): string {
  const domainSegment = spec.domain === undefined ? '' : ` Domain=${spec.domain};`
  return `${spec.name}=;${domainSegment} Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
}

export function buildExpiredAuthCookieHeaders(options: ExpiredAuthCookieOptions): string[] {
  return buildExpiredAuthCookieSpecs(options).map(serializeExpiredAuthCookie)
}

export function appendExpiredAuthCookieHeaders(
  response: { headers: Headers },
  options: ExpiredAuthCookieOptions,
): void {
  for (const header of buildExpiredAuthCookieHeaders(options)) {
    response.headers.append('Set-Cookie', header)
  }
}
