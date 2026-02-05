'use client';

import { useEffect, useState } from 'react';
import type { RunArtifact } from '@targon/prisma-argus';
import { withAppBasePath } from '@/lib/base-path';

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

  if (error) return <div className="text-sm text-red-700">{error}</div>;
  if (!artifacts) return <div className="text-sm text-slate-500">Loading artifacts…</div>;
  if (artifacts.length === 0) return <div className="text-sm text-slate-500">No artifacts</div>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {artifacts.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="group overflow-hidden rounded border border-slate-200 bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.url} alt={`${a.kind}`} className="h-40 w-full object-cover" />
          <div className="p-2 text-xs text-slate-600">
            <div className="font-medium text-slate-800">{a.kind}</div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
              <span>{a.marketplace}</span>
              {a.asin ? <span>ASIN {a.asin}</span> : null}
              {a.position ? <span>#{a.position}</span> : null}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
