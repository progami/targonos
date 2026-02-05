import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const recentRuns = await prisma.captureRun.findMany({
    take: 20,
    orderBy: { startedAt: 'desc' },
    include: { target: true },
  });

  const blockedJobs = await prisma.captureJob.findMany({
    where: { status: 'BLOCKED' },
    take: 20,
    orderBy: { scheduledAt: 'desc' },
    include: { target: true, run: true },
  });

  return (
    <main className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Recent captures + blocked queue.</p>
        </div>
        <Link href="/targets/new" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">
          New target
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Recent runs</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Changed</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/targets/${run.targetId}`} className="font-medium text-slate-900 hover:underline">
                        {run.target.label}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {run.target.type} · {run.target.marketplace}
                      </div>
                    </td>
                    <td className="px-4 py-3">{run.changeSummary ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {recentRuns.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                      No runs yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-800">Blocked queue</h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Run</th>
                </tr>
              </thead>
              <tbody>
                {blockedJobs.map((job) => (
                  <tr key={job.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{new Date(job.scheduledAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/targets/${job.targetId}`} className="font-medium text-slate-900 hover:underline">
                        {job.target.label}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">
                        {job.target.type} · {job.target.marketplace}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{job.runId ? job.runId.slice(0, 8) : ''}</td>
                  </tr>
                ))}
                {blockedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                      No blocked jobs.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
