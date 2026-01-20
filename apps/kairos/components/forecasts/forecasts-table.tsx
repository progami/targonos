'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, Check, ExternalLink, Loader2, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ForecastListItem, ForecastModel, RegressorFutureMode, TimeSeriesListItem } from '@/types/kairos';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { SkeletonTable } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchJson } from '@/lib/api/client';

type RegressorSelection = {
  seriesId: string;
  futureMode: RegressorFutureMode;
};

const FORECASTS_QUERY_KEY = ['kairos', 'forecasts'] as const;
const SERIES_QUERY_KEY = ['kairos', 'time-series'] as const;

type ForecastsResponse = {
  forecasts: ForecastListItem[];
};

type TimeSeriesResponse = {
  series: TimeSeriesListItem[];
};

type CreateForecastResponse = {
  forecast: ForecastListItem;
  run?: unknown;
};

function parseHorizon(value: string) {
  const horizon = Number(value);
  if (!Number.isFinite(horizon) || !Number.isInteger(horizon)) {
    return null;
  }
  if (horizon < 1 || horizon > 3650) {
    return null;
  }
  return horizon;
}

function parseInterval(value: string) {
  const interval = Number(value);
  if (!Number.isFinite(interval)) {
    return null;
  }
  if (interval <= 0 || interval >= 1) {
    return null;
  }
  return interval;
}

