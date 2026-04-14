import Link from 'next/link';
import { ShieldX, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NoAccessPage() {
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_AUTH_URL;

  if (!portalUrl) {
    throw new Error('NEXT_PUBLIC_PORTAL_AUTH_URL must be defined for the Kairos no-access page.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <ShieldX className="h-8 w-8 text-amber-700 dark:text-amber-400" aria-hidden />
          </div>
          <CardTitle className="mt-4 text-xl">No Access to Kairos</CardTitle>
          <CardDescription>
            Your account does not have permission to access this forecasting workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href={portalUrl}>Back to Portal</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full"
            aria-label="Request Kairos access via email"
          >
            <a href="mailto:support@targonglobal.com?subject=Kairos%20Access%20Request">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
              Request Access
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
