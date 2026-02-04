import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
  const targets = await prisma.watchTarget.findMany({
    where: { type: 'BROWSE_BESTSELLERS' },
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
  });

  return (
    <main className="p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Market</h1>
        <Link href="/targets/new" className="text-sm text-slate-600 hover:underline">
          Add bestsellers target
        </Link>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3">Marketplace</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Tracked</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link href={`/targets/${t.id}`} className="font-medium text-slate-900 hover:underline">
                    {t.label}
                  </Link>
                </td>
                <td className="px-4 py-3">{t.marketplace}</td>
                <td className="px-4 py-3">
                  {t.sourceUrl ? (
                    <a href={t.sourceUrl} target="_blank" rel="noreferrer" className="text-slate-700 hover:underline">
                      Open
                    </a>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{t.trackedAsins.length}</td>
              </tr>
            ))}
            {targets.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                  No bestsellers targets yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}

