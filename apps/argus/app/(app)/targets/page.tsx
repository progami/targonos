import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function TargetsPage() {
  const targets = await prisma.watchTarget.findMany({ orderBy: [{ createdAt: 'desc' }] });

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Targets</h1>
        <Link href="/targets/new" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">
          New target
        </Link>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Marketplace</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Next run</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/targets/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {t.label}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">
                    {t.asin ? `ASIN ${t.asin}` : t.keyword ? `k=${t.keyword}` : t.sourceUrl ? t.sourceUrl : null}
                  </div>
                </td>
                <td className="px-4 py-3">{t.type}</td>
                <td className="px-4 py-3">{t.marketplace}</td>
                <td className="px-4 py-3">{t.owner}</td>
                <td className="px-4 py-3">{t.enabled ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">{t.cadenceMinutes}m</td>
                <td className="px-4 py-3">{new Date(t.nextRunAt).toLocaleString()}</td>
              </tr>
            ))}
            {targets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                  No targets yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

