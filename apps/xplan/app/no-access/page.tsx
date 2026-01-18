import Link from 'next/link';
import { ShieldX, ArrowLeft, ExternalLink } from 'lucide-react';

export default function NoAccessPage() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL || process.env.PORTAL_AUTH_URL || '/';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div className="mx-auto h-24 w-24 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
            <ShieldX className="h-12 w-12 text-amber-600 dark:text-amber-500" />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            No Access to xplan
          </h1>
          <p className="mt-3 text-base text-slate-600 dark:text-slate-400">
            Your account does not have permission to access xplan.
          </p>
        </div>

        <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-4 text-left">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            What does this mean?
          </h2>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
              <span>You are signed in but xplan access has not been granted to your account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400 dark:text-slate-500 mt-0.5">•</span>
              <span>Contact your administrator to request access</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={portalUrl}
            className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-950 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Portal
          </Link>
          <a
            href={`mailto:support@targonglobal.com?subject=xplan Access Request`}
            className="inline-flex items-center px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 dark:focus:ring-offset-slate-950 transition-colors"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Request Access
          </a>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-500">
          If you believe this is an error, please contact your system administrator.
        </p>
      </div>
    </div>
  );
}
