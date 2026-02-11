'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export function TalosSyncButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setRunning(true);
    try {
      const response = await fetch(withAppBasePath('/api/imports/talos/run'), { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={onClick} disabled={running} size="sm">
        {running ? (
          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Syncing</>
        ) : (
          <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Sync Now</>
        )}
      </Button>
      {error && <span className="text-sm text-danger-600">{error}</span>}
    </div>
  );
}
