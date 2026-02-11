'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; companyName?: string; homeCurrency?: string; error?: string };

type NotificationPreferences = {
  onNewSettlement: boolean;
  onSettlementPosted: boolean;
  onProcessingError: boolean;
  onMonthlyAnalytics: boolean;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function disconnectQbo(): Promise<{ success: boolean }> {
  const res = await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
  return res.json();
}

async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(`${basePath}/api/plutus/notifications`);
  return res.json();
}

async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
  const res = await fetch(`${basePath}/api/plutus/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  return res.json();
}

type AutopostSettings = {
  autopostEnabled: boolean;
  autopostStartDate: string | null;
};

async function fetchAutopostSettings(): Promise<AutopostSettings> {
  const res = await fetch(`${basePath}/api/plutus/autopost`);
  return res.json();
}

async function saveAutopostSettings(data: { autopostEnabled: boolean; autopostStartDate: string | null }): Promise<{ ok: boolean }> {
  const res = await fetch(`${basePath}/api/plutus/autopost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

// --- Audit Log types & fetcher ---

type AuditLogEntry = {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
};

type AuditLogResponse = {
  entries: AuditLogEntry[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

async function fetchAuditLog(page: number, action?: string): Promise<AuditLogResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (action && action !== 'all') {
    params.set('action', action);
  }
  const res = await fetch(`${basePath}/api/plutus/audit-log?${params.toString()}`);
  return res.json();
}

// --- Users types & fetcher ---

type PlutusUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

async function fetchPlutusUsers(): Promise<{ users: PlutusUser[] }> {
  const res = await fetch(`${basePath}/api/plutus/users`);
  return res.json();
}

// --- Audit log helpers ---

const ACTION_LABELS: Record<string, string> = {
  SETTLEMENT_PROCESSED: 'Settlement Processed',
  SETTLEMENT_ROLLED_BACK: 'Settlement Rolled Back',
  BRAND_UPDATED: 'Brand Updated',
  SKU_UPDATED: 'SKU Updated',
  CONFIG_UPDATED: 'Config Updated',
  ACCOUNTS_CREATED: 'Accounts Created',
};

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'SETTLEMENT_PROCESSED', label: 'Settlement Processed' },
  { value: 'SETTLEMENT_ROLLED_BACK', label: 'Settlement Rolled Back' },
  { value: 'BRAND_UPDATED', label: 'Brand Updated' },
  { value: 'SKU_UPDATED', label: 'SKU Updated' },
  { value: 'CONFIG_UPDATED', label: 'Config Updated' },
  { value: 'ACCOUNTS_CREATED', label: 'Accounts Created' },
];

