'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { QboConnectionStatus } from '@/lib/qbo/types';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

async function fetchQboStatus(): Promise<QboConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function disconnectQbo(): Promise<{ success: boolean }> {
  const res = await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
  return res.json();
}

export function QboStatusIndicator() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [showMenu, setShowMenu] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchQboStatus,
    staleTime: 5 * 60 * 1000,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectQbo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      toast.success('Disconnected from QuickBooks');
      setShowMenu(false);
    },
    onError: () => {
      toast.error('Failed to disconnect');
    },
  });

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
      toast.success('Successfully connected to QuickBooks!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (error) {
      const errorMessages: Record<string, string> = {
        invalid_params: 'Invalid OAuth parameters',
        invalid_state: 'Security check failed. Please try again.',
        token_exchange_failed: 'Failed to connect. Please try again.',
        connect_failed: 'Failed to initiate connection.',
      };
      const message = errorMessages[error];
      toast.error(message === undefined ? 'Connection failed' : message);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, queryClient]);

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = () => setShowMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showMenu]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10">
        <div className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
        <span className="text-sm text-slate-400 dark:text-slate-500">QBO</span>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors',
            'bg-emerald-50 dark:bg-emerald-900/30',
            'hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
          )}
        >
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping opacity-50" />
          </div>
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            QBO
          </span>
        </button>

        {showMenu && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl z-50"
          >
            <div className="p-3 border-b border-slate-100 dark:border-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Connected to
              </p>
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {status.companyName}
              </p>
            </div>
            <div className="p-2">
              <button
                onClick={handleDisconnect}
                disabled={disconnectMutation.isPending}
                className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors',
        'bg-slate-100 dark:bg-white/10',
        'hover:bg-slate-200 dark:hover:bg-white/20'
      )}
    >
      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
        Connect QBO
      </span>
    </button>
  );
}
