import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import { ExternalLink, ShieldX } from '@/lib/lucide-icons'

export default function NoAccessPage() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || process.env.PORTAL_AUTH_URL || '/'

  return (
    <PageContainer className="min-h-screen">
      <PageHeaderSection
        title="No Access to Talos"
        description="Access"
        icon={ShieldX}
        backHref={portalUrl}
        backLabel="Back"
        actions={
          <a
            href={`mailto:support@targonglobal.com?subject=Talos Access Request`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 shadow-soft hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            Request Access
          </a>
        }
      />
      <PageContent className="flex items-center justify-center">
        <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div className="mx-auto h-24 w-24 bg-amber-100 rounded-full flex items-center justify-center">
            <ShieldX className="h-12 w-12 text-amber-600" />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-slate-900">
            No Access to Talos
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Your account does not have permission to access Talos.
          </p>
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-left">
          <h2 className="text-sm font-medium text-slate-700 mb-2">What does this mean?</h2>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-0.5">•</span>
              <span>You are signed in but Talos access has not been granted to your account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 mt-0.5">•</span>
              <span>Contact your administrator to request access</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-500">
          If you believe this is an error, please contact your system administrator.
        </p>
        </div>
      </PageContent>
    </PageContainer>
  )
}
