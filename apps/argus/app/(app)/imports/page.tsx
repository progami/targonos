import { prisma } from '@/lib/prisma';
import { TalosSyncButton } from '@/components/TalosSyncButton';

export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const runs = await prisma.importRun.findMany({ where: { source: 'TALOS' }, orderBy: { startedAt: 'desc' }, take: 25 });

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Imports</h1>
          <p className="mt-1 text-sm text-slate-600">Seed OURS ASIN targets from Talos (US + UK).</p>
        </div>
        <TalosSyncButton />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Skipped</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="px-4 py-3">{r.status}</td>
                <td className="px-4 py-3">{r.createdCount}</td>
                <td className="px-4 py-3">{r.updatedCount}</td>
                <td className="px-4 py-3">{r.skippedCount}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{r.error ?? ''}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  No Talos import runs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
