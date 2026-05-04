'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  Compass,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Leaf,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchJson } from '@/lib/api/client';
import { getTimeSeriesCsvPath } from '@/lib/source-api';
import type { TimeSeriesListItem } from '@/types/kairos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ============================================================================
// Types
// ============================================================================

type TimeSeriesResponse = {
  series: TimeSeriesListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type GoogleTrendsImportResponse = {
  series: TimeSeriesListItem;
  import: {
    mode: 'CACHED' | 'MERGE' | 'REPLACE' | 'CREATE';
    insertedPoints: number;
    deletedPoints: number;
    totalPoints: number;
  };
};

type GoogleTrendsTimeRange = 'PAST_12_MONTHS' | 'PAST_2_YEARS' | 'PAST_5_YEARS' | 'ALL_TIME';

type GoogleTrendsImportInput = {
  keyword: string;
  geo: string;
  timeRange: GoogleTrendsTimeRange;
  name: string;
  force: boolean;
};

type CSVImportResponse = {
  series: Array<{
    id: string;
    name: string;
    source: string;
    granularity: string;
    query: string;
    geo: string | null;
    pointsCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
  import: {
    mode: string;
    seriesCount: number;
    totalPoints: number;
  };
};

type CSVPreviewResponse = {
  preview: {
    headers: string[];
    rows: string[][];
  };
};

type DataSourceType = 'google-trends' | 'csv-upload' | 'brand-analytics' | 'marketplace-guidance' | 'jungle-scout';

type DataSource = {
  id: DataSourceType;
  name: string;
  description: string;
  icon: React.ReactNode;
  available: boolean;
  color: string;
  bgLight: string;
  bgDark: string;
};

// ============================================================================
// Constants
// ============================================================================

const SERIES_QUERY_KEY = ['kairos', 'time-series'] as const;

const GOOGLE_TRENDS_TIME_RANGE_OPTIONS: Array<{ value: GoogleTrendsTimeRange; label: string }> = [
  { value: 'PAST_12_MONTHS', label: 'Past 12 months' },
  { value: 'PAST_2_YEARS', label: 'Past 2 years' },
  { value: 'PAST_5_YEARS', label: 'Past 5 years' },
  { value: 'ALL_TIME', label: 'All time (2004-present)' },
];

const GOOGLE_TRENDS_REGION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'WORLDWIDE', label: 'Worldwide' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
  { value: 'IN', label: 'India' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'SG', label: 'Singapore' },
  { value: 'AE', label: 'United Arab Emirates' },
];

const DATA_SOURCES: DataSource[] = [
  {
    id: 'google-trends',
    name: 'Google Trends',
    description: 'Search interest over time for any keyword',
    icon: <TrendingUp className="h-5 w-5" />,
    available: true,
    color: 'text-brand-teal-600 dark:text-brand-cyan',
    bgLight: 'bg-brand-teal-500/10',
    bgDark: 'dark:bg-brand-cyan/10',
  },
  {
    id: 'csv-upload',
    name: 'CSV Upload',
    description: 'Import sales, promos, or any time series data',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    available: true,
    color: 'text-blue-600 dark:text-blue-400',
    bgLight: 'bg-blue-500/10',
    bgDark: 'dark:bg-blue-500/10',
  },
  {
    id: 'brand-analytics',
    name: 'Brand Analytics',
    description: 'Amazon search frequency and conversion data',
    icon: <BarChart3 className="h-5 w-5" />,
    available: false,
    color: 'text-amber-600 dark:text-amber-400',
    bgLight: 'bg-amber-500/10',
    bgDark: 'dark:bg-amber-500/10',
  },
  {
    id: 'marketplace-guidance',
    name: 'Marketplace Guidance',
    description: 'Category trends and opportunity signals',
    icon: <Compass className="h-5 w-5" />,
    available: false,
    color: 'text-violet-600 dark:text-violet-400',
    bgLight: 'bg-violet-500/10',
    bgDark: 'dark:bg-violet-500/10',
  },
  {
    id: 'jungle-scout',
    name: 'Jungle Scout',
    description: 'Product research and sales estimates',
    icon: <Leaf className="h-5 w-5" />,
    available: false,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgLight: 'bg-emerald-500/10',
    bgDark: 'dark:bg-emerald-500/10',
  },
];

// ============================================================================
// Utilities
// ============================================================================

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveStartDate(timeRange: GoogleTrendsTimeRange, now: Date) {
  if (timeRange === 'ALL_TIME') {
    return new Date('2004-01-01T00:00:00.000Z');
  }

  const start = new Date(now);
  switch (timeRange) {
    case 'PAST_12_MONTHS':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'PAST_2_YEARS':
      start.setFullYear(start.getFullYear() - 2);
      break;
    case 'PAST_5_YEARS':
      start.setFullYear(start.getFullYear() - 5);
      break;
    default:
      break;
  }
  return start;
}

function formatIsoDate(value: string | null | undefined) {
  if (!value) return null;
  return value.length >= 10 ? value.slice(0, 10) : value;
}

// ============================================================================
// Source Selection Component
// ============================================================================

function SourceCard({
  source,
  onSelect,
}: {
  source: DataSource;
  onSelect: (id: DataSourceType) => void;
}) {
  return (
    <button
      onClick={() => source.available && onSelect(source.id)}
      disabled={!source.available}
      className={`
        group relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all
        ${source.available
          ? 'border-slate-200 bg-white hover:border-brand-teal-300 hover:shadow-soft dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-brand-cyan/30 dark:hover:bg-white/[0.04]'
          : 'cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-60 dark:border-white/5 dark:bg-white/[0.01]'
        }
      `}
    >
      {/* Icon */}
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${source.bgLight} ${source.bgDark}`}>
        <span className={source.color}>{source.icon}</span>
      </div>

      {/* Content */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900 dark:text-white">{source.name}</span>
          {!source.available && (
            <Badge variant="secondary" className="text-[10px]">
              Coming Soon
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{source.description}</p>
      </div>

      {/* Hover indicator */}
      {source.available && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 scale-x-0 bg-gradient-to-r from-brand-teal-500 to-brand-cyan transition-transform group-hover:scale-x-100 dark:from-brand-cyan dark:to-brand-teal-400" />
      )}
    </button>
  );
}

// ============================================================================
// Google Trends Form Component
// ============================================================================

function GoogleTrendsForm({
  onSubmit,
  onBack,
  isPending,
}: {
  onSubmit: (data: GoogleTrendsImportInput) => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const [keyword, setKeyword] = useState('');
  const [geo, setGeo] = useState('WORLDWIDE');
  const [timeRange, setTimeRange] = useState<GoogleTrendsTimeRange>('PAST_2_YEARS');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    // Convert 'WORLDWIDE' back to empty string for API
    const geoValue = geo === 'WORLDWIDE' ? '' : geo;
    onSubmit({ keyword, geo: geoValue, timeRange, name, force: true });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal-500/10 dark:bg-brand-cyan/10">
            <TrendingUp className="h-4 w-4 text-brand-teal-600 dark:text-brand-cyan" />
          </div>
          <span className="font-medium text-slate-900 dark:text-white">Google Trends</span>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Search Keyword
          </label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. collagen peptides, vitamin d3"
            className="h-10"
            autoFocus
          />
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Enter the search term to track interest over time
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Region
            </label>
            <Select value={geo} onValueChange={setGeo}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_TRENDS_REGION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value || 'worldwide'} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Time Range
            </label>
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as GoogleTrendsTimeRange)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOOGLE_TRENDS_TIME_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Series Name <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-generated from keyword if blank"
            className="h-10"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button type="submit" disabled={!keyword.trim() || isPending} className="gap-2">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Import Series
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// CSV Upload Form Component
// ============================================================================

function CSVUploadForm({
  onSubmit,
  onBack,
  isPending,
}: {
  onSubmit: (formData: FormData) => void;
  onBack: () => void;
  isPending: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [name, setName] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [valueColumn, setValueColumn] = useState('');
  const [productColumn, setProductColumn] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview(null);
    setDateColumn('');
    setValueColumn('');
    setProductColumn('');

    // Get preview
    setIsLoadingPreview(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('preview', 'true');

      const response = await fetch(getTimeSeriesCsvPath(), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Failed to preview CSV');
      }

      const data = (await response.json()) as CSVPreviewResponse;
      setPreview(data.preview);

      // Auto-select columns if common names found
      const headers = data.preview.headers.map((h) => h.toLowerCase());
      const dateIdx = headers.findIndex((h) =>
        ['date', 'time', 'timestamp', 'day', 'week'].includes(h),
      );
      const valueIdx = headers.findIndex((h) =>
        ['value', 'units', 'sales', 'quantity', 'amount', 'count'].includes(h),
      );
      const productIdx = headers.findIndex((h) =>
        ['product', 'sku', 'asin', 'item', 'product_id', 'product_name'].includes(h),
      );

      if (dateIdx >= 0) setDateColumn(data.preview.headers[dateIdx]);
      if (valueIdx >= 0) setValueColumn(data.preview.headers[valueIdx]);
      if (productIdx >= 0) setProductColumn(data.preview.headers[productIdx]);

      // Auto-generate name from filename
      if (!name) {
        const baseName = selectedFile.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
        setName(baseName);
      }
    } catch (error) {
      toast.error('Preview failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name.trim() || !dateColumn || !valueColumn) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name.trim());
    formData.append('dateColumn', dateColumn);
    formData.append('valueColumn', valueColumn);
    if (productColumn) formData.append('productColumn', productColumn);

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/10">
            <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="font-medium text-slate-900 dark:text-white">CSV Upload</span>
        </div>
      </div>

      {/* File upload */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            CSV File
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-blue-500/30 dark:hover:bg-white/[0.04]"
          >
            {isLoadingPreview ? (
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            ) : (
              <Upload className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            )}
            {file ? (
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </span>
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Drop CSV file here or click to browse
              </span>
            )}
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Supports .csv files up to 10MB
            </span>
          </button>
        </div>

        {/* Preview table */}
        {preview && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Preview (first {preview.rows.length} rows)
            </label>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5">
                    {preview.headers.map((header, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-2 text-slate-500 dark:text-slate-400">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Column mapping */}
        {preview && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Date Column *
                </label>
                <Select value={dateColumn} onValueChange={setDateColumn}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select date column" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Value Column *
                </label>
                <Select value={valueColumn} onValueChange={setValueColumn}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select value column" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.headers.map((header) => (
                      <SelectItem key={header} value={header}>
                        {header}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Product Column <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Select value={productColumn || '__NONE__'} onValueChange={(v) => setProductColumn(v === '__NONE__' ? '' : v)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="None - import as single series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">None - import as single series</SelectItem>
                  {preview.headers.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                If selected, creates separate series for each unique product value
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Series Name *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nike Air Max Sales"
                className="h-10"
              />
            </div>
          </>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-white/5">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!file || !name.trim() || !dateColumn || !valueColumn || isPending}
          className="gap-2"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Import Series
        </Button>
      </div>
    </form>
  );
}

// ============================================================================
// Import Modal Component
// ============================================================================

function ImportModal({
  open,
  onOpenChange,
  onGoogleTrendsImport,
  onCSVImport,
  isPendingGoogleTrends,
  isPendingCSV,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoogleTrendsImport: (data: GoogleTrendsImportInput) => Promise<void>;
  onCSVImport: (formData: FormData) => Promise<void>;
  isPendingGoogleTrends: boolean;
  isPendingCSV: boolean;
}) {
  const [selectedSource, setSelectedSource] = useState<DataSourceType | null>(null);

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => setSelectedSource(null), 200);
  };

  const handleGoogleTrendsImport = async (data: GoogleTrendsImportInput) => {
    await onGoogleTrendsImport(data);
    handleClose();
  };

  const handleCSVImport = async (formData: FormData) => {
    await onCSVImport(formData);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        {selectedSource === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-brand-teal-500 dark:text-brand-cyan" />
                Import Data Source
              </DialogTitle>
              <DialogDescription>
                Select a data source to import time series for forecasting
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              {DATA_SOURCES.map((source) => (
                <SourceCard key={source.id} source={source} onSelect={setSelectedSource} />
              ))}
            </div>
          </>
        ) : selectedSource === 'google-trends' ? (
          <GoogleTrendsForm
            onSubmit={handleGoogleTrendsImport}
            onBack={() => setSelectedSource(null)}
            isPending={isPendingGoogleTrends}
          />
        ) : selectedSource === 'csv-upload' ? (
          <CSVUploadForm
            onSubmit={handleCSVImport}
            onBack={() => setSelectedSource(null)}
            isPending={isPendingCSV}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DataSourcesPanel() {
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 10;

  // Query
  const sort = sorting[0]?.id === 'name' ? 'name' : 'updatedAt';
  const dir = sorting[0]?.id ? (sorting[0]?.desc ? 'desc' : 'asc') : 'desc';
  const search = globalFilter.trim();

  const seriesQuery = useQuery({
    queryKey: [...SERIES_QUERY_KEY, { search, pageIndex, pageSize, sort, dir }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(pageIndex + 1));
      params.set('pageSize', String(pageSize));
      params.set('sort', sort);
      params.set('dir', dir);
      if (search) params.set('q', search);
      return fetchJson<TimeSeriesResponse>(`/api/v1/time-series?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  // Google Trends Mutation
  const googleTrendsMutation = useMutation({
    mutationFn: async (payload: GoogleTrendsImportInput) => {
      const now = new Date();
      const startDate = toDateInput(resolveStartDate(payload.timeRange, now));

      return fetchJson<GoogleTrendsImportResponse>('/api/v1/time-series/google-trends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          keyword: payload.keyword,
          geo: payload.geo || null,
          startDate,
          endDate: null,
          name: payload.name || undefined,
          force: payload.force,
        }),
      });
    },
    onSuccess: async (data) => {
      const summary =
        data.import.mode === 'CACHED'
          ? 'Already imported (cached).'
          : data.import.mode === 'REPLACE'
            ? `Replaced ${data.import.deletedPoints} points.`
            : data.import.mode === 'MERGE'
              ? `Added ${data.import.insertedPoints} new points.`
              : `Imported ${data.import.insertedPoints} points.`;
      toast.success('Data source imported', {
        description: `${data.series.name} — ${summary}`,
      });
      await queryClient.invalidateQueries({ queryKey: SERIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error('Import failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // CSV Upload Mutation
  const csvMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(getTimeSeriesCsvPath(), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'CSV import failed');
      }

      return response.json() as Promise<CSVImportResponse>;
    },
    onSuccess: async (data) => {
      const summary =
        data.import.seriesCount === 1
          ? `Imported ${data.import.totalPoints} points.`
          : `Created ${data.import.seriesCount} series with ${data.import.totalPoints} total points.`;
      toast.success('CSV imported', {
        description: summary,
      });
      await queryClient.invalidateQueries({ queryKey: SERIES_QUERY_KEY });
    },
    onError: (error) => {
      toast.error('CSV import failed', {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // Data
  const data = useMemo(() => seriesQuery.data?.series ?? [], [seriesQuery.data]);
  const totalCount = seriesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Columns
  const columns = useMemo<ColumnDef<TimeSeriesListItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Series
            <ArrowUpDown className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-slate-100">
              {row.original.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {row.original.source === 'GOOGLE_TRENDS'
                  ? 'Google Trends'
                  : row.original.source === 'CSV_UPLOAD'
                    ? 'CSV Upload'
                    : row.original.source}
              </Badge>
              {row.original.query && <span>{row.original.query}</span>}
              {row.original.geo && (
                <>
                  <span>-</span>
                  <span>{row.original.geo}</span>
                </>
              )}
              {row.original.sourceTitle ? (
                <>
                  <span>-</span>
                  <span className="truncate">{row.original.sourceTitle}</span>
                </>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: 'range',
        header: 'Range',
        cell: ({ row }) => {
          const start = formatIsoDate(row.original.importStartDate);
          const end = formatIsoDate(row.original.importEndDate);
          if (!start || !end) {
            return <span className="text-xs text-muted-foreground">—</span>;
          }
          return (
            <span className="text-xs tabular-nums text-muted-foreground">
              {start} → {end}
            </span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'granularity',
        header: 'Granularity',
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-[11px]">
            {row.original.granularity}
          </Badge>
        ),
      },
      {
        accessorKey: 'pointsCount',
        header: 'Points',
        cell: ({ row }) => (
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {row.original.pointsCount}
          </span>
        ),
      },
      {
        accessorKey: 'updatedAt',
        header: 'Updated',
        cell: ({ row }) => {
          const value = row.original.updatedAt;
          const date = value ? new Date(value) : null;
          if (!date || Number.isNaN(date.getTime())) {
            return <span className="text-xs text-muted-foreground">-</span>;
          }
          return (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNowStrict(date, { addSuffix: true })}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/sources/${encodeURIComponent(row.original.id)}`}>
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
                View
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/forecasts?seriesId=${encodeURIComponent(row.original.id)}`}>
                Create forecast
              </Link>
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [],
  );

  // Table
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (next) => {
      setSorting(next);
      setPageIndex(0);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const handleGoogleTrendsImport = async (data: GoogleTrendsImportInput) => {
    await googleTrendsMutation.mutateAsync(data);
  };

  const handleCSVImport = async (formData: FormData) => {
    await csvMutation.mutateAsync(formData);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Imported Series</CardTitle>
            <CardDescription>
              Time series data from external sources for forecasting
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={globalFilter ?? ''}
              onChange={(e) => {
                setGlobalFilter(e.target.value);
                setPageIndex(0);
              }}
              placeholder="Search..."
              className="h-9 w-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void seriesQuery.refetch()}
              disabled={seriesQuery.isFetching}
              className="h-9 w-9 p-0"
            >
              <RefreshCw
                className={`h-4 w-4 ${seriesQuery.isFetching ? 'animate-spin' : ''}`}
                aria-hidden
              />
            </Button>
            <Button size="sm" onClick={() => setIsModalOpen(true)} className="h-9 gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Import Data Source
            </Button>
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
                {seriesQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand-teal-500" />
                    </TableCell>
                  </TableRow>
                ) : seriesQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-32 text-center text-sm">
                      <div className="space-y-2">
                        <div className="text-muted-foreground">
                          {(seriesQuery.error as Error)?.message ?? 'Failed to load time series.'}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => void seriesQuery.refetch()}>
                          Retry
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
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
                    <TableCell
                      colSpan={columns.length}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Database className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <span>No data sources imported yet</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsModalOpen(true)}
                          className="mt-2 gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Import your first data source
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {totalCount > 0 && (
            <div className="flex flex-col items-center justify-between gap-2 px-4 sm:flex-row sm:px-0">
              <div className="text-xs text-muted-foreground">
                {totalCount} series • Page {pageIndex + 1} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageIndex((v) => Math.max(0, v - 1))}
                  disabled={pageIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageIndex((v) => Math.min(totalPages - 1, v + 1))}
                  disabled={pageIndex + 1 >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onGoogleTrendsImport={handleGoogleTrendsImport}
        onCSVImport={handleCSVImport}
        isPendingGoogleTrends={googleTrendsMutation.isPending}
        isPendingCSV={csvMutation.isPending}
      />
    </>
  );
}
