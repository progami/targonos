'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';

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
    <button
      type="button"
      onClick={onClick}
      disabled={running}
      className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {running ? 'Queued…' : 'Run now'}
    </button>
  );
}

