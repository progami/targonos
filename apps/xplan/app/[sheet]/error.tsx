'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { withAppBasePath } from '@/lib/base-path';

export default function SheetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[xplan][sheet-error]', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-sm dark:border-rose-500/40 dark:bg-rose-500/10">
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-rose-900 dark:text-rose-200">
            xplan couldn&apos;t load this sheet
          </h2>
          <p className="text-sm text-rose-900/80 dark:text-rose-100/80">
            Required strategy data failed to load. This is now treated as an error (no silent
            fallbacks).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Button asChild type="button" variant="outline">
            <Link href={withAppBasePath('/1-setup')}>Go to setup</Link>
          </Button>
        </div>

        <details className="rounded-lg border border-rose-200 bg-white/70 p-3 text-xs text-slate-900 dark:border-white/10 dark:bg-black/20 dark:text-slate-200">
          <summary className="cursor-pointer font-semibold">Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}</pre>
        </details>
      </div>
    </div>
  );
}