function parseOptionalInt(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}
function RunForecastButton({ forecast }: { forecast: ForecastListItem }) {
  const queryClient = useQueryClient();

  const runMutation = useMutation({
    mutationFn: async () =>
      fetchJson<{ run: { status: string; errorMessage: string | null } }>(
        `/api/v1/forecasts/${forecast.id}/run`,
        { method: 'POST' },
      ),
    onSuccess: async (data) => {
      const status = String(data.run.status).toUpperCase();
      if (status === 'FAILED') {
        toast.error('Forecast run failed', { description: data.run.errorMessage ?? undefined });
      } else if (status === 'RUNNING') {
        toast.success('Forecast run started', { description: forecast.name });
      } else {
        toast.success('Forecast run complete', { description: forecast.name });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FORECASTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['kairos', 'forecast', forecast.id] }),
      ]);
    },
    onError: (error) => {
      toast.error('Run failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () =>
      fetchJson(`/api/v1/forecasts/${forecast.id}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      toast.success('Forecast run cancelled', { description: forecast.name });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FORECASTS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['kairos', 'forecast', forecast.id] }),
      ]);
    },
    onError: (error) => {
      toast.error('Cancel failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (forecast.status === 'RUNNING') {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={() => void cancelMutation.mutateAsync()}
        disabled={cancelMutation.isPending}
        className="gap-2"
      >
        {cancelMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <X className="h-4 w-4" aria-hidden />
        )}
        Cancel
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => void runMutation.mutateAsync()}
      disabled={runMutation.isPending}
      className="gap-2"
    >
      {runMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Play className="h-4 w-4" aria-hidden />
      )}
      Run
    </Button>
  );
}

function DeleteForecastButton({ forecast }: { forecast: ForecastListItem }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => fetchJson(`/api/v1/forecasts/${forecast.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Forecast deleted', { description: forecast.name });
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: FORECASTS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error('Delete failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={deleteMutation.isPending || forecast.status === 'RUNNING'}
          className="gap-2 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
        >
          {deleteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden />
          )}
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete forecast?</DialogTitle>
          <DialogDescription>
            This permanently deletes <span className="font-medium">{forecast.name}</span> and its run history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void deleteMutation.mutateAsync()}
            disabled={deleteMutation.isPending}
            className="gap-2"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" aria-hidden />
            )}
            Delete forecast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ForecastsTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSeriesId, setCreateSeriesId] = useState('');
  const [createHorizon, setCreateHorizon] = useState('26');
  const [createModel, setCreateModel] = useState<ForecastModel>('PROPHET');
  const [selectedRegressors, setSelectedRegressors] = useState<RegressorSelection[]>([]);

  const [prophetIntervalWidth, setProphetIntervalWidth] = useState('0.8');
  const [prophetUncertaintySamples, setProphetUncertaintySamples] = useState('200');

  const [etsSeasonLength, setEtsSeasonLength] = useState('7');
  const [etsSpec, setEtsSpec] = useState('ZZZ');
  const [etsIntervalLevel, setEtsIntervalLevel] = useState('0.8');

  useEffect(() => {
    const seriesId = searchParams.get('seriesId');
    if (!seriesId) return;
    setCreateSeriesId(seriesId);
    setCreateOpen(true);
  }, [searchParams]);

  const seriesQuery = useQuery({
    queryKey: SERIES_QUERY_KEY,
    queryFn: async () => fetchJson<TimeSeriesResponse>('/api/v1/time-series'),
  });

  const forecastsQuery = useQuery({
    queryKey: FORECASTS_QUERY_KEY,
    queryFn: async () => fetchJson<ForecastsResponse>('/api/v1/forecasts'),
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.forecasts?.some((f) => f.status === 'RUNNING');
      return hasRunning ? 5000 : false;
    },
  });

  const selectedSeries = useMemo(() => {
    const series = seriesQuery.data?.series ?? [];
    return series.find((s) => s.id === createSeriesId) ?? null;
  }, [seriesQuery.data, createSeriesId]);

  // Available regressors = all series except the selected target
  const availableRegressors = useMemo(() => {
    const series = seriesQuery.data?.series ?? [];
    if (!createSeriesId) return series;
    return series.filter((s) => s.id !== createSeriesId);
  }, [seriesQuery.data, createSeriesId]);

  // Clear regressors when target changes or when switching to ETS
  useEffect(() => {
    setSelectedRegressors([]);
  }, [createSeriesId]);

  useEffect(() => {
    if (createModel !== 'PROPHET') {
      setSelectedRegressors([]);
    }
  }, [createModel]);

  const toggleRegressor = (seriesId: string) => {
    setSelectedRegressors((prev) => {
      const existing = prev.find((r) => r.seriesId === seriesId);
      if (existing) {
        return prev.filter((r) => r.seriesId !== seriesId);
      }
      return [...prev, { seriesId, futureMode: 'FORECAST' as RegressorFutureMode }];
    });
  };

  const updateRegressorMode = (seriesId: string, futureMode: RegressorFutureMode) => {
    setSelectedRegressors((prev) =>
      prev.map((r) => (r.seriesId === seriesId ? { ...r, futureMode } : r)),
    );
  };

  useEffect(() => {
    if (!selectedSeries) return;
    if (selectedSeries.granularity === 'WEEKLY') {
      setEtsSeasonLength('52');
    } else {
      setEtsSeasonLength('7');
    }
  }, [selectedSeries]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const horizon = parseHorizon(createHorizon);
      if (!horizon) {
        throw new Error('Horizon must be an integer between 1 and 3650.');
      }

      const name = (() => {
        const trimmed = createName.trim();
        if (trimmed.length > 0) return trimmed;
        if (selectedSeries) return `${selectedSeries.name} (${createModel})`;
        return `${createModel} Forecast`;
      })();

      const config = ['PROPHET', 'NEURALPROPHET'].includes(createModel)
        ? {
            intervalWidth: parseInterval(prophetIntervalWidth) ?? undefined,
            uncertaintySamples: parseOptionalInt(prophetUncertaintySamples) ?? undefined,
          }
        : {
            seasonLength: parseOptionalInt(etsSeasonLength) ?? undefined,
            spec: (() => {
              const spec = etsSpec.trim();
              return spec.length > 0 ? spec : undefined;
            })(),
            intervalLevel: etsIntervalLevel.trim() === '' ? null : (parseInterval(etsIntervalLevel) ?? undefined),
          };

      const configCleaned = Object.fromEntries(
        Object.entries(config).filter(([, value]) => value !== undefined),
      );

      return fetchJson<CreateForecastResponse>('/api/v1/forecasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          targetSeriesId: createSeriesId,
          regressors: selectedRegressors,
          model: createModel,
          horizon,
          runNow: true,
          config: Object.keys(configCleaned).length > 0 ? configCleaned : undefined,
        }),
      });
    },
    onSuccess: async (data) => {
      toast.success('Forecast created', { description: data.forecast.name });
      setCreateOpen(false);
      setCreateName('');
      setCreateHorizon('26');
      setCreateModel('PROPHET');
      setSelectedRegressors([]);
      setProphetIntervalWidth('0.8');
      setProphetUncertaintySamples('200');
      await queryClient.invalidateQueries({ queryKey: FORECASTS_QUERY_KEY });
      router.push(`/forecasts/${data.forecast.id}`);
    },
    onError: (error) => {
      toast.error('Create failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const data = forecastsQuery.data?.forecasts ?? [];

  const columns = useMemo<ColumnDef<ForecastListItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Forecast
            <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-slate-100">
              {row.original.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{row.original.targetSeries.name}</span>
              <span>•</span>
              <span>{row.original.targetSeries.granularity}</span>
              <span>•</span>
              <span>{row.original.horizon} horizon</span>
              {row.original.regressors.length > 0 && (
                <>
                  <span>•</span>
                  <span>{row.original.regressors.length} regressor(s)</span>
                </>
              )}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'model',
        header: 'Model',
        cell: ({ row }) => <span className="text-sm">{row.original.model}</span>,
      },
      {
        accessorKey: 'lastRunAt',
        header: 'Last run',
        cell: ({ row }) => {
          const value = row.original.lastRunAt;
          if (!value) return <span className="text-xs text-muted-foreground">—</span>;
          const date = new Date(value);
          return (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(date, { addSuffix: true })}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/forecasts/${row.original.id}`}>
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                Open
              </Link>
            </Button>
            <RunForecastButton forecast={row.original} />
            <DeleteForecastButton forecast={row.original} />
          </div>
        ),
        enableSorting: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: 'includesString',
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Forecasts</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Input
              value={globalFilter ?? ''}
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="Search forecasts…"
              aria-label="Search forecasts"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void forecastsQuery.refetch()}
              disabled={forecastsQuery.isFetching}
              className="gap-2"
            >
              {forecastsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Refresh
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" aria-hidden />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Forecast</DialogTitle>
                  <DialogDescription>
                    Create a forecast from an existing time series.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  {/* Target Series Section */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Target series (what to predict)</div>
                    <Select value={createSeriesId} onValueChange={setCreateSeriesId}>
                      <SelectTrigger aria-label="Select a target series">
                        <SelectValue placeholder="Select target series" />
                      </SelectTrigger>
                      <SelectContent>
                        {(seriesQuery.data?.series ?? []).map((series) => (
                          <SelectItem key={series.id} value={series.id}>
                            {series.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {seriesQuery.isLoading ? (
                      <div className="text-xs text-muted-foreground">Loading series…</div>
                    ) : (seriesQuery.data?.series?.length ?? 0) === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        No time series yet. Import one from{' '}
                        <Link href="/sources" className="underline underline-offset-4">
                          Data Sources
                        </Link>
                        .
                      </div>
                    ) : null}
                  </div>

                  {/* Regressors Section - Only for Prophet */}
                  {createModel === 'PROPHET' && createSeriesId && availableRegressors.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        Regressors <span className="font-normal text-slate-400">(optional - features that help predict)</span>
                      </div>
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-white/10">
                        {availableRegressors.map((series) => {
                          const isSelected = selectedRegressors.some((r) => r.seriesId === series.id);
                          const regressor = selectedRegressors.find((r) => r.seriesId === series.id);
                          return (
                            <div key={series.id} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleRegressor(series.id)}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                  isSelected
                                    ? 'border-brand-teal-500 bg-brand-teal-500 text-white dark:border-brand-cyan dark:bg-brand-cyan'
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3" />}
                              </button>
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="truncate text-sm">{series.name}</span>
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  {series.source === 'GOOGLE_TRENDS' ? 'Trends' : series.source === 'CSV_UPLOAD' ? 'CSV' : series.source}
                                </Badge>
                              </div>
                              {isSelected && (
                                <Select
                                  value={regressor?.futureMode ?? 'FORECAST'}
                                  onValueChange={(value) => updateRegressorMode(series.id, value as RegressorFutureMode)}
                                >
                                  <SelectTrigger className="h-7 w-32 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="FORECAST">Auto-forecast</SelectItem>
                                    <SelectItem value="USER_INPUT">User provides</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        <strong>Auto-forecast:</strong> System forecasts this regressor first. <strong>User provides:</strong> You&apos;ll enter future values.
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Name (optional)</div>
                    <Input
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder={selectedSeries ? `${selectedSeries.name} (${createModel})` : `${createModel} Forecast`}
                      aria-label="Forecast name"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Model</div>
                      <Select value={createModel} onValueChange={(value) => setCreateModel(value as ForecastModel)}>
                        <SelectTrigger aria-label="Forecast model">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PROPHET">Prophet</SelectItem>
                          <SelectItem value="ETS">ETS (Auto)</SelectItem>
                          <SelectItem value="ARIMA">Auto-ARIMA</SelectItem>
                          <SelectItem value="THETA">Theta</SelectItem>
                          <SelectItem value="NEURALPROPHET">NeuralProphet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Horizon (periods)</div>
                      <Input
                        value={createHorizon}
                        onChange={(event) => setCreateHorizon(event.target.value)}
                        type="number"
                        min={1}
                        max={3650}
                        step={1}
                        aria-label="Forecast horizon"
                      />
                      <div className="text-xs text-muted-foreground">
                        Horizon is measured in series periods ({selectedSeries?.granularity ?? 'DAILY'}).
                      </div>
                    </div>
                  </div>

                  {createModel === 'PROPHET' || createModel === 'NEURALPROPHET' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Interval width</div>
                        <Input
                          value={prophetIntervalWidth}
                          onChange={(event) => setProphetIntervalWidth(event.target.value)}
                          type="number"
                          step="0.05"
                          min={0.5}
                          max={0.99}
                          aria-label="Prophet interval width"
                        />
                        <div className="text-xs text-muted-foreground">Common values: 0.8, 0.9, 0.95.</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Uncertainty samples</div>
                        <Input
                          value={prophetUncertaintySamples}
                          onChange={(event) => setProphetUncertaintySamples(event.target.value)}
                          type="number"
                          step={1}
                          min={0}
                          max={2000}
                          aria-label="Prophet uncertainty samples"
                        />
                        <div className="text-xs text-muted-foreground">Set to 0 to disable intervals.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Season length</div>
                        <Input
                          value={etsSeasonLength}
                          onChange={(event) => setEtsSeasonLength(event.target.value)}
                          type="number"
                          step={1}
                          min={1}
                          max={365}
                          aria-label="ETS season length"
                        />
                        <div className="text-xs text-muted-foreground">
                          Defaults to 7 for daily series, 52 for weekly.
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Interval level</div>
                        <Input
                          value={etsIntervalLevel}
                          onChange={(event) => setEtsIntervalLevel(event.target.value)}
                          type="number"
                          step="0.05"
                          min={0.5}
                          max={0.99}
                          aria-label="ETS interval level"
                        />
                        <div className="text-xs text-muted-foreground">Common values: 0.8, 0.9, 0.95.</div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Spec</div>
                        <Input
                          value={etsSpec}
                          onChange={(event) => setEtsSpec(event.target.value)}
                          aria-label="ETS spec"
                        />
                        <div className="text-xs text-muted-foreground">Use ZZZ for full auto selection.</div>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void createMutation.mutateAsync()}
                    disabled={
                      createMutation.isPending ||
                      !createSeriesId ||
                      !parseHorizon(createHorizon)
                    }
                    className="gap-2"
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-4 w-4" aria-hidden />
                    )}
                    Create & Run
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {forecastsQuery.isLoading ? (
                <SkeletonTable rows={5} columns={columns.length} />
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    No forecasts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-0">
          <div className="text-xs text-muted-foreground">
            {table.getFilteredRowModel().rows.length} forecast(s)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
