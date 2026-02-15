'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { NotConnectedScreen } from '@/components/not-connected-screen';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/ui/stat-card';
import {
  CASHFLOW_SOURCE_LABELS,
  type CashflowEvent,
  type CashflowEventSource,
  type CashflowSnapshotPayload,
} from '@/lib/plutus/cashflow/types';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  homeCurrency?: string;
  error?: string;
};

type CashflowCandidateAccount = {
  id: string;
  name: string;
  accountType: string;
  accountSubType: string | null;
  active: boolean;
  currencyCode: string | null;
  currentBalanceCents: number;
};

type CashflowConfig = {
  cashAccountIds: string[];
  weekStartsOn: number;
  settlementLookbackDays: number;
  settlementAverageCount: number;
  settlementDefaultIntervalDays: number;
  includeProjectedSettlements: boolean;
  includeOpenBills: boolean;
  includeOpenInvoices: boolean;
  includeRecurring: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshTimeLocal: string;
  autoRefreshMinSnapshotAgeMinutes: number;
};

type CashflowConfigResponse = {
  config: CashflowConfig;
  candidates: CashflowCandidateAccount[];
};

type AdjustmentDirection = 'inflow' | 'outflow';

type AdjustmentFormState = {
  date: string;
  amount: string;
  direction: AdjustmentDirection;
  description: string;
  notes: string;
};

