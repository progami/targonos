'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { parseSkuBrandMappingCsv } from '@/lib/sku-brand-mapping';

type AllocationResponse = {
  allocation: {
    invoice: string;
    market: string;
    allocationsByBucket: Record<string, Array<{ brand: string; amount: number }>>;
  };
};

type InvoiceSummary = {
  invoice: string;
  minDate: string;
  maxDate: string;
  rowCount: number;
  skuCount: number;
};

type AuditAnalysisResponse = {
  fileName: string;
  rowCount: number;
  minDate: string;
  maxDate: string;
  invoiceSummaries: InvoiceSummary[];
  selectedInvoice?: string;
  skus?: string[];
};

type UiMapping = {
  skus: Array<{ sku: string; brand: string }>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default function SettlementsPage() {
  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AuditAnalysisResponse | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [skuList, setSkuList] = useState<string[]>([]);
  const [skuToBrand, setSkuToBrand] = useState<Record<string, string>>({});

  const [brands, setBrands] = useState<string[]>(['US-Dust Sheets', 'UK-Dust Sheets']);
  const [newBrand, setNewBrand] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AllocationResponse | null>(null);

  const invoiceOptions = useMemo(() => {
    if (!analysis) return [];
    return analysis.invoiceSummaries.map((s) => s.invoice);
  }, [analysis]);

  const missingSkus = useMemo(() => {
    const missing: string[] = [];
    for (const sku of skuList) {
      const mapped = skuToBrand[sku];
      if (!mapped) missing.push(sku);
    }
    return missing;
  }, [skuList, skuToBrand]);

  const canCompute = useMemo(() => {
    if (!auditFile) return false;
    if (!selectedInvoice) return false;
    if (skuList.length === 0) return false;
    if (missingSkus.length > 0) return false;
    return true;
  }, [auditFile, missingSkus.length, selectedInvoice, skuList.length]);

  const onPickAuditFile = (file: File | null) => {
    setAuditFile(file);
    setAnalysis(null);
    setSelectedInvoice('');
    setSkuList([]);
    setSkuToBrand({});
    setResult(null);
    setError(null);
  };

  const analyzeFile = async () => {
    setError(null);
    setResult(null);
    setAnalysis(null);
    setAnalyzing(true);

    try {
      if (!auditFile) {
        throw new Error('Upload an audit ZIP/CSV');
      }

      const form = new FormData();
      form.set('file', auditFile);

      const res = await fetch('/api/plutus/audit-data/analyze', {
        method: 'POST',
        body: form,
      });

      const body = (await res.json()) as AuditAnalysisResponse | { error: string; details?: string };
      if (!res.ok) {
        if ('details' in body && body.details) throw new Error(body.details);
        if ('error' in body) throw new Error(body.error);
        throw new Error('Analyze failed');
      }

      const parsed = body as AuditAnalysisResponse;
      setAnalysis(parsed);

      if (parsed.invoiceSummaries.length === 1) {
        const only = parsed.invoiceSummaries[0];
        if (only) setSelectedInvoice(only.invoice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const loadSkusForInvoice = async () => {
    setError(null);
    setLoadingSkus(true);

    try {
      if (!auditFile) {
        throw new Error('Upload an audit ZIP/CSV');
      }
      if (!selectedInvoice) {
        throw new Error('Select an invoice');
      }

      const form = new FormData();
      form.set('file', auditFile);
      form.set('invoice', selectedInvoice);

      const res = await fetch('/api/plutus/audit-data/analyze', {
        method: 'POST',
        body: form,
      });

      const body = (await res.json()) as AuditAnalysisResponse | { error: string; details?: string };
      if (!res.ok) {
        if ('details' in body && body.details) throw new Error(body.details);
        if ('error' in body) throw new Error(body.error);
        throw new Error('Load SKUs failed');
      }

      const parsed = body as AuditAnalysisResponse;
      const skus = parsed.skus ? parsed.skus : [];
      skus.sort((a, b) => a.localeCompare(b));
      setSkuList(skus);

      const next: Record<string, string> = {};
      for (const sku of skus) {
        const existing = skuToBrand[sku];
        next[sku] = existing ? existing : '';
      }
      setSkuToBrand(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSkus(false);
    }
  };

  const applyMappingCsv = async (file: File) => {
    setError(null);

    try {
      const text = await file.text();
      const parsed = parseSkuBrandMappingCsv(text);

      const next = { ...skuToBrand };
      for (const row of parsed.rows) {
        next[row.sku] = row.brand;
      }
      setSkuToBrand(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const compute = async () => {
    setError(null);
    setResult(null);
    setComputing(true);

    try {
      if (!auditFile) {
        throw new Error('Upload an audit ZIP/CSV');
      }
      if (!selectedInvoice) {
        throw new Error('Select an invoice');
      }
      if (skuList.length === 0) {
        throw new Error('Load SKUs first');
      }
      if (missingSkus.length > 0) {
        throw new Error(`Missing brand mapping for ${missingSkus.length} SKU(s)`);
      }

      const mapping: UiMapping = {
        skus: skuList.map((sku) => ({
          sku,
          brand: skuToBrand[sku] as string,
        })),
      };

      const form = new FormData();
      form.set('file', auditFile);
      form.set('invoice', selectedInvoice);
      form.set('mapping', JSON.stringify(mapping));

      const res = await fetch('/api/plutus/fee-allocation', {
        method: 'POST',
        body: form,
      });

      const body = (await res.json()) as AllocationResponse | { error: string; details?: string };
      if (!res.ok) {
        if ('details' in body && body.details) throw new Error(body.details);
        if ('error' in body) throw new Error(body.error);
        throw new Error('Compute failed');
      }

      setResult(body as AllocationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setComputing(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 mb-4"
          >
            ← Back to Plutus
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settlements</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Drag & drop your LinkMyBooks audit export (ZIP/CSV). Pick the invoice, map SKUs to brands, compute allocation.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div
              className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-5 text-slate-700 transition-colors hover:border-brand-teal-500/60 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files.item(0);
                onPickAuditFile(dropped ? dropped : null);
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">1) Upload audit file</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">ZIP containing CSV, or a raw CSV.</p>
                </div>

                <Input
                  type="file"
                  accept=".zip,.csv,application/zip,text/csv"
                  onChange={(e) => onPickAuditFile(e.target.files ? e.target.files[0] : null)}
                />
              </div>

              {auditFile && (
                <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Selected: <span className="font-mono">{auditFile.name}</span> ({formatBytes(auditFile.size)})
                </div>
              )}
            </div>

            <Button type="button" onClick={analyzeFile} disabled={analyzing || !auditFile} variant="outline">
              {analyzing ? 'Analyzing…' : 'Analyze'}
            </Button>

            {analysis && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Audit summary</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {analysis.fileName} · {analysis.rowCount.toLocaleString()} rows · {analysis.minDate} → {analysis.maxDate}
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    <Select value={selectedInvoice} onValueChange={(v) => setSelectedInvoice(v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoiceOptions.map((inv) => (
                          <SelectItem key={inv} value={inv}>
                            {inv}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>SKUs</TableHead>
                        <TableHead>Date range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.invoiceSummaries.map((s) => (
                        <TableRow key={s.invoice}>
                          <TableCell className="font-mono">{s.invoice}</TableCell>
                          <TableCell className="font-mono">{s.rowCount.toLocaleString()}</TableCell>
                          <TableCell className="font-mono">{s.skuCount.toLocaleString()}</TableCell>
                          <TableCell className="font-mono">
                            {s.minDate} → {s.maxDate}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Button
                  type="button"
                  onClick={loadSkusForInvoice}
                  disabled={loadingSkus || !selectedInvoice}
                  variant="outline"
                >
                  {loadingSkus ? 'Loading SKUs…' : 'Load SKUs'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">2) Map SKUs to brands</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {skuList.length.toLocaleString()} SKUs loaded · {missingSkus.length.toLocaleString()} unmapped
                </p>
              </div>

              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files ? e.target.files[0] : null;
                  if (f) void applyMappingCsv(f);
                }}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={brands.join(', ')}
                onChange={(e) => {
                  const next = e.target.value
                    .split(',')
                    .map((b) => b.trim())
                    .filter((b) => b !== '');
                  setBrands(next);
                }}
                placeholder="Brands (comma separated)"
              />
              <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="Add brand" />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const trimmed = newBrand.trim();
                  if (trimmed === '') return;
                  if (brands.includes(trimmed)) return;
                  setBrands([...brands, trimmed]);
                  setNewBrand('');
                }}
              >
                Add
              </Button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Brand</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skuList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm text-slate-500 dark:text-slate-400">
                          Load SKUs by selecting an invoice and clicking “Load SKUs”.
                        </TableCell>
                      </TableRow>
                    )}
                    {skuList.map((sku) => (
                      <TableRow key={sku}>
                        <TableCell className="font-mono">{sku}</TableCell>
                        <TableCell>
                          <Select
                            value={skuToBrand[sku] ? skuToBrand[sku] : ''}
                            onValueChange={(value) => {
                              setSkuToBrand({
                                ...skuToBrand,
                                [sku]: value,
                              });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select brand" />
                            </SelectTrigger>
                            <SelectContent>
                              {brands.map((b) => (
                                <SelectItem key={b} value={b}>
                                  {b}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
              <Button
                type="button"
                onClick={compute}
                disabled={computing || !canCompute}
                className="bg-teal-500 hover:bg-teal-600 text-white"
              >
                {computing ? 'Computing…' : 'Compute Allocation'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Allocation Result</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Invoice: {result.allocation.invoice} · Market: {result.allocation.market}
                </p>
              </div>

              <div className="space-y-3">
                {Object.entries(result.allocation.allocationsByBucket).map(([bucket, allocations]) => {
                  if (allocations.length === 0) return null;

                  return (
                    <div key={bucket} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{bucket}</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {allocations.map((a, idx) => (
                          <div key={`${a.brand}-${idx}`} className="text-sm flex justify-between">
                            <span className="text-slate-600 dark:text-slate-300">{a.brand}</span>
                            <span className="font-mono text-slate-900 dark:text-slate-100">{a.amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
