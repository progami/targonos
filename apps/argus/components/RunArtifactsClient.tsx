'use client';

import { useEffect, useState } from 'react';
import type { RunArtifact } from '@targon/prisma-argus';
import { withAppBasePath } from '@/lib/base-path';
import { Badge } from '@/components/ui/badge';
import { Loader2, ImageIcon } from 'lucide-react';

type ArtifactWithUrl = RunArtifact & { url: string };

export function RunArtifactsClient(props: { runId: string }) {
  const [artifacts, setArtifacts] = useState<ArtifactWithUrl[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      const res = await fetch(withAppBasePath(`/api/runs/${props.runId}/artifacts`));
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const json = await res.json();
      if (cancelled) return;
      setArtifacts(json.artifacts as ArtifactWithUrl[]);
    }
    load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [props.runId]);

  if (error) return <div className="text-sm text-danger-600">{error}</div>;
  if (!artifacts) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading artifacts...
      </div>
    );
  }
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6">
        <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No artifacts</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {artifacts.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-soft-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={`${a.kind}`} className="h-40 w-full object-cover" />
          <div className="p-3">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-2xs">{a.kind}</Badge>
              <Badge variant="neutral" className="text-2xs">{a.marketplace}</Badge>
            </div>
            {(a.asin || a.position) && (
              <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground">
                {a.asin && <span>ASIN {a.asin}</span>}
                {a.position && <span>#{a.position}</span>}
              </div>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