function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatAuditDetails(details: Record<string, unknown> | null): string {
  if (!details) return '';
  const entries = Object.entries(details);
  if (entries.length === 0) return '';
  return entries
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.join(', ')}`;
      return `${key}: ${String(value)}`;
    })
    .join('; ');
}

const NOTIFICATION_OPTIONS: Array<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  {
    key: 'onNewSettlement',
    label: 'New settlement imported',
    description: 'Get notified when a new settlement is imported from audit data',
  },
  {
    key: 'onSettlementPosted',
    label: 'Settlement posted to QBO',
    description: 'Get notified when a settlement is successfully posted to QuickBooks',
  },
  {
    key: 'onProcessingError',
    label: 'Processing errors',
    description: 'Get notified when a settlement processing error occurs',
  },
  {
    key: 'onMonthlyAnalytics',
    label: 'Monthly analytics summary',
    description: 'Receive a monthly summary of settlement and financial analytics',
  },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState('all');

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

  const { data: notifPrefs, isLoading: notifLoading } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: fetchNotificationPreferences,
    staleTime: 60 * 1000,
  });

  const [localPrefs, setLocalPrefs] = useState<NotificationPreferences>({
    onNewSettlement: true,
    onSettlementPosted: true,
    onProcessingError: true,
    onMonthlyAnalytics: false,
  });
  const [prefsDirty, setPrefsDirty] = useState(false);

  useEffect(() => {
    if (notifPrefs) {
      setLocalPrefs(notifPrefs);
      setPrefsDirty(false);
    }
  }, [notifPrefs]);

  const { data: autopostData } = useQuery({
    queryKey: ['autopost-settings'],
    queryFn: fetchAutopostSettings,
    staleTime: 30 * 1000,
  });

  const [autopostEnabled, setAutopostEnabled] = useState(false);
  const [autopostStartDate, setAutopostStartDate] = useState('');

  useEffect(() => {
    if (autopostData) {
      setAutopostEnabled(autopostData.autopostEnabled);
      setAutopostStartDate(
        autopostData.autopostStartDate
          ? autopostData.autopostStartDate.slice(0, 10)
          : '',
      );
    }
  }, [autopostData]);

  const savePrefsMutation = useMutation({
    mutationFn: saveNotificationPreferences,
    onSuccess: (saved) => {
      queryClient.setQueryData(['notification-preferences'], saved);
      setPrefsDirty(false);
      toast.success('Notification preferences saved');
    },
    onError: () => {
      toast.error('Failed to save notification preferences');
    },
  });

  const autopostMutation = useMutation({
    mutationFn: saveAutopostSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autopost-settings'] });
      toast.success('Autopost settings saved');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save autopost settings');
    },
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-log', auditPage, auditAction],
    queryFn: () => fetchAuditLog(auditPage, auditAction),
    staleTime: 15 * 1000,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['plutus-users'],
    queryFn: fetchPlutusUsers,
    staleTime: 60 * 1000,
  });

  function handleAuditActionFilterChange(value: string) {
    setAuditAction(value);
    setAuditPage(1);
  }

  function handleSaveAutopost() {
    autopostMutation.mutate({
      autopostEnabled,
      autopostStartDate: autopostStartDate.trim() === '' ? null : autopostStartDate.trim(),
    });
  }

  function handleToggle(key: keyof NotificationPreferences) {
    setLocalPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      setPrefsDirty(true);
      return updated;
    });
  }

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Settings" variant="accent" />

        <div className="mt-6 grid gap-6">
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
                Notification Preferences
              </div>
              <div className="mt-4 space-y-4">
                {NOTIFICATION_OPTIONS.map((option) => (
                  <div key={option.key} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {option.label}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {option.description}
                      </div>
                    </div>
                    <Switch
                      checked={localPrefs[option.key]}
                      onCheckedChange={() => handleToggle(option.key)}
                      disabled={notifLoading}
                      aria-label={option.label}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <Button
                  onClick={() => savePrefsMutation.mutate(localPrefs)}
                  disabled={!prefsDirty || savePrefsMutation.isPending}
                >
                  {savePrefsMutation.isPending ? 'Saving…' : 'Save Preferences'}
                </Button>
                {prefsDirty && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">Unsaved changes</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Autopost
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Automatically process settlements that have matching audit data.
              </p>

              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable autopost</div>
                <Switch checked={autopostEnabled} onCheckedChange={setAutopostEnabled} />
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Start autoposting from
                </div>
                <Input
                  type="date"
                  value={autopostStartDate}
                  onChange={(e) => setAutopostStartDate(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Only process settlements posted on or after this date. Leave empty to process all.
                </p>
              </div>

              <div className="mt-4">
                <Button onClick={handleSaveAutopost} disabled={autopostMutation.isPending}>
                  {autopostMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
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

          {/* Users */}
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Users
              </div>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Users with access to Plutus
              </p>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersLoading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-slate-400">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !usersData?.users?.length ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-slate-400">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersData.users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="text-sm font-medium">{user.name}</TableCell>
                          <TableCell className="text-sm">{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{user.role}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Audit Log */}
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Audit Log
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Recent activity across Plutus
                  </p>
                </div>

                <div className="w-56">
                  <Select value={auditAction} onValueChange={handleAuditActionFilterChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44">Time</TableHead>
                      <TableHead className="w-36">User</TableHead>
                      <TableHead className="w-44">Action</TableHead>
                      <TableHead className="w-36">Entity</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-400">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !auditData?.entries?.length ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-slate-400">
                          No audit log entries
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditData.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                            {formatAuditTimestamp(entry.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm">{entry.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ACTION_LABELS[entry.action] ?? entry.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {entry.entityType}
                            {entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ''}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-slate-500 dark:text-slate-400">
                            {formatAuditDetails(entry.details)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {auditData && auditData.pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Page {auditData.pagination.page} of {auditData.pagination.totalPages}
                    {' '}({auditData.pagination.totalCount} entries)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={auditData.pagination.page <= 1}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={auditData.pagination.page >= auditData.pagination.totalPages}
                      onClick={() => setAuditPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
