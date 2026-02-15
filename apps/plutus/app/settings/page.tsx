'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { Select, SelectItem } from '@/components/ui/select';
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
  const { enqueueSnackbar } = useSnackbar();
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
      enqueueSnackbar('Disconnected from QuickBooks', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Failed to disconnect', { variant: 'error' });
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
      enqueueSnackbar('Notification preferences saved', { variant: 'success' });
    },
    onError: () => {
      enqueueSnackbar('Failed to save notification preferences', { variant: 'error' });
    },
  });

  const autopostMutation = useMutation({
    mutationFn: saveAutopostSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autopost-settings'] });
      enqueueSnackbar('Autopost settings saved', { variant: 'success' });
    },
    onError: (err) => {
      enqueueSnackbar(err instanceof Error ? err.message : 'Failed to save autopost settings', { variant: 'error' });
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
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader title="Settings" variant="accent" />

        <Box sx={{ mt: 3, display: 'grid', gap: 3 }}>
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                QuickBooks Online
              </Typography>
              <Typography sx={{ mt: 1, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                {isLoading ? 'Checking…' : status?.connected ? (status.companyName ?? 'Connected') : 'Not connected'}
              </Typography>
              {status?.connected && status.homeCurrency && (
                <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>Home currency: {status.homeCurrency}</Typography>
              )}
              {!isLoading && status?.connected === false && status.error && (
                <Typography sx={{ mt: 1, fontSize: '0.875rem', color: 'text.secondary' }}>{status.error}</Typography>
              )}

              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
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
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Notification Preferences
              </Typography>
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {NOTIFICATION_OPTIONS.map((option) => (
                  <Box key={option.key} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                        {option.label}
                      </Typography>
                      <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary' }}>
                        {option.description}
                      </Typography>
                    </Box>
                    <Switch
                      checked={localPrefs[option.key]}
                      onCheckedChange={() => handleToggle(option.key)}
                      disabled={notifLoading}
                    />
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Button
                  onClick={() => savePrefsMutation.mutate(localPrefs)}
                  disabled={!prefsDirty || savePrefsMutation.isPending}
                >
                  {savePrefsMutation.isPending ? 'Saving…' : 'Save Preferences'}
                </Button>
                {prefsDirty && (
                  <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Unsaved changes</Box>
                )}
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Autopost
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                Automatically process settlements that have matching audit data.
              </Typography>

              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Enable autopost</Typography>
                <Switch checked={autopostEnabled} onCheckedChange={setAutopostEnabled} />
              </Box>

              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>
                  Start autoposting from
                </Typography>
                <Input
                  type="date"
                  value={autopostStartDate}
                  onChange={(e) => setAutopostStartDate(e.target.value)}
                  sx={{ maxWidth: 320 }}
                />
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  Only process settlements posted on or after this date. Leave empty to process all.
                </Typography>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Button onClick={handleSaveAutopost} disabled={autopostMutation.isPending}>
                  {autopostMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Appearance
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Theme</Typography>
                <ThemeToggle />
              </Box>
            </CardContent>
          </Card>

          {/* Users */}
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                Users
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                Users with access to Plutus
              </Typography>

              <Box sx={{ mt: 2, overflow: 'auto', borderRadius: 2, border: 1, borderColor: 'divider' }}>
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
                        <TableCell colSpan={3} sx={{ textAlign: 'center', fontSize: '0.875rem', color: 'text.disabled' }}>
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !usersData?.users?.length ? (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ textAlign: 'center', fontSize: '0.875rem', color: 'text.disabled' }}>
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      usersData.users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{user.name}</TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{user.role}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>

          {/* Audit Log */}
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                    Audit Log
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                    Recent activity across Plutus
                  </Typography>
                </Box>

                <Box sx={{ width: 224 }}>
                  <Select value={auditAction} onValueChange={handleAuditActionFilterChange} placeholder="Filter by action">
                    {ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </Select>
                </Box>
              </Box>

              <Box sx={{ mt: 2, overflow: 'auto', borderRadius: 2, border: 1, borderColor: 'divider' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead sx={{ width: 176 }}>Time</TableHead>
                      <TableHead sx={{ width: 144 }}>User</TableHead>
                      <TableHead sx={{ width: 176 }}>Action</TableHead>
                      <TableHead sx={{ width: 144 }}>Entity</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ textAlign: 'center', fontSize: '0.875rem', color: 'text.disabled' }}>
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : !auditData?.entries?.length ? (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ textAlign: 'center', fontSize: '0.875rem', color: 'text.disabled' }}>
                          No audit log entries
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditData.entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'text.secondary' }}>
                            {formatAuditTimestamp(entry.createdAt)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>{entry.userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ACTION_LABELS[entry.action] ?? entry.action}
                            </Badge>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {entry.entityType}
                            {entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ''}
                          </TableCell>
                          <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'text.secondary' }}>
                            {formatAuditDetails(entry.details)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </Box>

              {/* Pagination */}
              {auditData && auditData.pagination.totalPages > 1 && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    Page {auditData.pagination.page} of {auditData.pagination.totalPages}
                    {' '}({auditData.pagination.totalCount} entries)
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
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
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