type ConfigFormState = {
  cashAccountIds: string[];
  includeProjectedSettlements: boolean;
  includeOpenBills: boolean;
  includeOpenInvoices: boolean;
  includeRecurring: boolean;
  autoRefreshEnabled: boolean;
  autoRefreshTimeLocal: string;
  autoRefreshMinSnapshotAgeMinutes: number;
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMoneyFromCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function formatDateLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

function formatWeekRange(start: string, end: string): string {
  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function formatDateTime(iso: string | undefined): string {
  if (iso === undefined) {
    return '\u2014';
  }

  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseAmountToCents(amount: string): number {
  const value = Number(amount.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number');
  }

  return Math.round(value * 100);
}

function groupEventsBySource(events: CashflowEvent[]): Array<{ source: CashflowEventSource; events: CashflowEvent[] }> {
  const sourceOrder: CashflowEventSource[] = [
    'open_bill',
    'open_invoice',
    'recurring',
    'projected_settlement',
    'manual_adjustment',
  ];

  const map = new Map<CashflowEventSource, CashflowEvent[]>();
  for (const source of sourceOrder) {
    map.set(source, []);
  }

  for (const event of events) {
    const existing = map.get(event.source);
    if (existing) {
      existing.push(event);
    } else {
      map.set(event.source, [event]);
    }
  }

  return sourceOrder
    .map((source) => {
      const values = map.get(source);
      return {
        source,
        events: values === undefined ? [] : values,
      };
    })
    .filter((entry) => entry.events.length > 0);
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchSnapshot(refresh: boolean): Promise<CashflowSnapshotPayload> {
  const params = refresh ? '?refresh=1' : '';
  const res = await fetch(`${basePath}/api/plutus/cashflow/snapshot${params}`);

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  const data = await res.json();
  return data.snapshot as CashflowSnapshotPayload;
}

async function fetchCashflowConfig(): Promise<CashflowConfigResponse> {
  const res = await fetch(`${basePath}/api/plutus/cashflow/config`);

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  return res.json();
}

async function updateCashflowConfigRequest(body: ConfigFormState): Promise<CashflowConfig> {
  const res = await fetch(`${basePath}/api/plutus/cashflow/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  const data = await res.json();
  return data.config as CashflowConfig;
}

async function createAdjustmentRequest(body: {
  date: string;
  amountCents: number;
  description: string;
  notes?: string;
}): Promise<void> {
  const res = await fetch(`${basePath}/api/plutus/cashflow/adjustments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
}

function CashflowChart({ snapshot }: { snapshot: CashflowSnapshotPayload }) {
  const data = snapshot.forecast.weeks.map((week) => ({
    weekStart: week.weekStart,
    endingCash: week.endingCashCents / 100,
  }));

  return (
    <Card sx={{ borderColor: 'rgba(203,213,225,0.7)' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Projected Ending Cash</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>13-week horizon</Typography>
          </Box>
        </Box>

        <Box sx={{ height: 288, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.35} />
              <XAxis
                dataKey="weekStart"
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatDateLabel(String(value))}
                tick={{ fontSize: 12, fill: '#64748B' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickFormatter={(value) => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
              />
              <Tooltip
                formatter={(value: number) => formatMoneyFromCents(Math.round(value * 100), snapshot.currencyCode)}
                labelFormatter={(label) => `Week of ${formatDateLabel(String(label))}`}
              />
              <Line
                type="monotone"
                dataKey="endingCash"
                stroke="#0F766E"
                strokeWidth={2.5}
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function CashflowPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [expandedWeekStart, setExpandedWeekStart] = useState<string | null>(null);

  const [configForm, setConfigForm] = useState<ConfigFormState>({
    cashAccountIds: [],
    includeProjectedSettlements: true,
    includeOpenBills: true,
    includeOpenInvoices: true,
    includeRecurring: true,
    autoRefreshEnabled: true,
    autoRefreshTimeLocal: '06:00',
    autoRefreshMinSnapshotAgeMinutes: 720,
  });

  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentFormState>({
    date: todayDateString(),
    amount: '',
    direction: 'outflow',
    description: '',
    notes: '',
  });

  const { data: connection, isLoading: checkingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30_000,
  });

  const snapshotQuery = useQuery({
    queryKey: ['cashflow-snapshot'],
    queryFn: () => fetchSnapshot(false),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5_000,
  });

  const configQuery = useQuery({
    queryKey: ['cashflow-config'],
    queryFn: fetchCashflowConfig,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!configQuery.data) {
      return;
    }

    setConfigForm({
      cashAccountIds: configQuery.data.config.cashAccountIds,
      includeProjectedSettlements: configQuery.data.config.includeProjectedSettlements,
      includeOpenBills: configQuery.data.config.includeOpenBills,
      includeOpenInvoices: configQuery.data.config.includeOpenInvoices,
      includeRecurring: configQuery.data.config.includeRecurring,
      autoRefreshEnabled: configQuery.data.config.autoRefreshEnabled,
      autoRefreshTimeLocal: configQuery.data.config.autoRefreshTimeLocal,
      autoRefreshMinSnapshotAgeMinutes: configQuery.data.config.autoRefreshMinSnapshotAgeMinutes,
    });
  }, [configQuery.data]);

  const refreshMutation = useMutation({
    mutationFn: () => fetchSnapshot(true),
    onSuccess: (snapshot) => {
      queryClient.setQueryData(['cashflow-snapshot'], snapshot);
      enqueueSnackbar('Cashflow snapshot refreshed', { variant: 'success' });
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : 'Failed to refresh cashflow snapshot', { variant: 'error' });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (body: ConfigFormState) => updateCashflowConfigRequest(body),
    onSuccess: () => {
      enqueueSnackbar('Cashflow config updated', { variant: 'success' });
      setConfigDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cashflow-config'] });
      refreshMutation.mutate();
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : 'Failed to update config', { variant: 'error' });
    },
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: createAdjustmentRequest,
    onSuccess: () => {
      enqueueSnackbar('Adjustment created', { variant: 'success' });
      setAdjustmentDialogOpen(false);
      setAdjustmentForm({
        date: todayDateString(),
        amount: '',
        direction: 'outflow',
        description: '',
        notes: '',
      });
      refreshMutation.mutate();
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : 'Failed to create adjustment', { variant: 'error' });
    },
  });

  const snapshot = snapshotQuery.data;

  const chartKey = useMemo(() => {
    if (!snapshot) {
      return 'empty';
    }

    const lastWeek = snapshot.forecast.weeks[snapshot.forecast.weeks.length - 1];
    if (!lastWeek) {
      return 'empty';
    }

    return `${snapshot.id === undefined ? snapshot.asOfDate : snapshot.id}:${lastWeek.endingCashCents}`;
  }, [snapshot]);

  if (checkingConnection) {
    return (
      <Box
        component="main"
        sx={{
          mx: 'auto',
          display: 'flex',
          width: '100%',
          maxWidth: '80rem',
          flex: 1,
          flexDirection: 'column',
          gap: 3,
          px: { xs: 2, sm: 3, lg: 4 },
          py: 3,
        }}
      >
        <Skeleton sx={{ height: 64, width: '100%' }} />
        <Skeleton sx={{ height: 288, width: '100%' }} />
      </Box>
    );
  }

  if (connection !== undefined && connection.connected !== true) {
    return (
      <Box
        component="main"
        sx={{
          mx: 'auto',
          width: '100%',
          maxWidth: '80rem',
          flex: 1,
          px: { xs: 2, sm: 3, lg: 4 },
          py: 3,
        }}
      >
        <NotConnectedScreen title="cashflow forecast" error={connection.error} />
      </Box>
    );
  }

  const isLoading = snapshotQuery.isLoading || snapshot === undefined;
  const configForHeader = configQuery.data?.config;

  let autoRefreshStatus = 'Auto refresh: \u2014';
  if (configForHeader !== undefined) {
    autoRefreshStatus = `Auto refresh: ${configForHeader.autoRefreshEnabled ? 'On' : 'Off'} \u2022 Time: ${configForHeader.autoRefreshTimeLocal}`;
  }

  return (
    <Box
      component="main"
      sx={{
        mx: 'auto',
        display: 'flex',
        width: '100%',
        maxWidth: '80rem',
        flex: 1,
        flexDirection: 'column',
        gap: 3,
        px: { xs: 2, sm: 3, lg: 4 },
        py: 3,
      }}
    >
      <PageHeader
        title="Cashflow (13-Week)"
        description={(
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Box>{`Last refreshed: ${formatDateTime(snapshot?.createdAt)}`}</Box>
            <Box>{autoRefreshStatus}</Box>
          </Box>
        )}
        actions={(
          <>
            <Button
              variant="outlined"
              sx={{ borderColor: 'divider', color: 'text.primary' }}
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshIcon sx={{ fontSize: 16, mr: 1 }} />
              Refresh
            </Button>
            <Button
              variant="outlined"
              sx={{ borderColor: 'divider', color: 'text.primary' }}
              onClick={() => setConfigDialogOpen(true)}
            >
              <SettingsIcon sx={{ fontSize: 16, mr: 1 }} />
              Configure Cash Accounts
            </Button>
            <Button
              variant="outlined"
              sx={{ borderColor: 'divider', color: 'text.primary' }}
              onClick={() => setAdjustmentDialogOpen(true)}
            >
              <AddIcon sx={{ fontSize: 16, mr: 1 }} />
              Add Adjustment
            </Button>
            <Button
              component="a"
              variant="outlined"
              sx={{ borderColor: 'divider', color: 'text.primary' }}
              disabled={snapshot === undefined}
              href={
                snapshot === undefined
                  ? '#'
                  : `${basePath}/api/plutus/cashflow/export?format=csv&snapshotId=${encodeURIComponent(snapshot.id === undefined ? '' : snapshot.id)}`
              }
            >
              <DownloadIcon sx={{ fontSize: 16, mr: 1 }} />
              Export CSV
            </Button>
            <Button
              component="a"
              variant="outlined"
              sx={{ borderColor: 'divider', color: 'text.primary' }}
              disabled={snapshot === undefined}
              href={
                snapshot === undefined
                  ? '#'
                  : `${basePath}/api/plutus/cashflow/export?format=json&snapshotId=${encodeURIComponent(snapshot.id === undefined ? '' : snapshot.id)}`
              }
            >
              <DownloadIcon sx={{ fontSize: 16, mr: 1 }} />
              Export JSON
            </Button>
          </>
        )}
      />

      {isLoading ? (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            <Skeleton sx={{ height: 112, width: '100%' }} />
            <Skeleton sx={{ height: 112, width: '100%' }} />
            <Skeleton sx={{ height: 112, width: '100%' }} />
          </Box>
          <Skeleton sx={{ height: 288, width: '100%' }} />
          <Skeleton sx={{ height: 384, width: '100%' }} />
        </>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            <StatCard
              label="Current Starting Cash"
              value={formatMoneyFromCents(snapshot.forecast.startingCashCents, snapshot.currencyCode)}
              icon={<AccountBalanceWalletIcon sx={{ fontSize: 20 }} />}
            />
            <StatCard
              label="Minimum Projected Ending Cash"
              value={formatMoneyFromCents(snapshot.forecast.summary.minCashCents, snapshot.currencyCode)}
              icon={<TrendingDownIcon sx={{ fontSize: 20 }} />}
              trend={{
                direction: snapshot.forecast.summary.minCashCents < 0 ? 'down' : 'neutral',
                label: `Week of ${formatDateLabel(snapshot.forecast.summary.minCashWeekStart)}`,
              }}
            />
            <StatCard
              label="Week 13 Ending Cash"
              value={formatMoneyFromCents(snapshot.forecast.summary.endCashCents, snapshot.currencyCode)}
              icon={<AccountBalanceWalletIcon sx={{ fontSize: 20 }} />}
            />
          </Box>

          <CashflowChart key={chartKey} snapshot={snapshot} />

          <Card sx={{ borderColor: 'rgba(203,213,225,0.7)' }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ borderBottom: 1, borderColor: 'rgba(203,213,225,0.7)', px: 2.5, py: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Weekly Forecast</Typography>
              </Box>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 220 }}>Week</TableCell>
                    <TableCell>Starting</TableCell>
                    <TableCell>Inflows</TableCell>
                    <TableCell>Outflows</TableCell>
                    <TableCell>Ending</TableCell>
                    <TableCell sx={{ width: 120 }}>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {snapshot.forecast.weeks.map((week) => {
                    const expanded = expandedWeekStart === week.weekStart;
                    const groupedEvents = groupEventsBySource(week.events);

                    return (
                      <>
                        <TableRow key={week.weekStart}>
                          <TableCell sx={{ fontWeight: 500 }}>{formatWeekRange(week.weekStart, week.weekEnd)}</TableCell>
                          <TableCell>{formatMoneyFromCents(week.startingCashCents, snapshot.currencyCode)}</TableCell>
                          <TableCell sx={{ color: '#15803d' }}>
                            {formatMoneyFromCents(week.inflowsCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell sx={{ color: '#b91c1c' }}>
                            {formatMoneyFromCents(week.outflowsCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell sx={{ ...(week.endingCashCents < 0 && { color: '#b91c1c' }) }}>
                            {formatMoneyFromCents(week.endingCashCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="text"
                              size="small"
                              sx={{ color: 'text.secondary' }}
                              onClick={() => setExpandedWeekStart(expanded ? null : week.weekStart)}
                            >
                              {expanded ? 'Hide' : 'View'}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ bgcolor: 'rgba(248,250,252,0.7)' }}>
                              {groupedEvents.length === 0 ? (
                                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No events scheduled for this week.</Typography>
                              ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 0.5 }}>
                                  {groupedEvents.map((group) => (
                                    <Box key={group.source}>
                                      <Typography sx={{ mb: 0.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                                        {group.source === 'projected_settlement'
                                          ? `${CASHFLOW_SOURCE_LABELS[group.source]} (Projected)`
                                          : CASHFLOW_SOURCE_LABELS[group.source]}
                                      </Typography>
                                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        {group.events.map((event, index) => (
                                          <Box
                                            key={`${group.source}-${event.date}-${index}`}
                                            sx={{
                                              display: 'flex',
                                              flexWrap: 'wrap',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              gap: 1,
                                              borderRadius: 1.5,
                                              border: 1,
                                              borderColor: 'rgba(203,213,225,0.6)',
                                              bgcolor: 'background.paper',
                                              px: 1.5,
                                              py: 1,
                                              fontSize: '0.875rem',
                                            }}
                                          >
                                            <Box sx={{ minWidth: 0 }}>
                                              <Typography sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.875rem' }}>{event.label}</Typography>
                                              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{formatDateLabel(event.date)}</Typography>
                                            </Box>
                                            <Typography sx={{ fontWeight: 500, color: event.amountCents < 0 ? '#b91c1c' : '#15803d', fontSize: '0.875rem' }}>
                                              {formatMoneyFromCents(event.amountCents, snapshot.currencyCode)}
                                            </Typography>
                                          </Box>
                                        ))}
                                      </Box>
                                    </Box>
                                  ))}
                                </Box>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {snapshot.warnings.length > 0 && (
            <Card sx={{ borderColor: 'rgba(217,169,80,0.7)', bgcolor: 'rgba(255,251,235,0.5)' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: '#92400e' }}>Warnings</Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {snapshot.warnings.map((warning, index) => (
                    <Box key={`${warning.code}-${index}`} sx={{ fontSize: '0.875rem', color: 'rgba(120,53,15,0.9)' }}>
                      <Box component="span" sx={{ fontWeight: 500 }}>{warning.message}</Box>
                      {warning.detail && <Box component="span" sx={{ ml: 1, color: '#92400e' }}>{warning.detail}</Box>}
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}
      >
        <DialogContent sx={{ maxHeight: '88vh', overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <DialogTitle sx={{ p: 0 }}>Configure Cash Accounts</DialogTitle>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Select the accounts that represent available cash and enable/disable forecast sources.
              </Typography>
            </Box>
            <IconButton onClick={() => setConfigDialogOpen(false)} size="small" sx={{ mt: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {configQuery.isLoading ? (
            <Skeleton sx={{ height: 224, width: '100%', mt: 2 }} />
          ) : configQuery.data ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Cash On Hand Accounts</Typography>
                <Box sx={{ maxHeight: 288, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto', borderRadius: 2, border: 1, borderColor: 'divider', p: 1.5 }}>
                  {configQuery.data.candidates.map((candidate) => {
                    const checked = configForm.cashAccountIds.includes(candidate.id);

                    return (
                      <Box
                        component="label"
                        key={candidate.id}
                        sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderRadius: 1.5, px: 1, py: 0.75, '&:hover': { bgcolor: 'action.hover' } }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{candidate.name}</Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {candidate.accountType}
                            {candidate.accountSubType === null ? '' : ` \u2022 ${candidate.accountSubType}`}
                            {candidate.currencyCode === null ? '' : ` \u2022 ${candidate.currencyCode}`}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {formatMoneyFromCents(
                              candidate.currentBalanceCents,
                              candidate.currencyCode === null
                                ? snapshot?.currencyCode === undefined
                                  ? 'USD'
                                  : snapshot.currencyCode
                                : candidate.currencyCode,
                            )}
                          </Typography>
                          <input
                            type="checkbox"
                            style={{ height: 16, width: 16 }}
                            checked={checked}
                            onChange={(event) => {
                              setConfigForm((current) => {
                                if (event.target.checked) {
                                  if (current.cashAccountIds.includes(candidate.id)) {
                                    return current;
                                  }

                                  return {
                                    ...current,
                                    cashAccountIds: [...current.cashAccountIds, candidate.id],
                                  };
                                }

                                return {
                                  ...current,
                                  cashAccountIds: current.cashAccountIds.filter((id) => id !== candidate.id),
                                };
                              });
                            }}
                          />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Included Inputs</Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, border: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Open Bills</Typography>
                  <Switch
                    checked={configForm.includeOpenBills}
                    onChange={(_, checked) => setConfigForm((current) => ({ ...current, includeOpenBills: checked }))}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, border: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Open Invoices</Typography>
                  <Switch
                    checked={configForm.includeOpenInvoices}
                    onChange={(_, checked) => setConfigForm((current) => ({ ...current, includeOpenInvoices: checked }))}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, border: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Recurring Transactions</Typography>
                  <Switch
                    checked={configForm.includeRecurring}
                    onChange={(_, checked) => setConfigForm((current) => ({ ...current, includeRecurring: checked }))}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, border: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Projected Amazon Settlements</Typography>
                  <Switch
                    checked={configForm.includeProjectedSettlements}
                    onChange={(_, checked) =>
                      setConfigForm((current) => ({
                        ...current,
                        includeProjectedSettlements: checked,
                      }))
                    }
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Daily Auto Refresh</Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 2, border: 1, borderColor: 'divider', px: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.primary' }}>Enabled</Typography>
                  <Switch
                    checked={configForm.autoRefreshEnabled}
                    onChange={(_, checked) =>
                      setConfigForm((current) => ({
                        ...current,
                        autoRefreshEnabled: checked,
                      }))
                    }
                  />
                </Box>

                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                      Time (Local)
                    </Typography>
                    <TextField
                      type="time"
                      size="small"
                      value={configForm.autoRefreshTimeLocal}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          autoRefreshTimeLocal: event.target.value,
                        }))
                      }
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                      Min Snapshot Age (minutes)
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      slotProps={{ htmlInput: { min: 0, step: 1 } }}
                      value={String(configForm.autoRefreshMinSnapshotAgeMinutes)}
                      onChange={(event) => {
                        const parsed = Number.parseInt(event.target.value, 10);
                        if (!Number.isFinite(parsed)) {
                          return;
                        }

                        setConfigForm((current) => ({
                          ...current,
                          autoRefreshMinSnapshotAgeMinutes: parsed,
                        }));
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Unable to load config.</Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" sx={{ borderColor: 'divider', color: 'text.primary' }} onClick={() => setConfigDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }}
            onClick={() => saveConfigMutation.mutate(configForm)}
            disabled={saveConfigMutation.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={adjustmentDialogOpen}
        onClose={() => setAdjustmentDialogOpen(false)}
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}
      >
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <DialogTitle sx={{ p: 0 }}>Add Adjustment</DialogTitle>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Add a known one-off inflow or outflow to the forecast.
              </Typography>
            </Box>
            <IconButton onClick={() => setAdjustmentDialogOpen(false)} size="small" sx={{ mt: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Date</Typography>
              <TextField
                type="date"
                size="small"
                value={adjustmentForm.date}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, date: event.target.value }))}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Amount</Typography>
              <TextField
                type="number"
                size="small"
                slotProps={{ htmlInput: { inputMode: 'decimal', min: 0, step: 0.01 } }}
                placeholder="0.00"
                value={adjustmentForm.amount}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Direction</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
                <Button
                  type="button"
                  variant={adjustmentForm.direction === 'inflow' ? 'contained' : 'outlined'}
                  sx={adjustmentForm.direction === 'inflow'
                    ? { bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }
                    : { borderColor: 'divider', color: 'text.primary' }
                  }
                  onClick={() => setAdjustmentForm((current) => ({ ...current, direction: 'inflow' }))}
                >
                  Inflow
                </Button>
                <Button
                  type="button"
                  variant={adjustmentForm.direction === 'outflow' ? 'contained' : 'outlined'}
                  sx={adjustmentForm.direction === 'outflow'
                    ? { bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }
                    : { borderColor: 'divider', color: 'text.primary' }
                  }
                  onClick={() => setAdjustmentForm((current) => ({ ...current, direction: 'outflow' }))}
                >
                  Outflow
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Description</Typography>
              <TextField
                size="small"
                placeholder="Description"
                value={adjustmentForm.description}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Notes (optional)</Typography>
              <TextField
                size="small"
                placeholder="Optional note"
                value={adjustmentForm.notes}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" sx={{ borderColor: 'divider', color: 'text.primary' }} onClick={() => setAdjustmentDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }}
            onClick={() => {
              try {
                const absCents = parseAmountToCents(adjustmentForm.amount);
                const amountCents = adjustmentForm.direction === 'inflow' ? absCents : -absCents;
                const description = adjustmentForm.description.trim();

                if (description === '') {
                  throw new Error('Description is required');
                }

                const notesTrimmed = adjustmentForm.notes.trim();

                createAdjustmentMutation.mutate({
                  date: adjustmentForm.date,
                  amountCents,
                  description,
                  notes: notesTrimmed === '' ? undefined : notesTrimmed,
                });
              } catch (error) {
                enqueueSnackbar(error instanceof Error ? error.message : 'Invalid adjustment', { variant: 'error' });
              }
            }}
            disabled={createAdjustmentMutation.isPending}
          >
            Save Adjustment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
