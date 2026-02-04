'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Card, CardContent } from '@/components/ui/card';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

export default function AnalyticsPage() {
  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Analytics" />;
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Analytics" variant="accent" />
        <div className="mt-6">
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6 text-sm text-slate-600 dark:text-slate-400">
              Coming soon.
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

