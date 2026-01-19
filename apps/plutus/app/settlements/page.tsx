'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type AllocationResponse = {
  allocation: {
    invoice: string;
    market: string;
    allocationsByBucket: Record<string, Array<{ brand: string; amount: number }>>;
  };
};

export default function SettlementsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mappingText, setMappingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AllocationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const parsedMapping = useMemo(() => {
    if (mappingText.trim() === '') {
      return null;
    }

    return JSON.parse(mappingText) as { skus: Array<{ sku: string; brand: string }> };
  }, [mappingText]);

  const run = async () => {
    setError(null);
    setData(null);
    setLoading(true);

    try {
      if (!file) {
        throw new Error('Select an Audit Data CSV');
      }
      if (!parsedMapping) {
        throw new Error('Provide a SKU->Brand mapping JSON');
      }

      const form = new FormData();
      form.set('file', file);
      form.set('mapping', JSON.stringify(parsedMapping));

      const res = await fetch('/api/plutus/fee-allocation', {
        method: 'POST',
        body: form,
      });
      const body = (await res.json()) as AllocationResponse | { error: string; details?: string };
      if (!res.ok) {
        if ('details' in body && body.details) {
          throw new Error(body.details);
        }
        if ('error' in body) {
          throw new Error(body.error);
        }
        throw new Error('Request failed');
      }

      setData(body as AllocationResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 mb-4"
          >
            ← Back to Plutus
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settlements</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Fee-by-brand allocation (v1): allocate fee rows without SKU by units sold in the same Invoice.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">1) Upload LMB Audit Data CSV</p>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">2) SKU → Brand mapping</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                JSON format: {`{"skus":[{"sku":"CS-007","brand":"US-Dust Sheets"}]}`}
              </p>
              <textarea
                className="w-full h-40 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                value={mappingText}
                onChange={(e) => setMappingText(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}

            <Button onClick={run} disabled={loading} className="bg-teal-500 hover:bg-teal-600 text-white">
              {loading ? 'Computing…' : 'Compute Allocation'}
            </Button>
          </CardContent>
        </Card>

        {data && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Result</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Invoice: {data.allocation.invoice} · Market: {data.allocation.market}
                </p>
              </div>

              <div className="space-y-3">
                {Object.entries(data.allocation.allocationsByBucket).map(([bucket, allocations]) => {
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
