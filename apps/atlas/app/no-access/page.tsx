'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getApiBase } from '@/lib/api-client'

type MeSnapshot = {
  email: string | null
  name: string | null
}

async function getMeSnapshot(): Promise<MeSnapshot> {
  const res = await fetch(`${getApiBase()}/api/access-requests`, { method: 'GET' })
  if (!res.ok) return { email: null, name: null }
  const json = (await res.json()) as { email?: string | null; name?: string | null }
  return { email: json.email ?? null, name: json.name ?? null }
}

export default function NoAccessPage() {
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [me, setMe] = useState<MeSnapshot>({ email: null, name: null })

  useEffect(() => {
    getMeSnapshot().then(setMe).catch(() => setMe({ email: null, name: null }))
  }, [])

  const requestAccess = useCallback(async () => {
    setRequesting(true)
    setError(null)
    try {
      const res = await fetch(`${getApiBase()}/api/access-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reason: 'NO_ENTITLEMENT' }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(payload?.error || `${res.status} ${res.statusText}`)
      }
      setRequested(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to request access')
    } finally {
      setRequesting(false)
    }
  }, [])

  return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-sm">
        <div className="px-6 py-5 border-b border-border">
          <div className="text-sm font-semibold text-foreground">Atlas</div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Atlas can’t be opened for your account yet. This usually means access hasn’t been granted, or your employee
            profile is still provisioning. Request access and HR will review it.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {me.email ? (
            <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm text-foreground">
              Signed in as <span className="font-medium">{me.name ? `${me.name} • ` : ''}{me.email}</span>
            </div>
          ) : null}

          {requested ? (
            <div className="rounded-xl bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-800">
              Request sent. Check your email for updates and revisit Atlas once access is granted.
            </div>
          ) : (
            <Button onClick={requestAccess} disabled={requesting} className="w-full">
              {requesting ? 'Requesting access…' : 'Request access'}
            </Button>
          )}

          {error ? (
            <div className="rounded-xl bg-danger-50 border border-danger-200 px-4 py-3 text-sm text-danger-800">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-sm">
            <Link className="text-muted-foreground hover:text-foreground" href="/">
              Go back
            </Link>
            <a className="text-accent hover:text-primary font-medium" href="https://os.targonglobal.com">
              Back to portal
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
