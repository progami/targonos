import './login.css'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on'])

function asString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    AccessDenied: 'Your account is not allowed to sign in. Please contact an administrator.',
    CredentialsSignin: 'The email or password is incorrect.',
    PortalUserMissing: 'Your account is not provisioned in the portal directory.',
    OAuthCallback: 'Google rejected the sign-in request. Please try again.',
    Configuration: 'There was a problem with the authentication configuration. Please try again.',
  }

  return messages[error] || 'Unable to sign in right now. Please try again or reach out to support.'
}

export default async function LoginPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const params = (await searchParams) ?? {}
  const callbackUrl = asString(params.callbackUrl) || '/'
  const error = asString(params.error) || ''
  const errorMessage = error ? getErrorMessage(error) : ''
  const hasGoogleOAuth = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  const allowDevAuthBypass =
    process.env.NODE_ENV !== 'production' &&
    (TRUTHY_VALUES.has(String(process.env.ALLOW_DEV_AUTH_SESSION_BYPASS ?? '').toLowerCase()) ||
      TRUTHY_VALUES.has(String(process.env.ALLOW_DEV_AUTH_DEFAULTS ?? '').toLowerCase()))
  const showDevCredentials = allowDevAuthBypass || !hasGoogleOAuth
  const loginSubtitle = hasGoogleOAuth
    ? 'Sign in with your targonglobal.com Google account'
    : 'Sign in with your local portal credentials'

  return (
    <div className="login-container">
      <div className="login-background">
        <div className="gradient-orb gradient-orb-1"></div>
        <div className="gradient-orb gradient-orb-2"></div>
        <div className="gradient-orb gradient-orb-3"></div>
      </div>

      <div className="login-card-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-container">
              <div className="logo-gradient">
                <svg className="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
            <h1 className="login-title">TargonOS Portal</h1>
            <p className="login-headline">Welcome back</p>
            <p className="login-subtitle">{loginSubtitle}</p>
          </div>

          {errorMessage && (
            <div className="form-global-error" role="alert">
              {errorMessage}
            </div>
          )}

          {showDevCredentials && (
            <>
              <div className="login-divider">
                <span>Local dev</span>
              </div>
              <form action="/login/credentials" method="get" className="login-form">
                <input type="hidden" name="callbackUrl" value={callbackUrl} />

                <div className="form-group">
                  <label className="form-label" htmlFor="emailOrUsername">
                    Email or username
                  </label>
                  <div className="input-wrapper">
                    <span className="input-icon" aria-hidden="true">
                      @
                    </span>
                    <input
                      id="emailOrUsername"
                      name="emailOrUsername"
                      type="text"
                      className="form-input"
                      autoComplete="username"
                      placeholder="demo-admin"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="password">
                    Password
                  </label>
                  <div className="input-wrapper">
                    <span className="input-icon" aria-hidden="true">
                      *
                    </span>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      className="form-input with-toggle"
                      autoComplete="current-password"
                      placeholder="demo-password"
                    />
                  </div>
                </div>

                <button type="submit" className="submit-button">
                  <span className="button-content">Sign in</span>
                </button>
              </form>
            </>
          )}

          {hasGoogleOAuth && (
            <>
              {showDevCredentials && (
                <div className="login-divider">
                  <span>Google</span>
                </div>
              )}
              <form action="/login/google" method="get">
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <button type="submit" className="login-google-button">
                  <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
                    <path
                      d="M17.64 9.2045C17.64 8.56632 17.5827 7.95268 17.4764 7.36364H9V10.8455H13.8436C13.635 11.97 13.0009 12.9236 12.0473 13.5636V15.8191H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.2045Z"
                      fill="#4285F4"
                    />
                    <path
                      d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8191L12.0473 13.5636C11.2423 14.1036 10.2114 14.4091 9 14.4091C6.65614 14.4091 4.67182 12.825 3.96409 10.71H0.957275V13.0418C2.43545 15.9832 5.48182 18 9 18Z"
                      fill="#34A853"
                    />
                    <path
                      d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M9 3.59091C10.3214 3.59091 11.49 4.04545 12.3941 4.90409L15.0191 2.27909C13.4632 0.834545 11.4264 0 9 0C5.48182 0 2.43545 2.01636 0.957275 4.95818L3.96409 7.29C4.67182 5.175 6.65614 3.59091 9 3.59091Z"
                      fill="#EA4335"
                    />
                  </svg>
                  Sign in with Google
                </button>
              </form>
            </>
          )}

          <p className="login-note">
            Need access or see an issue? Contact the platform team.
          </p>
        </div>
      </div>
    </div>
  )
}
