'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';

export function RunNowButton(props: { targetId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function onClick() {
    setRunning(true);
    try {
      const response = await fetch(withAppBasePath(`/api/targets/${props.targetId}/run-now`), { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${response.status})`);
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={running} size="sm">
      {running ? (
        <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Queued</>
      ) : (
        <><Play className="mr-1.5 h-3.5 w-3.5" />Capture Now</>
      )}
    </Button>
  );
}
