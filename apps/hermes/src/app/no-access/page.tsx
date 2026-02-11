const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || process.env.PORTAL_AUTH_URL || '/'

export default function HermesNoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">No Access to Hermes</h1>
      <p className="text-sm text-muted-foreground">
        Your account is authenticated, but it does not have Hermes access.
      </p>
      <a href={portalUrl} className="underline underline-offset-4">
        Return to portal
      </a>
    </main>
  )
}
