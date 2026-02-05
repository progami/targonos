import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { RunNowButton } from '@/components/RunNowButton';
import { RunArtifactsClient } from '@/components/RunArtifactsClient';
import { RunCompareClient } from '@/components/RunCompareClient';
import { TargetFormClient } from '@/components/TargetFormClient';
import { AlertRulesClient } from '@/components/AlertRulesClient';

export const dynamic = 'force-dynamic';

export default async function TargetDetailPage({ params }: { params: { id: string } }) {
  const target = await prisma.watchTarget.findUnique({
    where: { id: params.id },
    include: {
      alertRules: { orderBy: { createdAt: 'asc' } },
      runs: { take: 50, orderBy: { startedAt: 'desc' } },
      jobs: { take: 50, orderBy: { scheduledAt: 'desc' } },
    },
  });

  if (!target) return notFound();

  const runOptions = target.runs.map((r) => ({
    id: r.id,
    startedAtIso: r.startedAt.toISOString(),
    normalizedExtracted: r.normalizedExtracted,
  }));

  const alertRules = target.alertRules.map((r) => ({
    id: r.id,
    enabled: r.enabled,
    thresholds: r.thresholds,
  }));

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{target.label}</h1>
          <div className="mt-1 text-sm text-slate-600">
            {target.type} · {target.marketplace} · {target.owner} · {target.enabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>
        <RunNowButton targetId={target.id} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Edit</h2>
          <TargetFormClient
            mode="edit"
            initial={{
              id: target.id,
              type: target.type,
              marketplace: target.marketplace,
              owner: target.owner,
              label: target.label,
              asin: target.asin,
              keyword: target.keyword,
              sourceUrl: target.sourceUrl,
              trackedAsins: target.trackedAsins,
              cadenceMinutes: target.cadenceMinutes,
              enabled: target.enabled,
            }}
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Compare</h2>
          {runOptions.length >= 1 ? <RunCompareClient runs={runOptions} /> : <div className="text-sm text-slate-500">No runs yet.</div>}
        </div>
      </div>

      <div className="mt-6">
        <AlertRulesClient targetId={target.id} initialRules={alertRules} />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-slate-800">Recent runs</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Hash</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {target.runs.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.contentHash.slice(0, 12)}…</td>
                  <td className="px-4 py-3">
                    <a href={r.finalUrl} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">
                      Open
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <RunArtifactsClient runId={r.id} />
                  </td>
                </tr>
              ))}
              {target.runs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No runs yet. Queue a run to capture.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-slate-800">Recent jobs</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {target.jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{new Date(j.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{j.status}</td>
                  <td className="px-4 py-3">{j.attemptCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{j.lastError ?? ''}</td>
                </tr>
              ))}
              {target.jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No jobs yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/targets" className="text-sm text-slate-600 hover:underline">
          Back to targets
        </Link>
      </div>
    </main>
  );
}
