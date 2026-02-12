'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Plus,
  RefreshCcw,
  Settings2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
    return '—';
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
    <Card className="border-slate-200/70 dark:border-white/10">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Projected Ending Cash</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">13-week horizon</p>
          </div>
        </div>

        <div className="h-72 w-full">
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
        </div>
      </CardContent>
    </Card>
  );
}

export default function CashflowPage() {
  const queryClient = useQueryClient();

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
      toast.success('Cashflow snapshot refreshed');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to refresh cashflow snapshot');
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (body: ConfigFormState) => updateCashflowConfigRequest(body),
    onSuccess: () => {
      toast.success('Cashflow config updated');
      setConfigDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['cashflow-config'] });
      refreshMutation.mutate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update config');
    },
  });

  const createAdjustmentMutation = useMutation({
    mutationFn: createAdjustmentRequest,
    onSuccess: () => {
      toast.success('Adjustment created');
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
      toast.error(error instanceof Error ? error.message : 'Failed to create adjustment');
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
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </main>
    );
  }

  if (connection !== undefined && connection.connected !== true) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <NotConnectedScreen title="cashflow forecast" error={connection.error} />
      </main>
    );
  }

  const isLoading = snapshotQuery.isLoading || snapshot === undefined;
  const configForHeader = configQuery.data?.config;

  let autoRefreshStatus = 'Auto refresh: —';
  if (configForHeader !== undefined) {
    autoRefreshStatus = `Auto refresh: ${configForHeader.autoRefreshEnabled ? 'On' : 'Off'} • Time: ${configForHeader.autoRefreshTimeLocal}`;
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Cashflow (13-Week)"
        description={(
          <div className="space-y-0.5">
            <div>{`Last refreshed: ${formatDateTime(snapshot?.createdAt)}`}</div>
            <div>{autoRefreshStatus}</div>
          </div>
        )}
        actions={(
          <>
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Configure Cash Accounts
            </Button>
            <Button
              variant="outline"
              onClick={() => setAdjustmentDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Adjustment
            </Button>
            <Button
              asChild
              variant="outline"
              disabled={snapshot === undefined}
            >
              <a
                href={
                  snapshot === undefined
                    ? '#'
                    : `${basePath}/api/plutus/cashflow/export?format=csv&snapshotId=${encodeURIComponent(snapshot.id === undefined ? '' : snapshot.id)}`
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              disabled={snapshot === undefined}
            >
              <a
                href={
                  snapshot === undefined
                    ? '#'
                    : `${basePath}/api/plutus/cashflow/export?format=json&snapshotId=${encodeURIComponent(snapshot.id === undefined ? '' : snapshot.id)}`
                }
              >
                <Download className="mr-2 h-4 w-4" />
                Export JSON
              </a>
            </Button>
          </>
        )}
      />

      {isLoading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-96 w-full" />
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Current Starting Cash"
              value={formatMoneyFromCents(snapshot.forecast.startingCashCents, snapshot.currencyCode)}
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Minimum Projected Ending Cash"
              value={formatMoneyFromCents(snapshot.forecast.summary.minCashCents, snapshot.currencyCode)}
              icon={<TrendingDown className="h-5 w-5" />}
              trend={{
                direction: snapshot.forecast.summary.minCashCents < 0 ? 'down' : 'neutral',
                label: `Week of ${formatDateLabel(snapshot.forecast.summary.minCashWeekStart)}`,
              }}
            />
            <StatCard
              label="Week 13 Ending Cash"
              value={formatMoneyFromCents(snapshot.forecast.summary.endCashCents, snapshot.currencyCode)}
              icon={<Wallet className="h-5 w-5" />}
            />
          </div>

          <CashflowChart key={chartKey} snapshot={snapshot} />

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-0">
              <div className="border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Weekly Forecast</h3>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Week</TableHead>
                    <TableHead>Starting</TableHead>
                    <TableHead>Inflows</TableHead>
                    <TableHead>Outflows</TableHead>
                    <TableHead>Ending</TableHead>
                    <TableHead className="w-[120px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.forecast.weeks.map((week) => {
                    const expanded = expandedWeekStart === week.weekStart;
                    const groupedEvents = groupEventsBySource(week.events);

                    return (
                      <>
                        <TableRow key={week.weekStart}>
                          <TableCell className="font-medium">{formatWeekRange(week.weekStart, week.weekEnd)}</TableCell>
                          <TableCell>{formatMoneyFromCents(week.startingCashCents, snapshot.currencyCode)}</TableCell>
                          <TableCell className="text-emerald-700 dark:text-emerald-300">
                            {formatMoneyFromCents(week.inflowsCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell className="text-red-700 dark:text-red-300">
                            {formatMoneyFromCents(week.outflowsCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell className={week.endingCashCents < 0 ? 'text-red-700 dark:text-red-300' : ''}>
                            {formatMoneyFromCents(week.endingCashCents, snapshot.currencyCode)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedWeekStart(expanded ? null : week.weekStart)}
                            >
                              {expanded ? 'Hide' : 'View'}
                            </Button>
                          </TableCell>
                        </TableRow>

                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-slate-50/70 dark:bg-slate-900/40">
                              {groupedEvents.length === 0 ? (
                                <div className="text-sm text-slate-500 dark:text-slate-400">No events scheduled for this week.</div>
                              ) : (
                                <div className="space-y-4 py-1">
                                  {groupedEvents.map((group) => (
                                    <div key={group.source}>
                                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {group.source === 'projected_settlement'
                                          ? `${CASHFLOW_SOURCE_LABELS[group.source]} (Projected)`
                                          : CASHFLOW_SOURCE_LABELS[group.source]}
                                      </div>
                                      <div className="space-y-1">
                                        {group.events.map((event, index) => (
                                          <div
                                            key={`${group.source}-${event.date}-${index}`}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200/60 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-900"
                                          >
                                            <div className="min-w-0">
                                              <div className="font-medium text-slate-900 dark:text-white">{event.label}</div>
                                              <div className="text-xs text-slate-500 dark:text-slate-400">{formatDateLabel(event.date)}</div>
                                            </div>
                                            <div className={event.amountCents < 0 ? 'text-red-700 dark:text-red-300 font-medium' : 'text-emerald-700 dark:text-emerald-300 font-medium'}>
                                              {formatMoneyFromCents(event.amountCents, snapshot.currencyCode)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
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
            <Card className="border-amber-200/70 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Warnings</h3>
                <div className="mt-2 space-y-2">
                  {snapshot.warnings.map((warning, index) => (
                    <div key={`${warning.code}-${index}`} className="text-sm text-amber-900/90 dark:text-amber-200/90">
                      <span className="font-medium">{warning.message}</span>
                      {warning.detail && <span className="ml-2 text-amber-700 dark:text-amber-300">{warning.detail}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configure Cash Accounts</DialogTitle>
            <DialogDescription>
              Select the accounts that represent available cash and enable/disable forecast sources.
            </DialogDescription>
          </DialogHeader>

          {configQuery.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : configQuery.data ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Cash On Hand Accounts</div>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-white/10">
                  {configQuery.data.candidates.map((candidate) => {
                    const checked = configForm.cashAccountIds.includes(candidate.id);

                    return (
                      <label
                        key={candidate.id}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-white/5"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">{candidate.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {candidate.accountType}
                            {candidate.accountSubType === null ? '' : ` • ${candidate.accountSubType}`}
                            {candidate.currencyCode === null ? '' : ` • ${candidate.currencyCode}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            {formatMoneyFromCents(
                              candidate.currentBalanceCents,
                              candidate.currencyCode === null
                                ? snapshot?.currencyCode === undefined
                                  ? 'USD'
                                  : snapshot.currencyCode
                                : candidate.currencyCode,
                            )}
                          </div>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
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
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Included Inputs</div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Open Bills</span>
                  <Switch
                    checked={configForm.includeOpenBills}
                    onCheckedChange={(value) => setConfigForm((current) => ({ ...current, includeOpenBills: value }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Open Invoices</span>
                  <Switch
                    checked={configForm.includeOpenInvoices}
                    onCheckedChange={(value) => setConfigForm((current) => ({ ...current, includeOpenInvoices: value }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Recurring Transactions</span>
                  <Switch
                    checked={configForm.includeRecurring}
                    onCheckedChange={(value) => setConfigForm((current) => ({ ...current, includeRecurring: value }))}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Projected Amazon Settlements</span>
                  <Switch
                    checked={configForm.includeProjectedSettlements}
                    onCheckedChange={(value) =>
                      setConfigForm((current) => ({
                        ...current,
                        includeProjectedSettlements: value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Daily Auto Refresh</div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                  <span className="text-sm text-slate-800 dark:text-slate-200">Enabled</span>
                  <Switch
                    checked={configForm.autoRefreshEnabled}
                    onCheckedChange={(value) =>
                      setConfigForm((current) => ({
                        ...current,
                        autoRefreshEnabled: value,
                      }))
                    }
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Time (Local)
                    </div>
                    <Input
                      type="time"
                      value={configForm.autoRefreshTimeLocal}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          autoRefreshTimeLocal: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Min Snapshot Age (minutes)
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="1"
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
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400">Unable to load config.</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveConfigMutation.mutate(configForm)}
              disabled={saveConfigMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Adjustment</DialogTitle>
            <DialogDescription>
              Add a known one-off inflow or outflow to the forecast.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Date</div>
              <Input
                type="date"
                value={adjustmentForm.date}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, date: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Amount</div>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={adjustmentForm.amount}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Direction</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={adjustmentForm.direction === 'inflow' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentForm((current) => ({ ...current, direction: 'inflow' }))}
                >
                  Inflow
                </Button>
                <Button
                  type="button"
                  variant={adjustmentForm.direction === 'outflow' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentForm((current) => ({ ...current, direction: 'outflow' }))}
                >
                  Outflow
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Description</div>
              <Input
                placeholder="Description"
                value={adjustmentForm.description}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">Notes (optional)</div>
              <Input
                placeholder="Optional note"
                value={adjustmentForm.notes}
                onChange={(event) => setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
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
                  toast.error(error instanceof Error ? error.message : 'Invalid adjustment');
                }
              }}
              disabled={createAdjustmentMutation.isPending}
            >
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
