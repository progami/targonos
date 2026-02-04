'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; companyName?: string; homeCurrency?: string; error?: string };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function disconnectQbo(): Promise<{ success: boolean }> {
  const res = await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
  return res.json();
}

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectQbo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      toast.success('Disconnected from QuickBooks');
    },
    onError: () => {
      toast.error('Failed to disconnect');
    },
  });

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Settings" variant="accent" />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                QuickBooks Online
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
                {isLoading ? 'Checking…' : status?.connected ? (status.companyName ?? 'Connected') : 'Not connected'}
              </div>
              {status?.connected && status.homeCurrency && (
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Home currency: {status.homeCurrency}</div>
              )}
              {!isLoading && status?.connected === false && status.error && (
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{status.error}</div>
              )}

              <div className="mt-4 flex items-center gap-2">
                {status?.connected ? (
                  <Button
                    variant="outline"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                ) : (
                  <Button onClick={handleConnect}>Connect to QuickBooks</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Appearance
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="text-sm text-slate-600 dark:text-slate-400">Theme</div>
                <ThemeToggle />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

