import './login.css'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { resolvePortalCallbackTarget } from '@/lib/callback-target'
import { requireAuthEnv } from '@/lib/required-auth-env'

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

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

  const resolvedMessage = messages[error]
  return typeof resolvedMessage === 'string'
    ? resolvedMessage
    : 'Unable to sign in right now. Please try again or reach out to support.'
}

export default async function LoginPage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const params = (await searchParams) ?? {}
  const callbackUrlParam = asString(params.callbackUrl)
  const callbackUrl = typeof callbackUrlParam === 'string' ? callbackUrlParam : '/'
  const errorParam = asString(params.error)
  const error = typeof errorParam === 'string' ? errorParam : ''
  const errorMessage = error === '' ? '' : getErrorMessage(error)
  const loginSubtitle = 'Use your targonglobal.com Google account to enter the launcher.'
  const session = await auth()

  if (session) {
    const target = resolvePortalCallbackTarget({
      targetUrl: callbackUrl,
      portalBaseUrl: requireAuthEnv('NEXTAUTH_URL'),
    })

    if (target) {
      redirect(target)
    }

    redirect('/')
  }

  return (
    <div className="login-shell">
      <div className="login-grid">
        <section className="login-story" aria-label="Portal overview">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.72"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.44"
                />
              </svg>
            </div>
            <div className="login-brand-copy">
              <span className="login-kicker">TargonOS</span>
              <span className="login-brand-title">Portal</span>
            </div>
          </div>

          <div className="login-story-brandmark">
            <img
              className="login-story-wordmark"
              src="/brand/targon-wordmark-inverted.svg"
              alt="Targon"
            />
            <div className="login-story-copy login-story-copy--compact">
              <h1 className="login-title login-title--compact">
                <span className="login-title-primary">Private Label Engine</span>
                <span className="login-title-secondary">for Targon Products.</span>
              </h1>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-label="Sign-in panel">
          <div className="login-panel-inner">
            <p className="login-panel-eyebrow">Authenticate</p>
            <h2 className="login-panel-title">Sign in to continue</h2>
            <p className="login-subtitle">{loginSubtitle}</p>

            {errorMessage ? (
              <div className="form-global-error" role="alert">
                {errorMessage}
              </div>
            ) : null}

            <form action="/login/google" method="get" className="login-form">
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

            <div className="login-support">
              <p>Need access or hit an authentication issue?</p>
              <p>Contact the platform team.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
