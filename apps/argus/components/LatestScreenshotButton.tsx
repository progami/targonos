'use client';

import { useState } from 'react';
import { withAppBasePath } from '@/lib/base-path';
import { Button } from '@/components/ui/button';
import { ImageIcon, Loader2 } from 'lucide-react';

export function LatestScreenshotButton(props: { runId: string }) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(withAppBasePath(`/api/runs/${props.runId}/artifacts`));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      const artifacts = (json.artifacts as Array<{ kind: string; url: string }> | undefined) ?? [];
      const fullpage = artifacts.find((a) => a.kind === 'ASIN_FULLPAGE') ?? artifacts[0];
      if (!fullpage?.url) {
        throw new Error('No screenshot found for this run');
      }
      window.open(fullpage.url, '_blank', 'noreferrer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={busy} size="sm" variant="outline">
      {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1.5 h-3.5 w-3.5" />}
      View latest screenshot
    </Button>
  );
}

